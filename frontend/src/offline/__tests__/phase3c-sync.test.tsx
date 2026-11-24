import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const nav = { pathname: "/en/referrals/outgoing", params: {} as Record<string, string> };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => nav.pathname,
  useParams: () => ({ locale: "en", ...nav.params }),
}));

import { createApiClient } from "../../api/client";
import { AppProviders, makeQueryClient } from "../../api/queries/provider";
import { encryptPayload, decryptPayload, generateNonExtractableAesKey } from "../crypto";
import {
  UnifiedOfflineQueueStore,
  computeBackoffMs,
  type OfflineStandardReferralPayload,
  type OfflineReferralActionPayload,
  type UnifiedTransportFn,
} from "../unifiedQueue";
import { createUnifiedSyncTransport } from "../syncTransport";
import { OfflineSyncBar } from "../../components/offline/OfflineSyncBar";

let dbCounter = 0;
function freshDb(label: string): string {
  dbCounter += 1;
  return `phase3c-test-${label}-${dbCounter}-${Date.now()}`;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Phase 3C — Unified Encrypted Offline Queue & Synchronization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── 1. Encryption & Key Management ─────────────────────────────────────────
  describe("Encryption & Key Management", () => {
    it("encrypts with AES-GCM using a unique random 96-bit IV per record and never stores plaintext PHI", async () => {
      const key = await generateNonExtractableAesKey();
      expect(key.extractable).toBe(false);

      const sample = { given_name: "Rahima", sex: "female", reason: "Postpartum hemorrhage" };
      const env1 = await encryptPayload(key, sample);
      const env2 = await encryptPayload(key, sample);

      expect(env1.iv).toHaveLength(12);
      expect(env2.iv).toHaveLength(12);
      expect(env1.iv).not.toEqual(env2.iv);
      expect(env1.ciphertext).not.toEqual(env2.ciphertext);

      const roundtrip = await decryptPayload<typeof sample>(key, env1);
      expect(roundtrip).toEqual(sample);

      // Wrong key must fail decryption
      const wrongKey = await generateNonExtractableAesKey();
      await expect(decryptPayload(wrongKey, env1)).rejects.toThrow();
    });

    it("stores zero plaintext PHI in IndexedDB and preserves record as FAILED (decryption_key_unavailable) on corruption", async () => {
      const dbName = freshDb("corrupt");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const queued = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc-1",
        facilityShortCode: "UHC01",
        payload: {
          patient_id: "pat-uuid-1",
          receiver_facility_id: "fac-dh-1",
          urgency: "urgent",
          reason: "Severe pre-eclampsia with visual disturbance",
        },
      });

      const raw = await store.inspectRawRecord(queued.queueId);
      expect(raw).toBeDefined();
      expect(JSON.stringify(raw)).not.toContain("pre-eclampsia");
      expect(JSON.stringify(raw)).not.toContain("pat-uuid-1");

      // Corrupt ciphertext on disk
      await store.corruptRawCiphertextForTesting(queued.queueId);

      const items = await store.listItemsForUser("chw-1");
      expect(items).toHaveLength(1);
      expect(items[0].syncState).toBe("FAILED");
      expect(items[0].errorKind).toBe("decryption_key_unavailable");
      expect(items[0].payload).toBeNull();

      // Record must NOT be silently deleted
      const stillRaw = await store.inspectRawRecord(queued.queueId);
      expect(stillRaw).toBeDefined();
    });

    it("recovers persisted CryptoKey and encrypted items across simulated browser reload", async () => {
      const dbName = freshDb("reload");
      const storeBefore = new UnifiedOfflineQueueStore({ dbName });

      const created = await storeBefore.enqueueOfflinePatient({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc-1",
        payload: {
          given_name: "Fatema",
          family_name: "Begum",
          sex: "female",
          estimated_age: 34,
          phone: null,
        },
      });

      // Simulate reload with a brand new store instance pointing to the same IndexedDB
      const storeAfter = new UnifiedOfflineQueueStore({ dbName });
      const items = await storeAfter.listItemsForUser("chw-1");
      expect(items).toHaveLength(1);
      expect(items[0].queueId).toBe(created.queueId);
      expect(items[0].payload).toMatchObject({ given_name: "Fatema", phone: null });
    });
  });

  // ── 2. Queue Operations, Persistence, Isolation & Single-Flight Lock ──────
  describe("Queue Operations, User Isolation & Single-Flight Lock", () => {
    it("enqueues all 4 supported item types and isolates records strictly by ownerUserId", async () => {
      const dbName = freshDb("all-types");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const pat = await store.enqueueOfflinePatient({
        ownerUserId: "chw-A",
        facilityId: "fac-1",
        payload: { given_name: "Salma", sex: "female", phone: null },
      });
      const std = await store.enqueueStandardReferral({
        ownerUserId: "chw-A",
        facilityId: "fac-1",
        facilityShortCode: "UHC01",
        dependsOnQueueId: pat.queueId,
        payload: {
          patient_id: pat.tempEntityRef!,
          receiver_facility_id: "fac-2",
          urgency: "routine",
          reason: "Antenatal follow-up",
        },
      });
      const emg = await store.enqueueEmergencyReferral({
        ownerUserId: "chw-A",
        facilityId: "fac-1",
        facilityShortCode: "UHC01",
        payload: {
          unverified_description: "Adult male ~60y chest pain",
          reason: "Suspected MI",
          urgency: "emergency",
          vitals: { recorded_at: "2026-11-24T04:00:00Z", items: [] },
          treatment_given: "Aspirin 300mg",
          receiver_facility_id: "fac-2",
        },
      });
      const act = await store.enqueueReferralAction({
        ownerUserId: "chw-A",
        facilityId: "fac-1",
        payload: {
          referral_id: "ref-server-1",
          action: "acknowledge",
          expected_version: 2,
          body: { note: "Bed ready" },
        },
      });

      // Another user on the same shared device must see ZERO of chw-A's records
      expect(await store.listItemsForUser("chw-B")).toHaveLength(0);

      const itemsA = await store.listItemsForUser("chw-A");
      expect(itemsA.map((i) => i.kind)).toEqual([
        "patient_create",
        "standard_referral",
        "emergency_referral",
        "referral_action",
      ]);
      expect(std.provisionalCode).toMatch(/^UHC01-\d{4}-\d{4}$/);
      expect(emg.provisionalCode).toMatch(/^UHC01-\d{4}-\d{4}$/);
      expect(act.provisionalCode).toBeNull();
    });

    it("enforces single-flight synchronization so concurrent triggers do not double-send", async () => {
      const dbName = freshDb("single-flight");
      const store = new UnifiedOfflineQueueStore({ dbName });

      await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-2",
          urgency: "urgent",
          reason: "High fever",
        },
      });

      let transportCalls = 0;
      const slowTransport: UnifiedTransportFn = async () => {
        transportCalls += 1;
        await new Promise((r) => setTimeout(r, 25));
        return { status: 201, body: { id: "ref-100", reference_code: "REF-2026-0100" } };
      };

      // Trigger two overlapping syncs simultaneously
      await Promise.all([
        store.syncForUser("chw-1", slowTransport),
        store.syncForUser("chw-1", slowTransport),
      ]);

      expect(transportCalls).toBe(1);
      expect(await store.listItemsForUser("chw-1")).toHaveLength(0);
    });
  });

  // ── 3. Offline Patient Dependency Resolution ───────────────────────────────
  describe("Offline Patient Dependency Resolution", () => {
    it("syncs offline-created patient first, rewrites dependent referral patient_id & system_id, and avoids duplicates", async () => {
      const dbName = freshDb("dep-ok");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const pat = await store.enqueueOfflinePatient({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        payload: {
          given_name: "Kamal",
          family_name: "Mia",
          sex: "male",
          estimated_age: 48,
          phone: null,
        },
      });
      expect(pat.tempEntityRef).toMatch(/^local-pat-/);

      const ref = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        facilityShortCode: "UHC02",
        dependsOnQueueId: pat.queueId,
        payload: {
          patient_id: pat.tempEntityRef!,
          receiver_facility_id: "fac-dh",
          urgency: "urgent",
          reason: "Uncontrolled hypertension",
        },
      });

      const sent: Array<{ kind: string; idempotencyKey: string; payload: unknown }> = [];
      const transport: UnifiedTransportFn = async (item) => {
        sent.push({ kind: item.kind, idempotencyKey: item.idempotencyKey, payload: item.payload });
        if (item.kind === "patient_create") {
          return {
            status: 201,
            body: { id: "srv-pat-uuid-77", system_id: "MWP-8K4M2N9P" },
          };
        }
        return {
          status: 201,
          body: { id: "srv-ref-uuid-88", reference_code: "REF-2026-0088" },
        };
      };

      await store.syncForUser("chw-1", transport);

      expect(sent).toHaveLength(2);
      expect(sent[0].kind).toBe("patient_create");
      expect(sent[1].kind).toBe("standard_referral");
      const sentRefPayload = sent[1].payload as OfflineStandardReferralPayload;
      expect(sentRefPayload.patient_id).toBe("srv-pat-uuid-77");
      expect(sentRefPayload.patient_system_id).toBe("MWP-8K4M2N9P");

      expect(await store.listItemsForUser("chw-1")).toHaveLength(0);
      const receipts = await store.listSyncedReceiptsForUser("chw-1");
      expect(receipts).toHaveLength(2);
      expect(receipts.find((r) => r.queueId === pat.queueId)?.serverSystemId).toBe("MWP-8K4M2N9P");
      expect(receipts.find((r) => r.queueId === ref.queueId)?.serverReferenceCode).toBe("REF-2026-0088");
    });

    it("blocks dependent referral if patient_create fails permanently, while still syncing independent items", async () => {
      const dbName = freshDb("dep-fail");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const pat = await store.enqueueOfflinePatient({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        payload: { given_name: "", sex: "unknown" },
      });
      const depRef = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        dependsOnQueueId: pat.queueId,
        payload: {
          patient_id: pat.tempEntityRef!,
          receiver_facility_id: "fac-dh",
          urgency: "routine",
          reason: "Dependent referral",
        },
      });
      const indepRef = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        payload: {
          patient_id: "existing-pat-uuid",
          receiver_facility_id: "fac-dh",
          urgency: "urgent",
          reason: "Independent referral",
        },
      });

      const attempted: string[] = [];
      const transport: UnifiedTransportFn = async (item) => {
        attempted.push(item.queueId);
        if (item.queueId === pat.queueId) {
          return { status: 400, body: { error: { code: "validation_error" } }, errorCode: "validation_error" };
        }
        return { status: 201, body: { id: "srv-indep-1", reference_code: "REF-INDEP-1" } };
      };

      await store.syncForUser("chw-1", transport);

      expect(attempted).toEqual([pat.queueId, indepRef.queueId]);
      expect(attempted).not.toContain(depRef.queueId);

      const remaining = await store.listItemsForUser("chw-1");
      expect(remaining.map((i) => i.queueId)).toEqual([pat.queueId, depRef.queueId]);
      expect(remaining[0].syncState).toBe("FAILED");
      expect(remaining[0].errorKind).toBe("validation_rejected");
      expect(remaining[1].syncState).toBe("SAVED_LOCAL");
    });
  });

  // ── 4. Ordered Referral Status Actions & Transport Mapping ─────────────────
  describe("Ordered Referral Status Actions & HTTP Transport", () => {
    it("syncs acknowledge -> start -> record_outcome in FIFO order with Idempotency-Key and If-Match", async () => {
      const dbName = freshDb("actions-fifo");
      const store = new UnifiedOfflineQueueStore({ dbName });

      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-55", action: "acknowledge", expected_version: 3, body: {} },
      });
      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-55", action: "start", expected_version: 4, body: {} },
      });
      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: {
          referral_id: "ref-55",
          action: "record_outcome",
          expected_version: 5,
          body: { summary: "Stabilized and admitted" },
        },
      });

      const recordedRequests: Array<{ path: string; idempotencyKey: string | null; ifMatch: string | null }> = [];
      const api = createApiClient({
        baseUrl: "http://localhost/api/v1",
        getCsrfToken: () => "csrf-token",
        fetchImpl: (async (req: Request) => {
          const url = new URL(req.url);
          recordedRequests.push({
            path: url.pathname,
            idempotencyKey: req.headers.get("Idempotency-Key"),
            ifMatch: req.headers.get("If-Match"),
          });
          return jsonResponse({ id: "ref-55", state: "UPDATED" }, 200);
        }) as unknown as typeof fetch,
      });

      const transport = createUnifiedSyncTransport(api);
      await store.syncForUser("doc-1", transport);

      expect(recordedRequests.map((r) => r.path)).toEqual([
        "/api/v1/referrals/ref-55/actions/acknowledge",
        "/api/v1/referrals/ref-55/actions/start",
        "/api/v1/referrals/ref-55/actions/record_outcome",
      ]);
      expect(recordedRequests.map((r) => r.ifMatch)).toEqual(["3", "4", "5"]);
      expect(recordedRequests.every((r) => Boolean(r.idempotencyKey))).toBe(true);
      expect(await store.listItemsForUser("doc-1")).toHaveLength(0);
    });

    it("stops retrying permanent transition conflict (409) without overwriting server state", async () => {
      const dbName = freshDb("action-conflict");
      const store = new UnifiedOfflineQueueStore({ dbName });

      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: {
          referral_id: "ref-55",
          action: "decline",
          expected_version: 3,
          body: { reason: "No bed" },
        } satisfies OfflineReferralActionPayload,
      });

      let calls = 0;
      const transport: UnifiedTransportFn = async () => {
        calls += 1;
        return {
          status: 409,
          body: { error: { code: "stale_version", message: "Version mismatch" } },
          errorCode: "stale_version",
        };
      };

      const t0 = 1_700_000_000_000;
      await store.syncForUser("doc-1", transport, { nowMs: t0 });
      // Subsequent automatic sync later must NOT retry permanent conflict
      await store.syncForUser("doc-1", transport, { nowMs: t0 + 300_000 });

      expect(calls).toBe(1);
      const [item] = await store.listItemsForUser("doc-1");
      expect(item.syncState).toBe("FAILED");
      expect(item.errorKind).toBe("conflict");
      expect(item.nextRetryAt).toBeNull();
    });
  });

  // ── 5. Backoff, Interrupted Network, Auth Expiry & Phase 3B Reconciliation ─
  describe("Backoff, Interrupted Network, Auth Expiry & Reconciliation", () => {
    it("respects exponential backoff after network failure and reuses exact idempotencyKey on retry", async () => {
      const dbName = freshDb("backoff-idemp");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const item = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        facilityShortCode: "UHC03",
        payload: {
          patient_id: "pat-9",
          receiver_facility_id: "fac-2",
          urgency: "urgent",
          reason: "Chest pain",
        },
      });

      const seenKeys: string[] = [];
      let failFirst = true;
      const transport: UnifiedTransportFn = async (it) => {
        seenKeys.push(it.idempotencyKey);
        if (failFirst) {
          failFirst = false;
          throw new TypeError("Failed to fetch"); // Simulates response lost mid-transfer
        }
        return { status: 200, body: { id: "srv-ref-9", reference_code: "REF-9" } };
      };

      const t0 = 1_700_000_000_000;
      await store.syncForUser("chw-1", transport, { nowMs: t0 });
      const [afterFail] = await store.listItemsForUser("chw-1");
      expect(afterFail.syncState).toBe("FAILED");
      expect(afterFail.errorKind).toBe("network_unavailable");
      expect(afterFail.retryCount).toBe(1);

      // Too early (before 5s backoff expires) -> must skip
      await store.syncForUser("chw-1", transport, { nowMs: t0 + computeBackoffMs(1) - 1000 });
      expect(seenKeys).toHaveLength(1);

      // After backoff window -> retries with the EXACT same idempotencyKey and succeeds
      await store.syncForUser("chw-1", transport, { nowMs: t0 + computeBackoffMs(1) + 500 });
      expect(seenKeys).toEqual([item.idempotencyKey, item.idempotencyKey]);
      expect(await store.listItemsForUser("chw-1")).toHaveLength(0);
    });

    it("pauses queue on 403 not_authenticated (AUTH_REQUIRED) and resumes cleanly after re-authentication", async () => {
      const dbName = freshDb("auth-expiry");
      const store = new UnifiedOfflineQueueStore({ dbName });

      await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-2",
          urgency: "routine",
          reason: "First",
        },
      });
      await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-2",
          receiver_facility_id: "fac-2",
          urgency: "routine",
          reason: "Second",
        },
      });

      let authenticated = false;
      let calls = 0;
      const transport: UnifiedTransportFn = async () => {
        calls += 1;
        if (!authenticated) {
          return {
            status: 403,
            body: { error: { code: "not_authenticated" } },
            errorCode: "not_authenticated",
          };
        }
        return { status: 201, body: { id: `srv-ref-${calls}`, reference_code: `REF-${calls}` } };
      };

      await store.syncForUser("chw-1", transport);
      // Stops immediately on first item's auth error instead of hammering all queued items
      expect(calls).toBe(1);
      const paused = await store.listItemsForUser("chw-1");
      expect(paused[0].syncState).toBe("AUTH_REQUIRED");
      expect(paused[1].syncState).toBe("SAVED_LOCAL");

      // Re-authenticate and resume
      authenticated = true;
      const resumedCount = await store.resumeAfterAuth("chw-1");
      expect(resumedCount).toBe(1);

      await store.syncForUser("chw-1", transport);
      expect(await store.listItemsForUser("chw-1")).toHaveLength(0);
      expect(await store.listSyncedReceiptsForUser("chw-1")).toHaveLength(2);
    });

    it("records reconciledPartial=true when Phase 3B server reconciles a partial intake (200 with reconciled_at)", async () => {
      const dbName = freshDb("reconcile-3b");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const item = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        facilityShortCode: "UHC09",
        payload: {
          patient_id: "pat-5",
          receiver_facility_id: "fac-dh",
          urgency: "urgent",
          reason: "Severe anemia",
        },
      });

      const api = createApiClient({
        baseUrl: "http://localhost/api/v1",
        getCsrfToken: () => "csrf",
        fetchImpl: (async () =>
          jsonResponse(
            {
              id: "partial-ref-uuid-5",
              reference_code: "REF-2026-0500",
              provisional_code: item.provisionalCode,
              is_partial: false,
              completeness_status: "RECONCILED",
              reconciled_at: "2026-11-24T05:00:00Z",
            },
            200
          )) as unknown as typeof fetch,
      });

      await store.syncForUser("chw-1", createUnifiedSyncTransport(api));

      const receipts = await store.listSyncedReceiptsForUser("chw-1");
      expect(receipts).toHaveLength(1);
      expect(receipts[0].reconciledPartial).toBe(true);
      expect(receipts[0].serverReferenceCode).toBe("REF-2026-0500");
    });
  });

  // ── 6. Minimal Sync UI Foundation (OfflineSyncBar) ─────────────────────────
  describe("OfflineSyncBar UI Foundation", () => {
    it("displays sync status, expands non-PII queue drawer, and supports Retry Now without leaking clinical text", async () => {
      const dbName = freshDb("ui-bar");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const queued = await store.enqueueStandardReferral({
        ownerUserId: "chw-ui-1",
        facilityId: "fac-uhc",
        facilityShortCode: "UHC07",
        payload: {
          patient_id: "pat-secret-uuid",
          receiver_facility_id: "fac-dh",
          urgency: "urgent",
          reason: "CONFIDENTIAL_CLINICAL_DIAGNOSIS_DO_NOT_LEAK",
        },
      });

      let allowSuccess = false;
      const client = createApiClient({
        baseUrl: "http://localhost/api/v1",
        getCsrfToken: () => "csrf",
        fetchImpl: (async (req: Request) => {
          const url = new URL(req.url);
          if (url.pathname.endsWith("/auth/me")) {
            return jsonResponse({
              id: "chw-ui-1",
              email: null,
              phone: null,
              display_name: "CHW Nasrin",
              preferred_language: "en",
              roles: ["facility_staff"],
              permissions: ["referral.create", "consent.record_assisted"],
              active_facility: { id: "fac-uhc", name: "Mirzapur UHC" },
              is_platform_admin: false,
            });
          }
          if (!allowSuccess) {
            return jsonResponse(
              { error: { code: "provider_unavailable", message: "Upstream busy" } },
              503
            );
          }
          return jsonResponse(
            {
              id: "srv-ref-ui-1",
              reference_code: "REF-2026-0707",
              reconciled_at: "2026-11-24T05:10:00Z",
            },
            200
          );
        }) as unknown as typeof fetch,
      });

      render(
        <AppProviders client={client} queryClient={makeQueryClient()}>
          <OfflineSyncBar store={store} />
        </AppProviders>
      );

      // Wait for initial mount sync attempt to fail with 503 and render the bar
      await waitFor(() => {
        expect(screen.getByTestId("offline-sync-bar")).toBeTruthy();
        expect(screen.getByText(/1 failed/i)).toBeTruthy();
      });

      // Expand queue drawer
      fireEvent.click(screen.getByRole("button", { name: /view queue/i }));
      const drawer = screen.getByTestId("offline-sync-drawer");
      expect(drawer.textContent).toContain("Standard referral");
      expect(drawer.textContent).toContain(queued.provisionalCode!);
      // Ensure zero clinical PHI is rendered in the bar or drawer
      expect(document.body.textContent).not.toContain("CONFIDENTIAL_CLINICAL_DIAGNOSIS_DO_NOT_LEAK");
      expect(document.body.textContent).not.toContain("pat-secret-uuid");

      // Now allow server to succeed and click Retry Now
      allowSuccess = true;
      fireEvent.click(screen.getByRole("button", { name: /retry now/i }));

      await waitFor(() => {
        expect(screen.getByText(/1 synced/i)).toBeTruthy();
        expect(screen.getByText(/REF-2026-0707/)).toBeTruthy();
        expect(screen.getByText(/Merged with receiving partial intake/i)).toBeTruthy();
      });
    });
  });
});
