/**
 * FRONTEND §9.1-9.2 & MASTERPLAN §5.5 (INV-16, Q-09):
 * Client-side offline emergency referral queue stored in IndexedDB and encrypted with AES-GCM.
 * State machine: QUEUED_LOCAL -> SYNCING -> SYNCED (local copy cleared) | CONFLICT | FAILED
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

export type EmergencyQueueState =
  | "QUEUED_LOCAL"
  | "SYNCING"
  | "SYNCED"
  | "CONFLICT"
  | "FAILED";

export interface EmergencyVitalItem {
  code: string;
  value: string;
  unit: string;
}

export interface EmergencyMinimumPayload {
  patient_id?: string | null;
  unverified_description?: string;
  reason: string;
  urgency: "emergency" | "urgent";
  vitals: {
    recorded_at: string;
    items: EmergencyVitalItem[];
  };
  treatment_given: string;
}

export interface StoredQueueRecord {
  idempotencyKey: string;
  facilityId: string;
  provisionalCode: string;
  createdAtDevice: string;
  state: EmergencyQueueState;
  attempts: number;
  iv: number[];
  ciphertext: number[];
  serverConflictVersion?: Record<string, unknown> | null;
}

export interface DecryptedQueueItem {
  idempotencyKey: string;
  facilityId: string;
  provisionalCode: string;
  createdAtDevice: string;
  state: EmergencyQueueState;
  attempts: number;
  payload: EmergencyMinimumPayload;
  serverConflictVersion?: Record<string, unknown> | null;
}

export interface SyncTransportResult {
  status: number;
  body: Record<string, unknown>;
}

const STALE_THRESHOLD_MS = 72 * 3600 * 1000; // 72 hours (FRONTEND §9.2)
const PERSISTED_KEY_CACHE = new Map<string, Promise<CryptoKey>>();

export class EmergencyQueueStore {
  private readonly dbName: string;
  private dbPromise: Promise<IDBPDatabase> | null = null;
  private seqCounter = 1;

  constructor(options?: { dbName?: string }) {
    this.dbName = options?.dbName ?? "medi-waypoint-emergency-queue";
  }

  private getDb(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(this.dbName, 2, {
        upgrade(db) {
          if (!db.objectStoreNames.contains("items")) {
            db.createObjectStore("items", { keyPath: "idempotencyKey" });
          }
          if (!db.objectStoreNames.contains("keys")) {
            db.createObjectStore("keys");
          }
        },
      });
    }
    return this.dbPromise;
  }

  private async getKey(): Promise<CryptoKey> {
    const cached = PERSISTED_KEY_CACHE.get(this.dbName);
    if (cached) {
      return cached;
    }
    const loadOrCreate = (async () => {
      const db = await this.getDb();
      try {
        const storedKey = (await db.get("keys", "aes-gcm-master")) as CryptoKey | undefined;
        if (storedKey && typeof storedKey === "object" && "type" in storedKey) {
          return storedKey;
        }
      } catch {
        // Fallback when synthetic test IndexedDB does not support structured cloning of native CryptoKey
      }
      const freshKey = await generateNonExtractableAesKey();
      try {
        await db.put("keys", freshKey, "aes-gcm-master");
      } catch {
        // Keep in PERSISTED_KEY_CACHE keyed by dbName
      }
      return freshKey;
    })();
    PERSISTED_KEY_CACHE.set(this.dbName, loadOrCreate);
    return loadOrCreate;
  }

  async enqueue(params: {
    facilityId: string;
    facilityShortCode?: string;
    createdAtDevice?: string;
    payload: EmergencyMinimumPayload;
  }): Promise<DecryptedQueueItem> {
    const db = await this.getDb();
    const key = await this.getKey();
    const idempotencyKey = createIntentIdempotencyKey();
    const createdAtDevice = params.createdAtDevice ?? new Date().toISOString();
    const provisionalCode = generateProvisionalCode(
      params.facilityShortCode ?? "UHC",
      this.seqCounter++,
      createdAtDevice
    );

    const envelope: EncryptedEnvelope = await encryptPayload(key, params.payload);
    const record: StoredQueueRecord = {
      idempotencyKey,
      facilityId: params.facilityId,
      provisionalCode,
      createdAtDevice,
      state: "QUEUED_LOCAL",
      attempts: 0,
      iv: envelope.iv,
      ciphertext: envelope.ciphertext,
      serverConflictVersion: null,
    };

    await db.put("items", record);
    return {
      idempotencyKey,
      facilityId: params.facilityId,
      provisionalCode,
      createdAtDevice,
      state: "QUEUED_LOCAL",
      attempts: 0,
      payload: params.payload,
      serverConflictVersion: null,
    };
  }

  async inspectRawRecord(idempotencyKey: string): Promise<StoredQueueRecord> {
    const db = await this.getDb();
    const rec = (await db.get("items", idempotencyKey)) as StoredQueueRecord | undefined;
    if (!rec) {
      throw new Error(`Queue record ${idempotencyKey} not found`);
    }
    return rec;
  }

  async listItems(): Promise<DecryptedQueueItem[]> {
    const db = await this.getDb();
    const key = await this.getKey();
    const records = (await db.getAll("items")) as StoredQueueRecord[];
    const items: DecryptedQueueItem[] = [];
    for (const r of records) {
      const payload = await decryptPayload<EmergencyMinimumPayload>(key, {
        iv: r.iv,
        ciphertext: r.ciphertext,
      });
      items.push({
        idempotencyKey: r.idempotencyKey,
        facilityId: r.facilityId,
        provisionalCode: r.provisionalCode,
        createdAtDevice: r.createdAtDevice,
        state: r.state,
        attempts: r.attempts,
        payload,
        serverConflictVersion: r.serverConflictVersion,
      });
    }
    return items;
  }

  async hasStaleItemsOver72Hours(nowMs: number = Date.now()): Promise<boolean> {
    const db = await this.getDb();
    const records = (await db.getAll("items")) as StoredQueueRecord[];
    return records.some((r) => {
      const age = nowMs - new Date(r.createdAtDevice).getTime();
      return age > STALE_THRESHOLD_MS;
    });
  }

  async syncAll(
    transport: (item: DecryptedQueueItem) => Promise<SyncTransportResult>
  ): Promise<void> {
    const db = await this.getDb();
    const items = await this.listItems();

    for (const item of items) {
      if (item.state === "CONFLICT") {
        continue; // Staff must resolve conflict explicitly (FRONTEND §9.2)
      }

      const raw = (await db.get("items", item.idempotencyKey)) as StoredQueueRecord | undefined;
      if (!raw) continue;

      raw.state = "SYNCING";
      raw.attempts += 1;
      await db.put("items", raw);

      try {
        const res = await transport(item);
        if (res.status === 200 || res.status === 201) {
          // SYNCED -> delete local encrypted copy immediately (FRONTEND §9.2, SECURITY §6.3)
          await db.delete("items", item.idempotencyKey);
        } else if (res.status === 409) {
          raw.state = "CONFLICT";
          raw.serverConflictVersion =
            (res.body.stored_version as Record<string, unknown> | undefined) ?? res.body;
          await db.put("items", raw);
        } else {
          raw.state = "FAILED";
          await db.put("items", raw);
        }
      } catch {
        raw.state = "FAILED";
        await db.put("items", raw);
      }
    }
  }
}
