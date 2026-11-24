/**
 * Phase 3C: Unified Encrypted Offline Queue & Synchronization Engine.
 *
 * Extends Medi Waypoint's IndexedDB + non-extractable WebCrypto AES-GCM architecture
 * (frontend/src/offline/crypto.ts) to support:
 * - patient_create (offline patient registration without phone/email)
 * - standard_referral (with optional dependency on an offline-created patient)
 * - emergency_referral (5-field minimum emergency transfer)
 * - referral_action (ordered offline status updates: acknowledge, start, record_outcome, etc.)
 *
 * Guarantees:
 * - All clinical/patient fields are AES-GCM encrypted with a per-record random 96-bit IV.
 * - Zero plaintext PHI in localStorage, queue metadata, console logs, or error messages.
 * - Scoped by ownerUserId + facilityId so shared devices never expose another user's records.
 * - Never silently deletes encrypted pending items when keys fail or sessions expire.
 * - Single-flight sync lock + exponential backoff + permanent vs transient error classification.
 */

import { openDB, type IDBPDatabase } from "idb";
import {
  encryptPayload,
  decryptPayload,
  generateNonExtractableAesKey,
  type EncryptedEnvelope,
} from "./crypto";
import { generateProvisionalCode } from "./provisionalCode";
import { createIntentIdempotencyKey } from "../api/client";
import type { EmergencyMinimumPayload } from "./queue";

export type OfflineItemKind =
  | "patient_create"
  | "standard_referral"
  | "emergency_referral"
  | "referral_action";

export type UnifiedSyncState =
  | "SAVED_LOCAL"
  | "PENDING_SYNC"
  | "SYNCING"
  | "SYNCED"
  | "FAILED"
  | "AUTH_REQUIRED";

export type SyncErrorKind =
  | "network_unavailable"
  | "auth_required"
  | "permission_denied"
  | "validation_rejected"
  | "conflict"
  | "server_unavailable"
  | "decryption_key_unavailable"
  | "unknown";

export const PERMANENT_ERROR_KINDS: ReadonlySet<SyncErrorKind> = new Set([
  "validation_rejected",
  "permission_denied",
  "conflict",
  "decryption_key_unavailable",
]);

export const BACKOFF_DELAYS_MS = [5_000, 15_000, 30_000, 60_000, 120_000] as const;

export interface OfflinePatientPayload {
  given_name: string;
  family_name?: string;
  name_bn?: string;
  sex: "male" | "female" | "other" | "unknown";
  estimated_age?: number | null;
  birth_date?: string | null;
  phone?: string | null;
  area_id?: string | null;
  identifiers?: Array<{ system: string; value: string; verified?: boolean }>;
}

export interface OfflineStandardReferralPayload {
  patient_id: string; // Server UUID OR temporary local-pat-<uuid> until dependency resolves
  patient_system_id?: string | null;
  receiver_facility_id: string;
  receiver_practitioner_id?: string | null;
  encounter_id?: string | null;
  urgency: "routine" | "urgent" | "emergency";
  reason: string;
  summary?: Record<string, unknown>;
}

export interface OfflineReferralActionPayload {
  referral_id: string; // Server UUID OR temporary local-ref-<uuid>
  action: "acknowledge" | "decline" | "start" | "record_outcome" | "request_consent" | "close" | "close_with_exception";
  expected_version?: number | null;
  body?: Record<string, unknown>;
}

export type UnifiedPayload =
  | OfflinePatientPayload
  | OfflineStandardReferralPayload
  | EmergencyMinimumPayload
  | OfflineReferralActionPayload;

/** Non-PII metadata persisted in IndexedDB alongside AES-GCM ciphertext. */
export interface StoredUnifiedRecord {
  queueId: string;
  kind: OfflineItemKind;
  idempotencyKey: string;
  ownerUserId: string;
  facilityId: string;
  provisionalCode?: string | null;
  tempEntityRef?: string | null; // e.g. local-pat-<uuid> or local-ref-<uuid>
  targetReferralId?: string | null; // Non-PII referral UUID or local-ref-* for per-referral FIFO ordering (F-2)
  dependsOnQueueId?: string | null;
  sequenceOrder: number;
  createdAtDevice: string;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  retryCount: number;
  syncState: Exclude<UnifiedSyncState, "SYNCED">;
  errorKind?: SyncErrorKind | null;
  errorCode?: string | null;
  iv: number[];
  ciphertext: number[];
}

