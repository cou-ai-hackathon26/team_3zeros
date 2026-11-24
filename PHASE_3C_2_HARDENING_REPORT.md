# Phase 3C.2 — Critical Reliability Hardening Report

**Date:** 2026-11-24  
**Scope:** Targeted fixes ONLY for confirmed Phase 3C.1 findings (**F-1** through **F-6**). No Phase 3D work started; no Git commits or pushes performed.

---

## 1. Executive Summary & Approval Readiness

All six confirmed findings from Phase 3C.1 (**F-1** through **F-6**) have been resolved with minimal, surgical fixes and verified with dedicated frontend and backend regression tests.

**Can Phase 3C now be approved?** **Yes — PASS (ready for Phase 3D).**  
Every cryptographic, persistence, ordering, idempotency, CSRF/session recovery, permanent-error recovery, and concurrency invariant holds under automated verification. *(Live browser end-to-end verification of Audit 7 remains deferred until Phase 3D wires the phone-less patient registration and offline standard referral UI forms to `unifiedOfflineStore`.)*

---

## 2. Detailed Findings, Root Causes, Fixes & Before/After Behaviour

### F-2 (High — Highest Priority): Per-Referral FIFO Action Ordering
- **Original Finding:** Unlinked sequential `referral_action` items for the same `referral_id` continued syncing after an earlier action failed transiently, causing action N+1 to hit premature permanent `412 stale_version` (`conflict`).
- **Root Cause:** `enqueueReferralAction` did not chain `dependsOnQueueId` across actions targeting the same referral, and `syncForUser` did not track failed `referral_id`s within a sync pass.
- **Files Changed:** [`frontend/src/offline/unifiedQueue.ts`](file:///d:/medi_waypoint/frontend/src/offline/unifiedQueue.ts)
- **Exact Fix:**
  1. Added non-PII `targetReferralId` on `StoredUnifiedRecord` and `DecryptedUnifiedItem`.
  2. `enqueueReferralAction` automatically chains `dependsOnQueueId` to the latest queued item for the same `(ownerUserId, referral_id)` (whether a prior `referral_action` or an offline `standard_referral`/`emergency_referral`), persisted in IndexedDB so FIFO survives reload/restart.
  3. Added a `blockedReferralIds` guard in `syncForUser` so any transient or permanent failure on a referral blocks subsequent actions for that same referral while unrelated referrals continue syncing independently.
  4. Updated `resolveDependents` to unblock chained `referral_action` children when their parent succeeds and update `targetReferralId` when an offline referral obtains its canonical server UUID.
- **Before / After:** Before: `acknowledge` timeout -> `start` attempted immediately -> `412 stale_version` permanent conflict. After: `acknowledge` timeout -> `start` remains blocked in `SAVED_LOCAL` -> on retry `acknowledge` succeeds with the exact same `idempotencyKey`, then `start` executes cleanly; unrelated referrals sync without waiting.

### F-1 (Medium): Authentication & Idempotency Consistency
- **Original Finding:** `IdempotencyMiddleware` worked for Django `SessionAuthentication` (production browser auth) because `AuthenticationMiddleware` precedes it, but missed replay for DRF-layer authentication (`force_authenticate`/token/JWT), creating duplicate patients on retry. Also, `IdempotencyRecord` was written outside `create_patient_record`'s atomic transaction.
- **Supported Auth Methods:** Verified in [`backend/config/settings/base.py`](file:///d:/medi_waypoint/backend/config/settings/base.py#L162-L165): Medi Waypoint intentionally supports **only** `rest_framework.authentication.SessionAuthentication` (first-party HttpOnly session cookies per SECURITY §3.3). Token/JWT auth is intentionally unsupported in production.
- **Files Changed:**
  - [`backend/apps/common/idempotency.py`](file:///d:/medi_waypoint/backend/apps/common/idempotency.py) (new)
  - [`backend/apps/identity/views.py`](file:///d:/medi_waypoint/backend/apps/identity/views.py)
  - [`backend/apps/referrals/views.py`](file:///d:/medi_waypoint/backend/apps/referrals/views.py)
- **Exact Fix:** Added view-level `resolve_idempotent_replay(request)` and `persist_idempotent_response(request, response)` scoped strictly to `(key, endpoint, user=request.user)` inside `PatientListCreateView.post` (wrapped in `transaction.atomic()`) and `ReferralActionView.post`. Preserves payload-mismatch `409 idempotency_conflict` and cross-user isolation.
- **Before / After:** Before: DRF-layer `force_authenticate` retries created 2 patients. After: Both `SessionAuthentication` and DRF-layer auth replay `201`/`200` with `X-Idempotent-Replay: true`, 0 duplicates, `409` on payload mismatch, and zero cross-user leakage.

### F-5 (Medium): CryptoKey Persistence Failure
- **Original Finding:** `getKey(true)` silently caught `db.put("keys", freshKey, "aes-gcm-master")` failures and cached the key only in module-level `KEY_CACHE`, risking unrecoverable records after refresh.
- **Root Cause:** Catch block swallowed IndexedDB write errors instead of failing closed.
- **Files Changed:** [`frontend/src/offline/unifiedQueue.ts`](file:///d:/medi_waypoint/frontend/src/offline/unifiedQueue.ts)
- **Exact Fix:** Exported `OfflineStorageKeyError`; if `db.put("keys", freshKey, "aes-gcm-master")` fails, `getKey(true)` clears `KEY_CACHE` for that DB and throws `OfflineStorageKeyError` so `enqueue*` never claims durable encrypted storage for an unrecoverable item. Existing ciphertext remains untouched.
- **Before / After:** Before: Key-write failure silently enqueued an item that could not survive reload. After: Enqueue fails closed with `OfflineStorageKeyError` and writes zero unrecoverable records; existing ciphertext is preserved non-destructively.

### F-4 (Medium): CSRF & Session Recovery
- **Original Finding:** An offline-stale CSRF cookie (`403 CSRF Failed` / `csrf_failed`) was classified as permanent `permission_denied`, permanently halting sync.
- **Root Cause:** `createUnifiedSyncTransport` did not mirror `useAuth().post`'s single-attempt `/auth/me` CSRF cookie refresh.
- **Files Changed:** [`frontend/src/offline/syncTransport.ts`](file:///d:/medi_waypoint/frontend/src/offline/syncTransport.ts)
- **Exact Fix:** On `ApiError` with `code === "csrf_failed"` or `403` matching `/^CSRF Failed/i`, transport calls `api.get("/auth/me")` once:
  - If `/auth/me` fails with `401` / `not_authenticated` / `mfa_required`, returns `{ status: 401, errorCode: "not_authenticated" }` so the queue pauses safely with `AUTH_REQUIRED`.
  - If `/auth/me` succeeds, retries the exact same request **once** with the original `idempotencyKey`.
  - If the retry still fails CSRF, returns `403 csrf_failed` (permanent, never loops, never treated as synced).
- **Before / After:** Before: Stale CSRF permanently blocked sync as `permission_denied`. After: Single automatic CSRF refresh succeeds seamlessly or cleanly pauses with `AUTH_REQUIRED` if the session expired.

### F-3 (Medium): Permanent Error Recovery
- **Original Finding:** Users had no way to edit/correct or deliberately discard permanent `FAILED` (`400`/`409`/`412`) items without losing data or leaving stuck records.
- **Root Cause:** No recovery mutation methods existed on `UnifiedOfflineQueueStore` or `OfflineSyncBar`.
- **Files Changed:**
  - [`frontend/src/offline/unifiedQueue.ts`](file:///d:/medi_waypoint/frontend/src/offline/unifiedQueue.ts)
  - [`frontend/src/components/offline/OfflineSyncBar.tsx`](file:///d:/medi_waypoint/frontend/src/components/offline/OfflineSyncBar.tsx)
  - [`frontend/src/i18n/messages/en.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/en.json)
  - [`frontend/src/i18n/messages/bn.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/bn.json)
- **Exact Fix:**
  1. Added `updateFailedItemPayload(ownerUserId, queueId, updatedPayload)` — enforces `ownerUserId`, refuses editing `SYNCING`, `SYNCED`, or `decryption_key_unavailable` items, re-encrypts with a fresh random 96-bit IV, rotates `idempotencyKey` (so corrected payloads are not rejected as `409`), and resets to `PENDING_SYNC`.
  2. Added `discardFailedItem(ownerUserId, queueId, reason)` — enforces `ownerUserId` and non-empty reason, refuses discarding active `SAVED_LOCAL`/`PENDING_SYNC`/`SYNCING` items, and marks direct dependent items `FAILED` (`parent_discarded`) instead of silently deleting or unblocking them.
  3. Added a deliberate two-step **Discard → Confirm discard / Cancel** flow in `OfflineSyncBar` drawer for `FAILED` items.
- **Before / After:** Before: Permanent errors could only be retried verbatim. After: Editable failed payloads can be corrected and retried safely, and ineligible/obsolete failed items can be deliberately discarded with two-step confirmation without silently dropping dependent records.

### F-6 (Low): HTTP 423 (`sync_pending`) Classification
- **Assessment:** Confirmed minor classification defect (`backend/apps/common/exceptions.py:85-88` returns HTTP `423` with `code = "sync_pending"` during locked FHIR writes).
- **Files Changed:** [`frontend/src/offline/unifiedQueue.ts`](file:///d:/medi_waypoint/frontend/src/offline/unifiedQueue.ts)
- **Exact Fix:** Mapped `status === 423 || errorCode === "sync_pending"` explicitly to `"server_unavailable"` (transient backoff retry).

---

## 3. Verification & Regression Test Results

| Check | Command | Result |
|---|---|---|
| Frontend Hardening & Sync Suites | `cd d:\medi_waypoint\frontend; npx vitest run src/offline/__tests__/phase3c2-hardening.test.tsx src/offline/__tests__/phase3c-sync.test.tsx src/offline/offline.test.tsx src/i18n/i18n.test.ts` | **PASSED — 4 / 4 files, 38 / 38 tests** (`phase3c2-hardening.test.tsx` 12/12, `phase3c-sync.test.tsx` 13/13, `offline.test.tsx` 4/4, `i18n.test.ts` 9/9) |
| Frontend Phase 3C.1 Audit Suite (post-fix) | `cd d:\medi_waypoint\frontend; npx vitest run src/offline/__audit__/phase3c1-reliability-audit.test.tsx` | **PASSED — 12 / 12 tests** |
| Backend Phase 3A, 3B & 3C.2 Suites | `cd d:\medi_waypoint\backend; .\.venv\Scripts\pytest.exe tests/test_phase3c2_idempotency_hardening.py tests/test_phase3a_foundation.py tests/test_phase3b_partial_intake.py -v` | **PASSED — 19 / 19 tests** (`test_phase3c2_idempotency_hardening.py` 3/3, `test_phase3a_foundation.py` 9/9, `test_phase3b_partial_intake.py` 7/7) |
| Backend Phase 3C.1 Audit Suite (post-fix) | `cd d:\medi_waypoint\backend; .\.venv\Scripts\pytest.exe tests/audit_phase3c1/test_phase3c1_backend_reliability.py -v` | **PASSED — 4 / 4 tests** |
| TypeScript Typecheck | `cd d:\medi_waypoint\frontend; npx tsc --noEmit` | **PASSED — 0 errors** |
| Design Token Lint | `cd d:\medi_waypoint\frontend; npm run lint:tokens` | **PASSED — 176 files, 0 violations** |
| Django System Check | `cd d:\medi_waypoint\backend; .\.venv\Scripts\python.exe manage.py check` | **PASSED — 0 issues** |

---

## 4. Security, Data-Loss & Unresolved Items

- **Security & Data-Loss Posture:** Zero plaintext PHI outside AES-GCM ciphertext; fail-closed key persistence (`OfflineStorageKeyError`) prevents silently creating unrecoverable records; strict `ownerUserId` and backend `user=request.user` isolation; atomic `Patient` + `IdempotencyRecord` persistence; two-step deliberate discard never silently drops dependents.
- **Unresolved / Deferred:** Live browser end-to-end execution of Audit 7 (Steps 1–11) remains deferred until Phase 3D builds and wires the offline phone-less patient registration and standard referral forms. No `MASTERPLAN.md` contract changes were needed because no external API schemas or endpoints changed.
