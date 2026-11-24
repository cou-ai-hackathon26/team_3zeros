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
import {
  OfflineStorageKeyError,
  UnifiedOfflineQueueStore,
  classifyTransportError,
  computeBackoffMs,
  type UnifiedTransportFn,
} from "../unifiedQueue";
import { createUnifiedSyncTransport } from "../syncTransport";
import { OfflineSyncBar } from "../../components/offline/OfflineSyncBar";

let seq = 0;
function freshDb(label: string): string {
  seq += 1;
  return `phase3c2-hardening-${label}-${seq}-${Date.now()}`;
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("Phase 3C.2 — Critical Reliability Hardening Regression Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── Task 1 — F-2: Referral Action Ordering ─────────────────────────────────
  describe("F-2 — Per-Referral FIFO Action Ordering", () => {
    it("executes first action then second action in strict FIFO order and survives reload", async () => {
      const dbName = freshDb("f2-fifo-reload");
      const store1 = new UnifiedOfflineQueueStore({ dbName });

      const a1 = await store1.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-A", action: "acknowledge", expected_version: 2, body: {} },
      });
      const a2 = await store1.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-A", action: "start", expected_version: 3, body: {} },
      });
      expect(a2.dependsOnQueueId).toBe(a1.queueId);

      // Simulate true browser reload
      await store1.clearInMemoryKeyCacheForTesting();
      const store2 = new UnifiedOfflineQueueStore({ dbName });

      const order: string[] = [];
      const transport: UnifiedTransportFn = async (item) => {
        const p = item.payload as { action: string; expected_version?: number };
        order.push(`${p.action}:v${p.expected_version}`);
        return { status: 200, body: { id: "ref-A", state: "UPDATED" } };
      };

      // Concurrent duplicate sync triggers must not reorder or duplicate
      await Promise.all([
        store2.syncForUser("doc-1", transport),
        store2.syncForUser("doc-1", transport),
      ]);

      expect(order).toEqual(["acknowledge:v2", "start:v3"]);
      expect(await store2.listItemsForUser("doc-1")).toHaveLength(0);
    });

    it("blocks second action when first action times out, then executes both cleanly on retry", async () => {
      const dbName = freshDb("f2-timeout");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const a1 = await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-A", action: "acknowledge", expected_version: 2, body: {} },
      });
      const a2 = await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-A", action: "start", expected_version: 3, body: {} },
      });

      const attempted: Array<{ action: string; key: string }> = [];
      let failFirst = true;
      const transport: UnifiedTransportFn = async (item) => {
        const action = (item.payload as { action: string }).action;
        attempted.push({ action, key: item.idempotencyKey });
        if (action === "acknowledge" && failFirst) {
          failFirst = false;
          throw new TypeError("Network timeout");
        }
        return { status: 200, body: { id: "ref-A", state: "UPDATED" } };
      };

      const t0 = 1_700_000_000_000;
      await store.syncForUser("doc-1", transport, { nowMs: t0 });
      // Action #2 MUST NOT have been attempted while Action #1 timed out
      expect(attempted.map((x) => x.action)).toEqual(["acknowledge"]);

      // Retry after backoff -> Action #1 succeeds with SAME idempotencyKey, then Action #2 executes
      await store.syncForUser("doc-1", transport, { nowMs: t0 + computeBackoffMs(1) + 500 });
      expect(attempted.map((x) => x.action)).toEqual(["acknowledge", "acknowledge", "start"]);
      expect(attempted[0].key).toBe(a1.idempotencyKey);
      expect(attempted[1].key).toBe(a1.idempotencyKey);
      expect(attempted[2].key).toBe(a2.idempotencyKey);
      expect(await store.listItemsForUser("doc-1")).toHaveLength(0);
    });

    it("blocks second action on HTTP 500 or permanent failure while unrelated referral continues syncing", async () => {
      const dbName = freshDb("f2-500-and-unrelated");
      const store = new UnifiedOfflineQueueStore({ dbName });

      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-blocked", action: "acknowledge", expected_version: 2, body: {} },
      });
      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-blocked", action: "start", expected_version: 3, body: {} },
      });
      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-healthy", action: "acknowledge", expected_version: 1, body: {} },
      });

      const attempted: string[] = [];
      const transport: UnifiedTransportFn = async (item) => {
        const p = item.payload as { referral_id: string; action: string };
        attempted.push(`${p.referral_id}:${p.action}`);
        if (p.referral_id === "ref-blocked") {
          return { status: 500, body: {}, errorCode: "server_error" };
        }
        return { status: 200, body: { id: p.referral_id, state: "ACKNOWLEDGED_BY_RECEIVER" } };
      };

      await store.syncForUser("doc-1", transport, { nowMs: 1_700_000_000_000 });
      expect(attempted).toEqual(["ref-blocked:acknowledge", "ref-healthy:acknowledge"]);
      expect(attempted).not.toContain("ref-blocked:start");

      const remaining = await store.listItemsForUser("doc-1");
      expect(remaining).toHaveLength(2);
      expect(remaining[0].syncState).toBe("FAILED");
      expect(remaining[1].syncState).toBe("SAVED_LOCAL");
    });
  });

  // ── Task 3 — F-5: CryptoKey Persistence Failure ────────────────────────────
  describe("F-5 — CryptoKey Persistence Failure", () => {
    it("throws OfflineStorageKeyError and refuses to claim durable storage when IndexedDB key write fails", async () => {
      const dbName = freshDb("f5-key-fail");
      const store = new UnifiedOfflineQueueStore({
        dbName,
        simulateKeyPersistFailureForTesting: true,
      });

      await expect(
        store.enqueueStandardReferral({
          ownerUserId: "chw-1",
          facilityId: "fac-1",
          payload: {
            patient_id: "pat-1",
            receiver_facility_id: "fac-2",
            urgency: "urgent",
            reason: "Must not silently persist unrecoverable item",
          },
        })
      ).rejects.toBeInstanceOf(OfflineStorageKeyError);

      // No unrecoverable item was written to IndexedDB
      expect(await store.listItemsForUser("chw-1")).toHaveLength(0);
    });

    it("persists key across true reload and preserves ciphertext non-destructively when key goes missing", async () => {
      const dbName = freshDb("f5-reload-missing");
      const store1 = new UnifiedOfflineQueueStore({ dbName });
      const item = await store1.enqueueOfflinePatient({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: { given_name: "Nargis", sex: "female", phone: null },
      });

      await store1.clearInMemoryKeyCacheForTesting();
      const store2 = new UnifiedOfflineQueueStore({ dbName });
      const reloaded = await store2.listItemsForUser("chw-1");
      expect(reloaded[0].payload).toMatchObject({ given_name: "Nargis" });

      // Simulate missing key -> ciphertext preserved, never deleted
      await store2.deletePersistedKeyForTesting();
      const missing = await store2.listItemsForUser("chw-1");
      expect(missing).toHaveLength(1);
      expect(missing[0].syncState).toBe("FAILED");
      expect(missing[0].errorKind).toBe("decryption_key_unavailable");
      expect(await store2.inspectRawRecord(item.queueId)).toBeDefined();
    });
  });

  // ── Task 4 — F-4: CSRF & Session Recovery ──────────────────────────────────
  describe("F-4 — CSRF & Session Recovery", () => {
    it("recovers once from 403 CSRF Failed by refreshing GET /auth/me and retrying with the exact same Idempotency-Key", async () => {
      const dbName = freshDb("f4-csrf-recover");
      const store = new UnifiedOfflineQueueStore({ dbName });
      const item = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-2",
          urgency: "urgent",
          reason: "CSRF recovery test",
        },
      });

      let csrfToken = "stale-csrf";
      const seenKeys: string[] = [];
      let postCalls = 0;

      const api = createApiClient({
        baseUrl: "http://localhost/api/v1",
        getCsrfToken: () => csrfToken,
        fetchImpl: (async (req: Request) => {
          const u = new URL(req.url);
          if (req.method === "GET" && u.pathname.endsWith("/auth/me")) {
            csrfToken = "fresh-csrf";
            return jsonResponse({ id: "chw-1" }, 200);
          }
          postCalls += 1;
          seenKeys.push(req.headers.get("Idempotency-Key") || "");
          if (req.headers.get("X-CSRFToken") !== "fresh-csrf") {
            return jsonResponse(
              { error: { code: "permission_denied", message: "CSRF Failed: CSRF token incorrect." } },
              403
            );
          }
          return jsonResponse({ id: "srv-ref-csrf-1", reference_code: "REF-CSRF-1" }, 201);
        }) as unknown as typeof fetch,
      });

      await store.syncForUser("chw-1", createUnifiedSyncTransport(api));

      expect(postCalls).toBe(2);
      expect(seenKeys).toEqual([item.idempotencyKey, item.idempotencyKey]);
      expect(await store.listItemsForUser("chw-1")).toHaveLength(0);
    });

    it("pauses with AUTH_REQUIRED if session expired during CSRF recovery (/auth/me returns 401)", async () => {
      const dbName = freshDb("f4-csrf-expired");
      const store = new UnifiedOfflineQueueStore({ dbName });
      await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-2",
          urgency: "routine",
          reason: "Session expired during CSRF check",
        },
      });

      const api = createApiClient({
        baseUrl: "http://localhost/api/v1",
        getCsrfToken: () => "stale-csrf",
        fetchImpl: (async (req: Request) => {
          const u = new URL(req.url);
          if (req.method === "GET" && u.pathname.endsWith("/auth/me")) {
            return jsonResponse({ error: { code: "not_authenticated", message: "Expired" } }, 401);
          }
          return jsonResponse(
            { error: { code: "csrf_failed", message: "CSRF Failed" } },
            403
          );
        }) as unknown as typeof fetch,
      });

      await store.syncForUser("chw-1", createUnifiedSyncTransport(api));

      const [remaining] = await store.listItemsForUser("chw-1");
      expect(remaining.syncState).toBe("AUTH_REQUIRED");
      expect(remaining.errorKind).toBe("auth_required");
    });

    it("does not loop or mark synced when CSRF retry still fails", async () => {
      const dbName = freshDb("f4-csrf-still-fails");
      const store = new UnifiedOfflineQueueStore({ dbName });
      await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-2",
          urgency: "routine",
          reason: "Persistent CSRF failure",
        },
      });

      let postCalls = 0;
      const api = createApiClient({
        baseUrl: "http://localhost/api/v1",
        getCsrfToken: () => "bad-csrf",
        fetchImpl: (async (req: Request) => {
          const u = new URL(req.url);
          if (req.method === "GET" && u.pathname.endsWith("/auth/me")) {
            return jsonResponse({ id: "chw-1" }, 200);
          }
          postCalls += 1;
          return jsonResponse({ error: { code: "csrf_failed", message: "CSRF Failed" } }, 403);
        }) as unknown as typeof fetch,
      });

      await store.syncForUser("chw-1", createUnifiedSyncTransport(api));
      expect(postCalls).toBe(2); // Initial + 1 recovery retry only
      const [remaining] = await store.listItemsForUser("chw-1");
      expect(remaining.syncState).toBe("FAILED");
      expect(remaining.errorKind).toBe("permission_denied");
      expect(remaining.nextRetryAt).toBeNull();
    });
  });

  // ── Task 5 — F-3: Permanent Error Recovery ─────────────────────────────────
  describe("F-3 — Permanent Error Editing & Deliberate Discard", () => {
    it("allows editing a FAILED validation item with rotated idempotencyKey and succeeds on retry", async () => {
      const dbName = freshDb("f3-edit");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const item = await store.enqueueOfflinePatient({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: { given_name: "", sex: "female", phone: null },
      });
      const origKey = item.idempotencyKey;

      await store.syncForUser("chw-1", async () => ({
        status: 400,
        body: { error: { code: "validation_error" } },
        errorCode: "validation_error",
      }));

      const edited = await store.updateFailedItemPayload("chw-1", item.queueId, {
        given_name: "Rokeya",
        sex: "female",
        phone: null,
      });
      expect(edited.syncState).toBe("PENDING_SYNC");
      expect(edited.idempotencyKey).not.toBe(origKey);

      await store.syncForUser("chw-1", async () => ({
        status: 201,
        body: { id: "srv-pat-ok", system_id: "MWP-77778888" },
      }));
      expect(await store.listItemsForUser("chw-1")).toHaveLength(0);
    });

    it("deliberately discards a FAILED parent and flags dependent child as parent_discarded without silent deletion", async () => {
      const dbName = freshDb("f3-discard");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const pat = await store.enqueueOfflinePatient({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        payload: { given_name: "", sex: "female", phone: null },
      });
      const ref = await store.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-1",
        dependsOnQueueId: pat.queueId,
        payload: {
          patient_id: pat.tempEntityRef!,
          receiver_facility_id: "fac-2",
          urgency: "urgent",
          reason: "Child referral",
        },
      });

      // Cannot discard an active SAVED_LOCAL item
      await expect(store.discardFailedItem("chw-1", pat.queueId, "mistake")).rejects.toThrow();

      // Fail parent with 400
      await store.syncForUser("chw-1", async () => ({
        status: 400,
        body: { error: { code: "validation_error" } },
        errorCode: "validation_error",
      }));

      // Discard requires explicit reason
      await expect(store.discardFailedItem("chw-1", pat.queueId, "   ")).rejects.toThrow();

      const res = await store.discardFailedItem("chw-1", pat.queueId, "duplicate_entry");
      expect(res).toEqual({ discarded: true, blockedDependents: 1 });

      const remaining = await store.listItemsForUser("chw-1");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].queueId).toBe(ref.queueId);
      expect(remaining[0].syncState).toBe("FAILED");
      expect(remaining[0].errorCode).toBe("parent_discarded");
    });

    it("requires two-step confirmation in OfflineSyncBar before discarding a failed item", async () => {
      const dbName = freshDb("f3-ui-discard");
      const store = new UnifiedOfflineQueueStore({ dbName });
      await store.enqueueStandardReferral({
        ownerUserId: "chw-ui",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-2",
          urgency: "routine",
          reason: "Invalid item",
        },
      });

      const client = createApiClient({
        baseUrl: "http://localhost/api/v1",
        getCsrfToken: () => "csrf",
        fetchImpl: (async (req: Request) => {
          if (new URL(req.url).pathname.endsWith("/auth/me")) {
            return jsonResponse({
              id: "chw-ui",
              email: null,
              phone: null,
              display_name: "CHW",
              preferred_language: "en",
              roles: ["facility_staff"],
              permissions: ["referral.create"],
              active_facility: { id: "fac-1", name: "UHC" },
              is_platform_admin: false,
            });
          }
          return jsonResponse({ error: { code: "validation_error", message: "Bad" } }, 400);
        }) as unknown as typeof fetch,
      });

      render(
        <AppProviders client={client} queryClient={makeQueryClient()}>
          <OfflineSyncBar store={store} />
        </AppProviders>
      );

      await waitFor(() => expect(screen.getByText(/1 failed/i)).toBeTruthy());
      fireEvent.click(screen.getByRole("button", { name: /view queue/i }));

      // Step 1: Click Discard -> item is STILL in IndexedDB
      fireEvent.click(screen.getByRole("button", { name: /^discard$/i }));
      expect(await store.listItemsForUser("chw-ui")).toHaveLength(1);

      // Step 2: Click Confirm discard -> item removed
      fireEvent.click(screen.getByRole("button", { name: /confirm discard/i }));
      await waitFor(async () => {
        expect(await store.listItemsForUser("chw-ui")).toHaveLength(0);
      });
    });
  });

  // ── Task 6 — F-6: HTTP 423 sync_pending Classification ───────────────────────
  describe("F-6 — HTTP 423 sync_pending Classification", () => {
    it("classifies HTTP 423 sync_pending as transient server_unavailable with backoff", async () => {
      expect(classifyTransportError(423, "sync_pending")).toBe("server_unavailable");

      const dbName = freshDb("f6-423");
      const store = new UnifiedOfflineQueueStore({ dbName });
      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-1", action: "acknowledge", expected_version: 2, body: {} },
      });

      await store.syncForUser(
        "doc-1",
        async () => ({ status: 423, body: { error: { code: "sync_pending" } }, errorCode: "sync_pending" }),
        { nowMs: 1_700_000_000_000 }
      );

      const [item] = await store.listItemsForUser("doc-1");
      expect(item.syncState).toBe("FAILED");
      expect(item.errorKind).toBe("server_unavailable");
      expect(item.nextRetryAt).not.toBeNull();
    });
  });
});
