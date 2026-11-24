/**
 * Phase 3C.1 Isolated Reliability & Failure-Recovery Audit Suite (Frontend).
 * Read-only audit: does NOT modify any production source code or production tests.
 */

import { describe, expect, it } from "vitest";
import { clearBrowserCaches } from "../../auth/me";
import {
  UnifiedOfflineQueueStore,
  computeBackoffMs,
  type OfflineStandardReferralPayload,
  type UnifiedTransportFn,
} from "../unifiedQueue";

let auditSeq = 0;
function auditDb(name: string): string {
  auditSeq += 1;
  return `phase3c1-audit-${name}-${auditSeq}-${Date.now()}`;
}

describe("Phase 3C.1 Audit — Frontend Offline Reliability & Failure Recovery", () => {
  // ── Audit 1: Encryption & Key Lifecycle ────────────────────────────────────
  describe("Audit 1 — Encryption & Key Lifecycle", () => {
    it("persists CryptoKey in IndexedDB across true reload (after clearing in-memory KEY_CACHE)", async () => {
      const dbName = auditDb("true-reload");
      const store1 = new UnifiedOfflineQueueStore({ dbName });

      const item = await store1.enqueueOfflinePatient({
        ownerUserId: "chw-audit-1",
        facilityId: "fac-uhc-1",
        payload: {
          given_name: "Amina",
          family_name: "Khatun",
          sex: "female",
          estimated_age: 29,
          phone: null,
        },
      });

      // Clear the module-level in-memory KEY_CACHE to simulate a genuine browser refresh / restart
      await store1.clearInMemoryKeyCacheForTesting();

      const store2 = new UnifiedOfflineQueueStore({ dbName });
      const reloaded = await store2.listItemsForUser("chw-audit-1");
      expect(reloaded).toHaveLength(1);
      expect(reloaded[0].queueId).toBe(item.queueId);
      // Verify whether IndexedDB structured-cloned CryptoKey survived true reload
      expect(reloaded[0].syncState).toBe("SAVED_LOCAL");
      expect(reloaded[0].payload).toMatchObject({ given_name: "Amina", phone: null });
    });

    it("preserves ciphertext non-destructively when persisted key is deleted, even if new items are subsequently enqueued", async () => {
      const dbName = auditDb("missing-key");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const oldItem = await store.enqueueStandardReferral({
        ownerUserId: "chw-audit-1",
        facilityId: "fac-uhc-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-dh-1",
          urgency: "urgent",
          reason: "SENSITIVE_DIAGNOSIS_TEXT",
        },
      });

      // Simulate key loss (browser cleared key store)
      await store.deletePersistedKeyForTesting();

      const afterKeyLoss = await store.listItemsForUser("chw-audit-1");
      expect(afterKeyLoss).toHaveLength(1);
      expect(afterKeyLoss[0].syncState).toBe("FAILED");
      expect(afterKeyLoss[0].errorKind).toBe("decryption_key_unavailable");
      expect(afterKeyLoss[0].payload).toBeNull();
      // Raw ciphertext record must still exist in IndexedDB
      expect(await store.inspectRawRecord(oldItem.queueId)).toBeDefined();

      // Enqueuing a new record generates a fresh key; old ciphertext must STILL not be deleted
      const newItem = await store.enqueueStandardReferral({
        ownerUserId: "chw-audit-1",
        facilityId: "fac-uhc-1",
        payload: {
          patient_id: "pat-2",
          receiver_facility_id: "fac-dh-1",
          urgency: "routine",
          reason: "Follow-up",
        },
      });

      const both = await store.listItemsForUser("chw-audit-1");
      expect(both).toHaveLength(2);
      const oldRead = both.find((i) => i.queueId === oldItem.queueId)!;
      const newRead = both.find((i) => i.queueId === newItem.queueId)!;
      expect(oldRead.syncState).toBe("FAILED");
      expect(oldRead.errorKind).toBe("decryption_key_unavailable");
      expect(newRead.syncState).toBe("SAVED_LOCAL");
      expect(newRead.payload).toMatchObject({ reason: "Follow-up" });
    });

    it("does not destroy pending encrypted IndexedDB records when clearBrowserCaches() runs on logout", async () => {
      const dbName = auditDb("logout-caches");
      const store = new UnifiedOfflineQueueStore({ dbName });

      await store.enqueueOfflinePatient({
        ownerUserId: "chw-A",
        facilityId: "fac-1",
        payload: { given_name: "Jahanara", sex: "female", phone: null },
      });

      await clearBrowserCaches();

      const remaining = await store.listItemsForUser("chw-A");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].payload).toMatchObject({ given_name: "Jahanara" });
    });
  });

  // ── Audit 2 & 3: Lost Response, Reload Dependency Preservation & Action Ordering ──
  describe("Audit 2 & 3 — Lost Response & Dependency Ordering", () => {
    it("preserves patient -> referral dependency across true reload and recovers cleanly from lost patient HTTP response", async () => {
      const dbName = auditDb("dep-lost-resp");
      const store1 = new UnifiedOfflineQueueStore({ dbName });

      const pat = await store1.enqueueOfflinePatient({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        payload: { given_name: "Mizanur", sex: "male", estimated_age: 42, phone: null },
      });
      const ref = await store1.enqueueStandardReferral({
        ownerUserId: "chw-1",
        facilityId: "fac-uhc",
        facilityShortCode: "UHC05",
        dependsOnQueueId: pat.queueId,
        payload: {
          patient_id: pat.tempEntityRef!,
          receiver_facility_id: "fac-dh",
          urgency: "urgent",
          reason: "Persistent chest tightness",
        },
      });

      // Simulate full reload while still offline
      await store1.clearInMemoryKeyCacheForTesting();
      const store2 = new UnifiedOfflineQueueStore({ dbName });

      const reloaded = await store2.listItemsForUser("chw-1");
      expect(reloaded).toHaveLength(2);
      expect(reloaded[1].dependsOnQueueId).toBe(pat.queueId);

      // Simulate server creating patient on first try, but response lost over network;
      // second try receives idempotent replay with original server ID & MWP system_id
      const createdPatients = new Map<string, { id: string; system_id: string }>();
      const seenPayloads: Array<{ kind: string; key: string; payload: unknown }> = [];
      let dropFirstPatientResponse = true;

      const transport: UnifiedTransportFn = async (item) => {
        seenPayloads.push({ kind: item.kind, key: item.idempotencyKey, payload: item.payload });
        if (item.kind === "patient_create") {
          if (!createdPatients.has(item.idempotencyKey)) {
            createdPatients.set(item.idempotencyKey, {
              id: "srv-pat-001",
              system_id: "MWP-2A3B4C5D",
            });
          }
          if (dropFirstPatientResponse) {
            dropFirstPatientResponse = false;
            throw new TypeError("Network connection lost after server commit");
          }
          return { status: 201, body: createdPatients.get(item.idempotencyKey)! };
        }
        return {
          status: 201,
          body: { id: "srv-ref-001", reference_code: "REF-2026-0001" },
        };
      };

      const t0 = 1_700_000_000_000;
      await store2.syncForUser("chw-1", transport, { nowMs: t0 });
      // Dependent referral MUST NOT have been sent while patient_create failed
      expect(seenPayloads.map((s) => s.kind)).toEqual(["patient_create"]);
      expect(createdPatients.size).toBe(1);

      // Retry after backoff window
      await store2.syncForUser("chw-1", transport, { nowMs: t0 + computeBackoffMs(1) + 500 });
      expect(createdPatients.size).toBe(1); // Zero duplicate patients
      expect(seenPayloads.map((s) => s.kind)).toEqual([
        "patient_create",
        "patient_create",
        "standard_referral",
      ]);
      expect(seenPayloads[0].key).toBe(seenPayloads[1].key);
      const refPayload = seenPayloads[2].payload as OfflineStandardReferralPayload;
      expect(refPayload.patient_id).toBe("srv-pat-001");
      expect(refPayload.patient_system_id).toBe("MWP-2A3B4C5D");
      expect(await store2.listItemsForUser("chw-1")).toHaveLength(0);
    });

    it("AUDIT PROBE (Defect Check): detects whether unlinked sequential referral_actions on the same referral continue after action #1 fails", async () => {
      const dbName = auditDb("action-chain-probe");
      const store = new UnifiedOfflineQueueStore({ dbName });

      // Caller queues two sequential actions on the same referral WITHOUT explicit dependsOnQueueId
      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-99", action: "acknowledge", expected_version: 2, body: {} },
      });
      await store.enqueueReferralAction({
        ownerUserId: "doc-1",
        facilityId: "fac-dh",
        payload: { referral_id: "ref-99", action: "start", expected_version: 3, body: {} },
      });

      const attemptedActions: string[] = [];
      const transport: UnifiedTransportFn = async (item) => {
        const action = (item.payload as { action: string }).action;
        attemptedActions.push(action);
        if (action === "acknowledge") {
          throw new TypeError("Transient network drop on action #1");
        }
        // If action #2 runs while action #1 failed, server rejects with 412 stale_version
        return {
          status: 412,
          body: { error: { code: "stale_version" } },
          errorCode: "stale_version",
        };
      };

      await store.syncForUser("doc-1", transport);
      // Post Phase 3C.2 (F-2 fixed): action #2 remains strictly blocked after action #1 fails
      expect(attemptedActions).toEqual(["acknowledge"]);
      const remaining = await store.listItemsForUser("doc-1");
      expect(remaining[0].errorKind).toBe("network_unavailable");
      expect(remaining[1].syncState).toBe("SAVED_LOCAL");
    });
  });

  // ── Audit 4: Multi-User Isolation ──────────────────────────────────────────
  describe("Audit 4 — Multi-User Isolation", () => {
    it("isolates User A and User B across logout, login, concurrent sync, and synced receipts", async () => {
      const dbName = auditDb("multi-user");
      const store = new UnifiedOfflineQueueStore({ dbName });

      const patA = await store.enqueueOfflinePatient({
        ownerUserId: "user-A",
        facilityId: "fac-1",
        payload: { given_name: "PatientOfA", sex: "female", phone: null },
      });
      await store.enqueueStandardReferral({
        ownerUserId: "user-A",
        facilityId: "fac-1",
        dependsOnQueueId: patA.queueId,
        payload: {
          patient_id: patA.tempEntityRef!,
          receiver_facility_id: "fac-2",
          urgency: "urgent",
          reason: "User A clinical reason",
        },
      });

      // User A logs out (caches cleared)
      await clearBrowserCaches();

      // User B logs in, queues their own item, lists queue, and triggers sync
      await store.enqueueStandardReferral({
        ownerUserId: "user-B",
        facilityId: "fac-3",
        payload: {
          patient_id: "pat-B-1",
          receiver_facility_id: "fac-4",
          urgency: "routine",
          reason: "User B clinical reason",
        },
      });

      const itemsB = await store.listItemsForUser("user-B");
      expect(itemsB).toHaveLength(1);
      expect(itemsB[0].ownerUserId).toBe("user-B");

      const syncedByB: string[] = [];
      await store.syncForUser("user-B", async (item) => {
        syncedByB.push(item.ownerUserId);
        return { status: 201, body: { id: "srv-B-1", reference_code: "REF-B-1" } };
      });
      expect(syncedByB).toEqual(["user-B"]);

      // User A logs back in: both of User A's encrypted items must still be intact
      const itemsA = await store.listItemsForUser("user-A");
      expect(itemsA).toHaveLength(2);
      expect(await store.listSyncedReceiptsForUser("user-A")).toHaveLength(0);
      expect(await store.listSyncedReceiptsForUser("user-B")).toHaveLength(1);
    });
  });

  // ── Audit 5: Error Recovery Matrix ─────────────────────────────────────────
  describe("Audit 5 — Error Recovery Matrix", () => {
    it.each([
      { label: "HTTP 401", status: 401, code: "not_authenticated", expectedState: "AUTH_REQUIRED", expectedErr: "auth_required", expectRetryScheduled: false },
      { label: "HTTP 403 permission_denied", status: 403, code: "permission_denied", expectedState: "FAILED", expectedErr: "permission_denied", expectRetryScheduled: false },
      { label: "HTTP 400 validation_error", status: 400, code: "validation_error", expectedState: "FAILED", expectedErr: "validation_rejected", expectRetryScheduled: false },
      { label: "HTTP 409 idempotency_conflict", status: 409, code: "idempotency_conflict", expectedState: "FAILED", expectedErr: "conflict", expectRetryScheduled: false },
      { label: "HTTP 412 stale_version", status: 412, code: "stale_version", expectedState: "FAILED", expectedErr: "conflict", expectRetryScheduled: false },
      { label: "HTTP 500 server error", status: 500, code: "server_error", expectedState: "FAILED", expectedErr: "server_unavailable", expectRetryScheduled: true },
    ])("classifies $label correctly and preserves encrypted payload", async ({ status, code, expectedState, expectedErr, expectRetryScheduled }) => {
      const dbName = auditDb(`err-${status}-${code}`);
      const store = new UnifiedOfflineQueueStore({ dbName });

      await store.enqueueStandardReferral({
        ownerUserId: "chw-err",
        facilityId: "fac-1",
        payload: {
          patient_id: "pat-1",
          receiver_facility_id: "fac-2",
          urgency: "routine",
          reason: "Error matrix test",
        },
      });

      await store.syncForUser(
        "chw-err",
        async () => ({ status, body: { error: { code } }, errorCode: code }),
        { nowMs: 1_700_000_000_000 }
      );

      const [item] = await store.listItemsForUser("chw-err");
      expect(item.syncState).toBe(expectedState);
      expect(item.errorKind).toBe(expectedErr);
      expect(item.payload).toMatchObject({ reason: "Error matrix test" });
      if (expectRetryScheduled) {
        expect(item.nextRetryAt).not.toBeNull();
      } else {
        expect(item.nextRetryAt).toBeNull();
      }
    });
  });
});