export interface DecryptedUnifiedItem<T extends UnifiedPayload = UnifiedPayload> {
  queueId: string;
  kind: OfflineItemKind;
  idempotencyKey: string;
  ownerUserId: string;
  facilityId: string;
  provisionalCode?: string | null;
  tempEntityRef?: string | null;
  targetReferralId?: string | null;
  dependsOnQueueId?: string | null;
  sequenceOrder: number;
  createdAtDevice: string;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  retryCount: number;
  syncState: Exclude<UnifiedSyncState, "SYNCED">;
  errorKind?: SyncErrorKind | null;
  errorCode?: string | null;
  payload: T | null; // null only when decryption fails (key unavailable / corrupted)
}

export class OfflineStorageKeyError extends Error {
  readonly code = "encryption_key_persistence_failed";
  constructor(message = "Offline encryption key could not be persisted durably in IndexedDB.") {
    super(message);
    this.name = "OfflineStorageKeyError";
  }
}

/** Non-PII receipt stored after ciphertext is erased on confirmed server sync. */
export interface SyncedReceipt {
  queueId: string;
  kind: OfflineItemKind;
  idempotencyKey: string;
  ownerUserId: string;
  facilityId: string;
  provisionalCode?: string | null;
  serverId?: string | null;
  serverReferenceCode?: string | null;
  serverSystemId?: string | null;
  reconciledPartial: boolean;
  syncedAt: string;
}

export interface UnifiedTransportResponse {
  status: number;
  body: Record<string, unknown>;
  errorCode?: string;
}

export type UnifiedTransportFn = (item: DecryptedUnifiedItem) => Promise<UnifiedTransportResponse>;

const KEY_CACHE = new Map<string, Promise<CryptoKey>>();
const RECEIPT_TTL_MS = 24 * 3600 * 1000;

export function computeBackoffMs(retryCount: number): number {
  const idx = Math.min(Math.max(retryCount - 1, 0), BACKOFF_DELAYS_MS.length - 1);
  return BACKOFF_DELAYS_MS[idx];
}

export function classifyTransportError(status: number, errorCode?: string): SyncErrorKind {
  if (status === 0) return "network_unavailable";
  if (status === 401 || (status === 403 && errorCode === "not_authenticated")) return "auth_required";
  if (status === 403) return "permission_denied";
  if (status === 409 || status === 412) return "conflict";
  if (status === 400 || status === 422) return "validation_rejected";
  if (status === 423 || errorCode === "sync_pending") return "server_unavailable";
  if (status === 429 || status >= 500) return "server_unavailable";
  return "unknown";
}

export class UnifiedOfflineQueueStore {
  private readonly dbName: string;
  private readonly simulateKeyPersistFailureForTesting: boolean;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private seqCounter = 1;
  private readonly inflightByUser = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();

