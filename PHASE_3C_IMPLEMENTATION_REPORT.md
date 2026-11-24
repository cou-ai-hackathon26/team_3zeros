# Phase 3C Implementation Report — Unified Encrypted Offline Queue & Reliable Synchronization

**Date:** 2026-11-24  
**Scope:** Phase 3C ONLY (Frontend Unified Offline Queue, AES-GCM Encryption, Dependency Resolution, Ordered Action Sync, Auth Recovery, and Minimal Sync UI Foundation)  
**Branch:** `development` (uncommitted, awaiting Phase 3C Approval Gate)

---

## 1. Executive Summary

Phase 3C extends Medi Waypoint's existing encrypted IndexedDB offline architecture (`frontend/src/offline/`) into a unified, user-scoped, dependency-aware offline synchronization engine supporting:

1. **Offline patient registration** (`patient_create`, including phone-less patients without email/account).
2. **Standard referrals** (`standard_referral`, including referrals linked to offline-created patients via `local-pat-*` temporary references and `provisional_code` for Phase 3B partial-intake reconciliation).
3. **Emergency referrals** (`emergency_referral`, alongside the 100% preserved existing `EmergencyQueueStore` and `/emergency` page).
4. **Ordered referral status updates** (`referral_action`: `acknowledge`, `decline`, `start`, `record_outcome`, `request_consent`, `close`, `close_with_exception`).
5. **Minimal Sync UI Foundation** (`OfflineSyncBar` + expandable non-PII queue drawer, bilingual `en`/`bn`, Handover design tokens, mounted in `(clinician)/layout.tsx`).

All 77 frontend tests (13 new Phase 3C tests + 64 existing regression tests), TypeScript typechecking (`tsc --noEmit`), and design token linting (`npm run lint:tokens`) pass with zero errors.

---

## 2. Files Added & Modified

