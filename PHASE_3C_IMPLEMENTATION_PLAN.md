# Phase 3C Implementation Plan — Unified Encrypted Offline Queue & Reliable Synchronization

**Date:** 2026-11-24  
**Scope:** Strictly Phase 3C (Unified AES-GCM encrypted IndexedDB offline queue supporting `emergency_referral`, `standard_referral`, `patient_create` dependencies, and `referral_action` status updates; 5-state sync machine + `AUTH_REQUIRED`; exponential backoff; `OfflineSyncBar` UI foundation; comprehensive Vitest suite; minimal `MASTERPLAN.md` update).

---

## 1. Existing Queue Architecture & API Verification

- **Existing Offline Store (`frontend/src/offline/`):** `EmergencyQueueStore` (`queue.ts`, `crypto.ts`, `provisionalCode.ts`, `store.ts`) uses `idb` v8 + non-extractable Web Crypto `AES-GCM` (256-bit, 12-byte random IV). Preserved 100% intact for `/emergency` and `offline.test.tsx`.
- **Verified Backend API Contracts (Zero Backend Changes Needed):**
  - `POST /api/v1/patients/` — idempotent via `Idempotency-Key` (`IdempotencyMiddleware`, user-scoped) and returns `{ id, system_id: "MWP-XXXXXXXX", ... }`.
  - `POST /api/v1/referrals/` — DB-backed facility-scoped idempotency (`Idempotency-Key` header + `provisional_code`) and automatic Phase 3B partial-intake reconciliation (`201` new / `200` replay or reconciled / `409` conflict).
  - `POST /api/v1/referrals/emergency` — idempotent via `EmergencyReferral.idempotency_key`.
  - `POST /api/v1/referrals/{id}/actions/{action}` — idempotent via `Idempotency-Key` + optimistic concurrency via `If-Match` (`expectedVersion`).

---

## 2. Files to Create / Modify

| File | Change |
|---|---|
| `frontend/src/offline/unifiedQueue.ts` | **New** — `UnifiedOfflineQueueStore` supporting `patient_create`, `standard_referral`, `emergency_referral`, and `referral_action` with dependency resolution, 5-state sync machine + `AUTH_REQUIRED`, error classification, exponential backoff, user/facility scoping, corrupted-key recovery state, and `synced_log` non-PII receipts. |
| `frontend/src/offline/syncTransport.ts` | **New** — Production transport adapter wiring `UnifiedOfflineQueueStore` to `ApiClient` (`POST /patients/`, `POST /referrals/`, `POST /referrals/emergency`, `POST /referrals/{id}/actions/{action}`) with proper `Idempotency-Key`, `If-Match`, and Phase 3B reconciliation detection. |
| `frontend/src/offline/store.ts` | Export shared `unifiedOfflineStore` alongside existing `emergencyStore`. |
| `frontend/src/components/offline/OfflineSyncBar.tsx` | **New** — Design-token-compliant bilingual sync status bar & minimal queue drawer (pending count, sync state badges, Retry Now, Auth-required indicator, non-PII receipts). |
| `frontend/src/app/[locale]/(clinician)/layout.tsx` | Mount `<OfflineSyncBar />` inside the clinical workspace layout. |
| `frontend/src/i18n/messages/en.json` & `bn.json` | Add `offlineSync.*` bilingual strings. |
| `frontend/src/offline/__tests__/phase3c-sync.test.ts` | **New** — Comprehensive Vitest suite covering encryption, key recovery, corruption, all 4 item types, patient-to-referral dependency rewriting, offline actions ordering, auth expiration/restoration, backoff, conflict/reconciliation, and multi-user isolation. |
| `MASTERPLAN.md` | Add §10 Interface Ledger row documenting the Phase 3C offline sync contract. |

---

## 3. Encryption & Key Lifecycle

- **Generation:** `crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])` (non-extractable).
- **Persistence & Recovery:** Stored in IndexedDB `keys` object store (`"aes-gcm-master"`), surviving page refresh and browser restart; falls back to per-`dbName` in-memory `CryptoKey` cache in synthetic test environments where `fake-indexeddb` cannot structured-clone native `CryptoKey`.
- **Missing/Corrupted Key Handling:** If decryption fails (wrong key, missing key, or corrupted ciphertext), the item is **never silently deleted**—it is surfaced in `FAILED` state with `errorKind: "decryption_key_unavailable"` so the user sees an explicit recovery alert.
- **User Isolation & Logout:** Each record stores `ownerUserId` and `facilityId` in non-PII metadata. `listItemsForUser(userId)` and `syncForUser(userId, ...)` strictly filter to the signed-in user; logout pauses sync without deleting encrypted records, and a different user on the same device cannot view or sync another user's pending queue.
- **Post-Sync Cleanup:** On confirmed server `200`/`201`/`202`, encrypted `ciphertext` is immediately deleted from `items` and replaced with a non-PII receipt in `synced_log`.