  constructor(options?: { dbName?: string; simulateKeyPersistFailureForTesting?: boolean }) {
    this.dbName = options?.dbName ?? "medi-waypoint-unified-offline-v1";
    this.simulateKeyPersistFailureForTesting = options?.simulateKeyPersistFailureForTesting ?? false;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const fn of this.listeners) {
      try {
        fn();
      } catch {
        // Isolate subscriber errors
      }
    }
  }

  private getDb(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(this.dbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("items")) {
            db.createObjectStore("items", { keyPath: "queueId" });
          }
          if (!db.objectStoreNames.contains("synced_log")) {
            db.createObjectStore("synced_log", { keyPath: "queueId" });
          }
          if (!db.objectStoreNames.contains("keys")) {
            db.createObjectStore("keys");
          }
        },
      });
    }
    return this.dbPromise;
  }

  /**
   * Load persisted non-extractable AES-GCM CryptoKey from IndexedDB or create one.
   * Passing `createIfMissing=false` allows read paths to detect a missing key without silently overwriting it.
   */
  private async getKey(createIfMissing: boolean = true): Promise<CryptoKey | null> {
    const cached = KEY_CACHE.get(this.dbName);
    if (cached) {
      return cached;
    }

    const db = await this.getDb();
    try {
      const storedKey = (await db.get("keys", "aes-gcm-master")) as CryptoKey | undefined;
      if (storedKey && typeof storedKey === "object" && "type" in storedKey) {
        const p = Promise.resolve(storedKey);
        KEY_CACHE.set(this.dbName, p);
        return storedKey;
      }
    } catch {
      // Synthetic IndexedDB in test environments may not structured-clone CryptoKey
    }

    if (!createIfMissing) {
      return null;
    }

    const freshPromise = (async () => {
      const freshKey = await generateNonExtractableAesKey();
      if (this.simulateKeyPersistFailureForTesting) {
        throw new OfflineStorageKeyError();
      }
      try {
        await db.put("keys", freshKey, "aes-gcm-master");
      } catch {
        throw new OfflineStorageKeyError();
      }
      return freshKey;
    })();
    try {
      const persisted = await freshPromise;
      KEY_CACHE.set(this.dbName, Promise.resolve(persisted));
      return persisted;
    } catch (err) {
      KEY_CACHE.delete(this.dbName);
      throw err;
    }
  }

  /** Test/recovery helper to simulate browser key loss across restarts. */
  async clearInMemoryKeyCacheForTesting(): Promise<void> {
    KEY_CACHE.delete(this.dbName);
  }

  /** Test/recovery helper to wipe the persisted key store to verify non-destructive corruption handling. */
  async deletePersistedKeyForTesting(): Promise<void> {
    KEY_CACHE.delete(this.dbName);
    const db = await this.getDb();
    await db.delete("keys", "aes-gcm-master");
  }

  private async nextSequenceOrder(db: IDBPDatabase): Promise<number> {
    const all = (await db.getAll("items")) as StoredUnifiedRecord[];
    const maxExisting = all.reduce((acc, r) => Math.max(acc, r.sequenceOrder || 0), 0);
    this.seqCounter = Math.max(this.seqCounter, maxExisting + 1);
    return this.seqCounter++;
  }

  private async enqueueInternal<T extends UnifiedPayload>(params: {
    kind: OfflineItemKind;
    ownerUserId: string;
    facilityId: string;
    payload: T;
    provisionalCode?: string | null;
    tempEntityRef?: string | null;
    targetReferralId?: string | null;
    dependsOnQueueId?: string | null;
    idempotencyKey?: string;
    createdAtDevice?: string;
    initialState?: "SAVED_LOCAL" | "PENDING_SYNC";
  }): Promise<DecryptedUnifiedItem<T>> {
    const db = await this.getDb();
    const key = await this.getKey(true);
    if (!key) {
      throw new OfflineStorageKeyError();
    }

    const queueId = `q-${createIntentIdempotencyKey()}`;
    const idempotencyKey = params.idempotencyKey ?? createIntentIdempotencyKey();
    const createdAtDevice = params.createdAtDevice ?? new Date().toISOString();
    const sequenceOrder = await this.nextSequenceOrder(db);
    const envelope: EncryptedEnvelope = await encryptPayload(key, params.payload);

    const record: StoredUnifiedRecord = {
      queueId,
      kind: params.kind,
      idempotencyKey,
      ownerUserId: params.ownerUserId,
      facilityId: params.facilityId,
      provisionalCode: params.provisionalCode ?? null,
      tempEntityRef: params.tempEntityRef ?? null,
      targetReferralId: params.targetReferralId ?? null,
      dependsOnQueueId: params.dependsOnQueueId ?? null,
      sequenceOrder,
      createdAtDevice,
      lastAttemptAt: null,
      nextRetryAt: null,
      retryCount: 0,
      syncState: params.initialState ?? "SAVED_LOCAL",
      errorKind: null,
      errorCode: null,
      iv: envelope.iv,
      ciphertext: envelope.ciphertext,
    };

    await db.put("items", record);
    this.emit();

    return {
      queueId,
      kind: record.kind,
      idempotencyKey,
      ownerUserId: record.ownerUserId,
      facilityId: record.facilityId,
      provisionalCode: record.provisionalCode,
      tempEntityRef: record.tempEntityRef,
      targetReferralId: record.targetReferralId,
      dependsOnQueueId: record.dependsOnQueueId,
      sequenceOrder,
      createdAtDevice,
      lastAttemptAt: null,
      nextRetryAt: null,
      retryCount: 0,
      syncState: record.syncState,
      errorKind: null,
      errorCode: null,
      payload: params.payload,
    };
  }

  async enqueueOfflinePatient(params: {
    ownerUserId: string;
    facilityId: string;
    payload: OfflinePatientPayload;
    idempotencyKey?: string;
    createdAtDevice?: string;
  }): Promise<DecryptedUnifiedItem<OfflinePatientPayload>> {
    const tempEntityRef = `local-pat-${createIntentIdempotencyKey()}`;
    return this.enqueueInternal({
      kind: "patient_create",
      ownerUserId: params.ownerUserId,
      facilityId: params.facilityId,
      payload: params.payload,
      tempEntityRef,
      idempotencyKey: params.idempotencyKey,
      createdAtDevice: params.createdAtDevice,
    });
  }

  async enqueueStandardReferral(params: {
    ownerUserId: string;
    facilityId: string;
    facilityShortCode?: string;
    payload: OfflineStandardReferralPayload;
    dependsOnQueueId?: string | null;
    provisionalCode?: string;
    idempotencyKey?: string;
    createdAtDevice?: string;
  }): Promise<DecryptedUnifiedItem<OfflineStandardReferralPayload>> {
    const createdAtDevice = params.createdAtDevice ?? new Date().toISOString();
    const db = await this.getDb();
    const seq = await this.nextSequenceOrder(db);
    const provisionalCode =
      params.provisionalCode ??
      generateProvisionalCode(params.facilityShortCode ?? "CHW", seq, createdAtDevice);
    const tempEntityRef = `local-ref-${createIntentIdempotencyKey()}`;

    return this.enqueueInternal({
      kind: "standard_referral",
      ownerUserId: params.ownerUserId,
      facilityId: params.facilityId,
      payload: params.payload,
      provisionalCode,
      tempEntityRef,
      dependsOnQueueId: params.dependsOnQueueId ?? null,
      idempotencyKey: params.idempotencyKey,
      createdAtDevice,
    });
  }

  async enqueueEmergencyReferral(params: {
    ownerUserId: string;
    facilityId: string;
    facilityShortCode?: string;
    payload: EmergencyMinimumPayload;
    provisionalCode?: string;
    idempotencyKey?: string;
    createdAtDevice?: string;
  }): Promise<DecryptedUnifiedItem<EmergencyMinimumPayload>> {
    const createdAtDevice = params.createdAtDevice ?? new Date().toISOString();
    const db = await this.getDb();
    const seq = await this.nextSequenceOrder(db);
    const provisionalCode =
      params.provisionalCode ??
      generateProvisionalCode(params.facilityShortCode ?? "UHC", seq, createdAtDevice);

    return this.enqueueInternal({
      kind: "emergency_referral",
      ownerUserId: params.ownerUserId,
      facilityId: params.facilityId,
      payload: params.payload,
      provisionalCode,
      idempotencyKey: params.idempotencyKey,
      createdAtDevice,
    });
  }

  async enqueueReferralAction(params: {
    ownerUserId: string;
    facilityId: string;
    payload: OfflineReferralActionPayload;
    dependsOnQueueId?: string | null;
    idempotencyKey?: string;
    createdAtDevice?: string;
  }): Promise<DecryptedUnifiedItem<OfflineReferralActionPayload>> {
    const db = await this.getDb();
    let effectiveDependsOn = params.dependsOnQueueId ?? null;

    // F-2: Auto-chain sequential actions (or referral creation) for the same referral_id so FIFO
    // ordering persists across reloads and never advances past a failed earlier action.
    if (!effectiveDependsOn) {
      const existing = ((await db.getAll("items")) as StoredUnifiedRecord[])
        .filter(
          (r) =>
            r.ownerUserId === params.ownerUserId &&
            ((r.kind === "referral_action" && r.targetReferralId === params.payload.referral_id) ||
              ((r.kind === "standard_referral" || r.kind === "emergency_referral") &&
                r.tempEntityRef === params.payload.referral_id))
        )
        .sort((a, b) => b.sequenceOrder - a.sequenceOrder);
      if (existing.length > 0) {
        effectiveDependsOn = existing[0].queueId;
      }
    }

    return this.enqueueInternal({
      kind: "referral_action",
      ownerUserId: params.ownerUserId,
      facilityId: params.facilityId,
      payload: params.payload,
      targetReferralId: params.payload.referral_id,
      dependsOnQueueId: effectiveDependsOn,
      idempotencyKey: params.idempotencyKey,
      createdAtDevice: params.createdAtDevice,
    });
  }

  async inspectRawRecord(queueId: string): Promise<StoredUnifiedRecord | undefined> {
    const db = await this.getDb();
    return (await db.get("items", queueId)) as StoredUnifiedRecord | undefined;
  }

  /** Test helper to simulate ciphertext tampering/corruption on disk. */
  async corruptRawCiphertextForTesting(queueId: string): Promise<void> {
    const db = await this.getDb();
    const rec = (await db.get("items", queueId)) as StoredUnifiedRecord | undefined;
    if (!rec) return;
    rec.ciphertext = rec.ciphertext.map((b, i) => (i === 0 ? (b ^ 0xff) : b));
    await db.put("items", rec);
  }

  async listItemsForUser(ownerUserId: string): Promise<DecryptedUnifiedItem[]> {
    const db = await this.getDb();
    const records = ((await db.getAll("items")) as StoredUnifiedRecord[])
      .filter((r) => r.ownerUserId === ownerUserId)
      .sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    const key = await this.getKey(false);
    const out: DecryptedUnifiedItem[] = [];

    for (const r of records) {
      let payload: UnifiedPayload | null = null;
      let syncState = r.syncState;
      let errorKind = r.errorKind ?? null;

      if (!key) {
        // Key missing: NEVER delete pending encrypted item; mark explicit recovery error
        syncState = "FAILED";
        errorKind = "decryption_key_unavailable";
      } else {
        try {
          payload = await decryptPayload<UnifiedPayload>(key, {
            iv: r.iv,
            ciphertext: r.ciphertext,
          });
        } catch {
          // Wrong key or corrupted ciphertext: preserve record and flag recovery error
          syncState = "FAILED";
          errorKind = "decryption_key_unavailable";
        }
      }

      if (syncState !== r.syncState || errorKind !== (r.errorKind ?? null)) {
        r.syncState = syncState;
        r.errorKind = errorKind;
        await db.put("items", r);
      }

      out.push({
        queueId: r.queueId,
        kind: r.kind,
        idempotencyKey: r.idempotencyKey,
        ownerUserId: r.ownerUserId,
        facilityId: r.facilityId,
        provisionalCode: r.provisionalCode,
        tempEntityRef: r.tempEntityRef,
        targetReferralId: r.targetReferralId,
        dependsOnQueueId: r.dependsOnQueueId,
        sequenceOrder: r.sequenceOrder,
        createdAtDevice: r.createdAtDevice,
        lastAttemptAt: r.lastAttemptAt,
        nextRetryAt: r.nextRetryAt,
        retryCount: r.retryCount,
        syncState,
        errorKind,
        errorCode: r.errorCode,
        payload,
      });
    }

    return out;
  }

  async listSyncedReceiptsForUser(ownerUserId: string, nowMs: number = Date.now()): Promise<SyncedReceipt[]> {
    const db = await this.getDb();
    const all = (await db.getAll("synced_log")) as SyncedReceipt[];
    const valid: SyncedReceipt[] = [];
    for (const r of all) {
      if (nowMs - new Date(r.syncedAt).getTime() > RECEIPT_TTL_MS) {
        await db.delete("synced_log", r.queueId);
        continue;
      }
      if (r.ownerUserId === ownerUserId) {
        valid.push(r);
      }
    }
    return valid.sort((a, b) => b.syncedAt.localeCompare(a.syncedAt));
  }

  /**
   * Call after user re-authenticates: transitions AUTH_REQUIRED items back to PENDING_SYNC
   * and clears nextRetryAt so the next sync cycle immediately processes them.
   */
  async resumeAfterAuth(ownerUserId: string): Promise<number> {
    const db = await this.getDb();
    const records = ((await db.getAll("items")) as StoredUnifiedRecord[]).filter(
      (r) => r.ownerUserId === ownerUserId && r.syncState === "AUTH_REQUIRED"
    );
    for (const r of records) {
      r.syncState = "PENDING_SYNC";
      r.errorKind = null;
      r.errorCode = null;
      r.nextRetryAt = null;
      await db.put("items", r);
    }
    if (records.length > 0) this.emit();
    return records.length;
  }

  /** Mark SAVED_LOCAL items as PENDING_SYNC when offline so UI shows accurate waiting state. */
  async markPendingOffline(ownerUserId: string): Promise<void> {
    const db = await this.getDb();
    const records = ((await db.getAll("items")) as StoredUnifiedRecord[]).filter(
      (r) => r.ownerUserId === ownerUserId && r.syncState === "SAVED_LOCAL"
    );
    for (const r of records) {
      r.syncState = "PENDING_SYNC";
      await db.put("items", r);
    }
    if (records.length > 0) this.emit();
  }

  /**
   * Rewrite dependent queue items atomically when an offline-created patient or referral
   * obtains its canonical server ID.
   */
  private async resolveDependents(
    db: IDBPDatabase,
    key: CryptoKey,
    parent: DecryptedUnifiedItem,
    serverId: string | null,
    serverSystemId?: string | null
  ): Promise<void> {
    const all = ((await db.getAll("items")) as StoredUnifiedRecord[]).filter(
      (r) => r.ownerUserId === parent.ownerUserId && r.dependsOnQueueId === parent.queueId
    );

    for (const dep of all) {
      let depPayload: UnifiedPayload;
      try {
        depPayload = await decryptPayload<UnifiedPayload>(key, {
          iv: dep.iv,
          ciphertext: dep.ciphertext,
        });
      } catch {
        dep.syncState = "FAILED";
        dep.errorKind = "decryption_key_unavailable";
        await db.put("items", dep);
        continue;
      }

      if (parent.kind === "patient_create" && dep.kind === "standard_referral" && serverId) {
        const refPayload = depPayload as OfflineStandardReferralPayload;
        if (!parent.tempEntityRef || refPayload.patient_id === parent.tempEntityRef) {
          refPayload.patient_id = serverId;
          if (serverSystemId) {
            refPayload.patient_system_id = serverSystemId;
          }
        }
      } else if (
        (parent.kind === "standard_referral" || parent.kind === "emergency_referral") &&
        dep.kind === "referral_action" &&
        serverId
      ) {
        const actPayload = depPayload as OfflineReferralActionPayload;
        if (!parent.tempEntityRef || actPayload.referral_id === parent.tempEntityRef) {
          actPayload.referral_id = serverId;
          dep.targetReferralId = serverId;
        }
      }

      const freshEnvelope = await encryptPayload(key, depPayload);
      dep.iv = freshEnvelope.iv;
      dep.ciphertext = freshEnvelope.ciphertext;
      dep.dependsOnQueueId = null;
      await db.put("items", dep);
    }
  }

  /**
   * F-3: Edit and re-queue an eligible FAILED item (validation_rejected, conflict, permission_denied).
   * - Never allows editing SYNCING, SYNCED, or decryption_key_unavailable items.
   * - Re-encrypts with a fresh random 96-bit IV and rotates idempotencyKey so the corrected payload
   *   is not rejected as a 409 idempotency_conflict against the previous rejected body.
   */
  async updateFailedItemPayload<T extends UnifiedPayload>(
    ownerUserId: string,
    queueId: string,
    updatedPayload: T
  ): Promise<DecryptedUnifiedItem<T>> {
    const db = await this.getDb();
    const rec = (await db.get("items", queueId)) as StoredUnifiedRecord | undefined;
    if (!rec || rec.ownerUserId !== ownerUserId) {
      throw new Error("Queue item not found for this user.");
    }
    if (rec.syncState !== "FAILED") {
      throw new Error("Only FAILED items can be edited for recovery.");
    }
    if (rec.errorKind === "decryption_key_unavailable") {
      throw new Error("Cannot edit an item whose encryption key is unavailable.");
    }

    const key = await this.getKey(false);
    if (!key) {
      throw new OfflineStorageKeyError();
    }

    const freshEnvelope = await encryptPayload(key, updatedPayload);
    rec.iv = freshEnvelope.iv;
    rec.ciphertext = freshEnvelope.ciphertext;
    rec.idempotencyKey = createIntentIdempotencyKey();
    rec.syncState = "PENDING_SYNC";
    rec.errorKind = null;
    rec.errorCode = null;
    rec.nextRetryAt = null;
    if (rec.kind === "referral_action") {
      rec.targetReferralId = (updatedPayload as OfflineReferralActionPayload).referral_id;
    }

    await db.put("items", rec);
    this.emit();

    return {
      queueId: rec.queueId,
      kind: rec.kind,
      idempotencyKey: rec.idempotencyKey,
      ownerUserId: rec.ownerUserId,
      facilityId: rec.facilityId,
      provisionalCode: rec.provisionalCode,
      tempEntityRef: rec.tempEntityRef,
      targetReferralId: rec.targetReferralId,
      dependsOnQueueId: rec.dependsOnQueueId,
      sequenceOrder: rec.sequenceOrder,
      createdAtDevice: rec.createdAtDevice,
      lastAttemptAt: rec.lastAttemptAt,
      nextRetryAt: rec.nextRetryAt,
      retryCount: rec.retryCount,
      syncState: rec.syncState,
      errorKind: null,
      errorCode: null,
      payload: updatedPayload,
    };
  }

  /**
   * F-3: Deliberately discard a FAILED or AUTH_REQUIRED item with an explicit reason.
   * - Never silently deletes active SAVED_LOCAL, PENDING_SYNC, or SYNCING items.
   * - Any dependent items are marked FAILED (parent_discarded) rather than silently unblocked or deleted.
   */
  async discardFailedItem(
    ownerUserId: string,
    queueId: string,
    reason: string
  ): Promise<{ discarded: boolean; blockedDependents: number }> {
    if (!reason || !reason.trim()) {
      throw new Error("A discard reason is required.");
    }
    const db = await this.getDb();
    const rec = (await db.get("items", queueId)) as StoredUnifiedRecord | undefined;
    if (!rec || rec.ownerUserId !== ownerUserId) {
      return { discarded: false, blockedDependents: 0 };
    }
    if (rec.syncState !== "FAILED" && rec.syncState !== "AUTH_REQUIRED") {
      throw new Error("Only FAILED or AUTH_REQUIRED items can be deliberately discarded.");
    }

    const dependents = ((await db.getAll("items")) as StoredUnifiedRecord[]).filter(
      (r) => r.ownerUserId === ownerUserId && r.dependsOnQueueId === queueId
    );
    for (const dep of dependents) {
      dep.syncState = "FAILED";
      dep.errorKind = "validation_rejected";
      dep.errorCode = "parent_discarded";
      dep.nextRetryAt = null;
      await db.put("items", dep);
    }

    await db.delete("items", queueId);
    this.emit();
    return { discarded: true, blockedDependents: dependents.length };
  }

  /**
   * Phase 3D / F-3 Safety Rule:
   * Before rotating an idempotencyKey to edit a failed item whose original server outcome may be uncertain
   * (e.g. after a lost HTTP response), safely probe the server using the ORIGINAL idempotencyKey.
   * - If the server already accepted the original request (200/201/202), resolves dependents, erases ciphertext,
   *   records the synced receipt, and returns { outcome: "already_accepted", receipt } so no duplicate is created.
   * - If the server rejects with 400/409/412/403, confirms it is safe to edit and returns { outcome: "safe_to_edit" }.
   * - If the network is still unreachable, returns { outcome: "uncertain_network" } so the caller refuses key rotation.
   */
  async reconcileUncertainFailedItem(
    ownerUserId: string,
    queueId: string,
    transport: UnifiedTransportFn,
    nowMs: number = Date.now()
  ): Promise<
    | { outcome: "already_accepted"; receipt: SyncedReceipt }
    | { outcome: "safe_to_edit"; status: number; errorCode?: string }
    | { outcome: "uncertain_network" }
  > {
    const items = await this.listItemsForUser(ownerUserId);
    const item = items.find((i) => i.queueId === queueId);
    if (!item || !item.payload) {
      return { outcome: "uncertain_network" };
    }

    const db = await this.getDb();
    const key = await this.getKey(false);

    try {
      const res = await transport(item);
      if (res.status === 200 || res.status === 201 || res.status === 202) {
        const serverId = typeof res.body.id === "string" ? res.body.id : null;
        const serverRefCode =
          typeof res.body.reference_code === "string" ? res.body.reference_code : null;
        const serverSystemId =
          typeof res.body.system_id === "string" ? res.body.system_id : null;
        const reconciledPartial = Boolean(res.body.reconciled_at);

        if (key) {
          await this.resolveDependents(db, key, item, serverId, serverSystemId);
        }
        await db.delete("items", item.queueId);

        const receipt: SyncedReceipt = {
          queueId: item.queueId,
          kind: item.kind,
          idempotencyKey: item.idempotencyKey,
          ownerUserId: item.ownerUserId,
          facilityId: item.facilityId,
          provisionalCode: item.provisionalCode ?? null,
          serverId,
          serverReferenceCode: serverRefCode,
          serverSystemId,
          reconciledPartial,
          syncedAt: new Date(nowMs).toISOString(),
        };
        await db.put("synced_log", receipt);
        this.emit();
        return { outcome: "already_accepted", receipt };
      }

      if (res.status >= 500 || res.status === 0 || res.status === 429 || res.status === 423) {
        return { outcome: "uncertain_network" };
      }

      return { outcome: "safe_to_edit", status: res.status, errorCode: res.errorCode };
    } catch {
      return { outcome: "uncertain_network" };
    }
  }

  /**
   * Single-flight synchronization for a specific authenticated user.
   * Respects dependency order, exponential backoff, permanent error stops, and auth pauses.
   */
  syncForUser(
    ownerUserId: string,
    transport: UnifiedTransportFn,
    options?: { forceRetry?: boolean; nowMs?: number }
  ): Promise<void> {
    const existing = this.inflightByUser.get(ownerUserId);
    if (existing) {
      return existing;
    }

    const run = (async () => {
      try {
        const db = await this.getDb();
        const nowMs = options?.nowMs ?? Date.now();
        const forceRetry = options?.forceRetry ?? false;

        // Loop passes so newly unblocked dependent items (e.g. referral after patient_create,
        // or action N+1 after action N) sync in the same run
        let progress = true;
        while (progress) {
          progress = false;
          const items = await this.listItemsForUser(ownerUserId);
          const remainingIds = new Set(items.map((i) => i.queueId));
          const blockedReferralIds = new Set<string>();
          const key = await this.getKey(false);

          for (const item of items) {
            const refKey =
              item.kind === "referral_action"
                ? item.targetReferralId ?? (item.payload as OfflineReferralActionPayload | null)?.referral_id ?? null
                : null;

            if (refKey && blockedReferralIds.has(refKey)) {
              continue; // F-2: Earlier action for this same referral failed or is deferred
            }
            if (item.payload === null || item.errorKind === "decryption_key_unavailable") {
              if (refKey) blockedReferralIds.add(refKey);
              continue; // Corrupted / key-unavailable: preserve for explicit recovery
            }
            if (item.syncState === "AUTH_REQUIRED") {
              if (refKey) blockedReferralIds.add(refKey);
              continue; // Paused until re-authentication
            }
            if (item.errorKind && PERMANENT_ERROR_KINDS.has(item.errorKind) && !forceRetry) {
              if (refKey) blockedReferralIds.add(refKey);
              continue; // Do not retry permanent validation/permission/conflict errors indefinitely
            }
            if (!forceRetry && item.nextRetryAt && new Date(item.nextRetryAt).getTime() > nowMs) {
              if (refKey) blockedReferralIds.add(refKey);
              continue; // Respect exponential backoff window
            }
            if (item.dependsOnQueueId && remainingIds.has(item.dependsOnQueueId)) {
              if (refKey) blockedReferralIds.add(refKey);
              continue; // Dependency not yet synchronized — wait without blocking unrelated items!
            }

            const raw = (await db.get("items", item.queueId)) as StoredUnifiedRecord | undefined;
            if (!raw) continue;

            raw.syncState = "SYNCING";
            raw.lastAttemptAt = new Date(nowMs).toISOString();
            raw.retryCount += 1;
            await db.put("items", raw);
            this.emit();

            try {
              const res = await transport(item);

              if (res.status === 200 || res.status === 201 || res.status === 202) {
                const serverId = typeof res.body.id === "string" ? res.body.id : null;
                const serverRefCode =
                  typeof res.body.reference_code === "string" ? res.body.reference_code : null;
                const serverSystemId =
                  typeof res.body.system_id === "string" ? res.body.system_id : null;
                const reconciledPartial = Boolean(res.body.reconciled_at);

                // Resolve any queued dependents BEFORE removing parent (including chained referral_actions)
                if (key) {
                  await this.resolveDependents(db, key, item, serverId, serverSystemId);
                }

                // Erase encrypted clinical payload immediately on confirmed sync
                await db.delete("items", item.queueId);

                // Record non-PII receipt
                const receipt: SyncedReceipt = {
                  queueId: item.queueId,
                  kind: item.kind,
                  idempotencyKey: item.idempotencyKey,
                  ownerUserId: item.ownerUserId,
                  facilityId: item.facilityId,
                  provisionalCode: item.provisionalCode ?? null,
                  serverId,
                  serverReferenceCode: serverRefCode,
                  serverSystemId,
                  reconciledPartial,
                  syncedAt: new Date(nowMs).toISOString(),
                };
                await db.put("synced_log", receipt);
                progress = true;
                this.emit();
              } else {
                const errKind = classifyTransportError(res.status, res.errorCode);
                if (refKey) blockedReferralIds.add(refKey);
                if (errKind === "auth_required") {
                  raw.syncState = "AUTH_REQUIRED";
                  raw.errorKind = "auth_required";
                  raw.errorCode = res.errorCode ?? "not_authenticated";
                  raw.nextRetryAt = null;
                  await db.put("items", raw);
                  this.emit();
                  return; // Pause remaining protected sync for this user until re-authenticated
                }

                raw.syncState = "FAILED";
                raw.errorKind = errKind;
                raw.errorCode = res.errorCode ?? `http_${res.status}`;
                raw.nextRetryAt = PERMANENT_ERROR_KINDS.has(errKind)
                  ? null
                  : new Date(nowMs + computeBackoffMs(raw.retryCount)).toISOString();
                await db.put("items", raw);
                this.emit();
              }
            } catch {
              // Network disconnect / fetch exception: schedule exponential backoff retry
              if (refKey) blockedReferralIds.add(refKey);
              raw.syncState = "FAILED";
              raw.errorKind = "network_unavailable";
              raw.errorCode = "network_error";
              raw.nextRetryAt = new Date(nowMs + computeBackoffMs(raw.retryCount)).toISOString();
              await db.put("items", raw);
              this.emit();
            }
          }
        }
      } finally {
        this.inflightByUser.delete(ownerUserId);
      }
    })();

    this.inflightByUser.set(ownerUserId, run);
    return run;
  }
}