### New Files
- [`PHASE_3C_IMPLEMENTATION_PLAN.md`](file:///d:/medi_waypoint/PHASE_3C_IMPLEMENTATION_PLAN.md) — Pre-implementation audit and technical plan.
- [`frontend/src/offline/unifiedQueue.ts`](file:///d:/medi_waypoint/frontend/src/offline/unifiedQueue.ts) — `UnifiedOfflineQueueStore`, encrypted IndexedDB schema (`medi-waypoint-unified-offline-v1`), dependency resolution, single-flight sync engine, error classification, exponential backoff, auth pause/resume, and non-PII synced receipts.
- [`frontend/src/offline/syncTransport.ts`](file:///d:/medi_waypoint/frontend/src/offline/syncTransport.ts) — `createUnifiedSyncTransport(api)` HTTP adapter mapping all 4 `OfflineItemKind` types to canonical backend endpoints with `Idempotency-Key` and `If-Match`.
- [`frontend/src/components/offline/OfflineSyncBar.tsx`](file:///d:/medi_waypoint/frontend/src/components/offline/OfflineSyncBar.tsx) — Minimal workspace sync status bar + expandable non-PII queue drawer with automatic `online`/`offline`/`focus`/interval triggers, "Retry now", and "Sign in to sync".
- [`frontend/src/offline/__tests__/phase3c-sync.test.tsx`](file:///d:/medi_waypoint/frontend/src/offline/__tests__/phase3c-sync.test.tsx) — 13 comprehensive Vitest unit & integration tests covering encryption, key recovery, user isolation, single-flight lock, patient dependency resolution, FIFO action sync, backoff, auth expiry, Phase 3B reconciliation receipts, and `OfflineSyncBar` PHI safety.

### Modified Files
- [`frontend/src/offline/store.ts`](file:///d:/medi_waypoint/frontend/src/offline/store.ts) — Exported `unifiedOfflineStore` singleton alongside untouched `emergencyStore`.
- [`frontend/src/app/[locale]/(clinician)/layout.tsx`](file:///d:/medi_waypoint/frontend/src/app/[locale]/(clinician)/layout.tsx) — Mounted `<OfflineSyncBar />` inside `<RequireArea area="clinical">`.
- [`frontend/src/i18n/messages/en.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/en.json) — Added `offlineSync.*` English messages.
- [`frontend/src/i18n/messages/bn.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/bn.json) — Added `offlineSync.*` Bangla messages (full parity verified by `i18n.test.ts`).
- [`MASTERPLAN.md`](file:///d:/medi_waypoint/MASTERPLAN.md) — Added Phase 3C entry to §10 Interface Ledger.

---

## 3. Queue Architecture & IndexedDB Schema

- **Database:** `medi-waypoint-unified-offline-v1` (separate from `medi-waypoint-emergency-queue` so zero migration risk or disruption to existing `/emergency` records).
- **Object Stores:**
  - `items` (keyPath: `queueId`): Stores non-PII operational metadata (`kind`, `idempotencyKey`, `ownerUserId`, `facilityId`, `provisionalCode`, `tempEntityRef`, `dependsOnQueueId`, `sequenceOrder`, `createdAtDevice`, `lastAttemptAt`, `nextRetryAt`, `retryCount`, `syncState`, `errorKind`, `errorCode`) alongside `iv` (96-bit random IV) and `ciphertext` (AES-GCM encrypted payload).
  - `synced_log` (keyPath: `queueId`): Non-PII 24-hour receipts (`serverId`, `serverReferenceCode`, `serverSystemId`, `reconciledPartial`, `syncedAt`) persisted after encrypted clinical payloads are immediately deleted on confirmed `200`/`201`/`202`.
  - `keys`: Stores the non-extractable Web Crypto AES-GCM `CryptoKey` (`aes-gcm-master`).

---

## 4. Encryption, Key Management & Data Safety

- Reuses [`frontend/src/offline/crypto.ts`](file:///d:/medi_waypoint/frontend/src/offline/crypto.ts) (`AES-GCM`, 256-bit non-extractable `CryptoKey`, unique random 12-byte IV per encryption).
- Zero plaintext PHI in IndexedDB metadata, `localStorage`, error messages, or UI labels.
- **Non-destructive key/corruption recovery:** If the encryption key is missing or ciphertext fails AES-GCM authentication, `listItemsForUser` marks the record `FAILED` with `errorKind = "decryption_key_unavailable"` and `payload = null` **without** silently deleting the encrypted record.
- **Shared-device isolation:** Every query (`listItemsForUser`, `listSyncedReceiptsForUser`, `syncForUser`, `resumeAfterAuth`) filters strictly by `ownerUserId`.

---

## 5. Dependency Resolution, Ordering & Idempotency

- **Offline Patient -> Standard Referral Dependency:**
  1. `enqueueOfflinePatient` assigns a temporary reference `local-pat-<uuid>`.
  2. `enqueueStandardReferral` accepts `dependsOnQueueId: patientItem.queueId` and stores `patient_id: "local-pat-<uuid>"` inside the encrypted payload.
  3. During `syncForUser`, dependent items wait while their parent remains in `items`, without blocking independent queue items.
  4. When `patient_create` succeeds (`201`/`200` returning `{ id, system_id }`), `resolveDependents` decrypts dependent records, replaces `patient_id` with the canonical server UUID, attaches `patient_system_id`, re-encrypts with a fresh random IV, clears `dependsOnQueueId`, and syncs the dependent referral in the same run.
- **Ordered Referral Status Updates:**
  - `sequenceOrder` guarantees strict FIFO processing (`acknowledge` -> `start` -> `record_outcome`).
  - `createUnifiedSyncTransport` sends `Idempotency-Key` and `If-Match` (`expected_version`) headers to `/referrals/{id}/actions/{action}`.
- **Phase 3B Partial-Intake Reconciliation:**
  - `standard_referral` sends both `Idempotency-Key` and `provisional_code` to `POST /api/v1/referrals/`.
  - When the backend returns `200` with `reconciled_at`, the non-PII `SyncedReceipt` sets `reconciledPartial: true`, surfaced in the queue drawer as `"Merged with receiving partial intake"` (bilingual).

---

## 6. Sync Lifecycle, Backoff, Concurrency & Auth Recovery

- **States:** `SAVED_LOCAL`, `PENDING_SYNC`, `SYNCING`, `SYNCED` (via `synced_log`), `FAILED`, and `AUTH_REQUIRED`.
- **Single-flight lock:** `inflightByUser` map prevents overlapping sync runs from double-sending the same item.
- **Backoff & Error Classification:**
  - Transient errors (`network_unavailable`, `server_unavailable`) schedule exponential backoff: `5s -> 15s -> 30s -> 60s -> 120s`, reusing the exact same `idempotencyKey` on every retry.
  - Permanent errors (`validation_rejected`, `permission_denied`, `conflict`, `decryption_key_unavailable`) stop automatic retries (`nextRetryAt = null`) to avoid infinite loops or overwriting server state.
  - Session expiry (`401` or DRF `403` with `error.code === "not_authenticated"`) transitions the item to `AUTH_REQUIRED` and pauses remaining items for that user. Upon re-authentication, `resumeAfterAuth(userId)` transitions paused items back to `PENDING_SYNC` and resumes synchronization.

---

## 7. Verification Results

All commands executed directly in `d:\medi_waypoint\frontend`:

| Check | Command | Result |
|---|---|---|
| Phase 3C & Regression Tests | `npx vitest run src/offline/offline.test.tsx src/offline/__tests__/phase3c-sync.test.tsx src/i18n/i18n.test.ts src/app/clinical-pages.test.tsx src/app/ed-pages.test.tsx` | **PASSED — 5 / 5 files, 77 / 77 tests** (`phase3c-sync.test.tsx` 13/13, `offline.test.tsx` 4/4, `i18n.test.ts` 9/9, `ed-pages.test.tsx` 4/4, `clinical-pages.test.tsx` 47/47) |
| TypeScript Typecheck | `npx tsc --noEmit` | **PASSED — 0 errors** |
| Design Token Lint | `npm run lint:tokens` | **PASSED — 176 files checked, 0 violations** |

---

## 8. Scope Boundaries & Handoff to Phase 3D

- **Strictly Out of Scope (not implemented in Phase 3C):** Phone-less patient registration UI (`RegisterPatientForm`), `ReferralSlip` + QR code generation, `PartialReferralModal`, assisted in-person consent UI, and wiring `/referrals/new` or `/referrals/[id]` forms to enqueue offline items (all reserved for Phase 3D).
- **Zero Backend Changes:** All endpoints and contracts from Phase 3A and Phase 3B worked as verified without modification.
- **Git Status:** No commits or pushes performed. Ready for **Phase 3C Approval Gate**.
