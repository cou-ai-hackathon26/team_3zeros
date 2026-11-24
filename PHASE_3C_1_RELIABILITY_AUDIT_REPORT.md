# Phase 3C.1 — Offline Reliability & Failure-Recovery Audit Report

**Date:** 2026-11-24  
**Scope:** Independent Reliability & Security Audit of Phase 3C (Read-Only — Zero Application Code Modified)  
**Isolated Audit Suites Created:**
- Frontend: [`frontend/src/offline/__audit__/phase3c1-reliability-audit.test.tsx`](file:///d:/medi_waypoint/frontend/src/offline/__audit__/phase3c1-reliability-audit.test.tsx)
- Backend: [`backend/tests/audit_phase3c1/test_phase3c1_backend_reliability.py`](file:///d:/medi_waypoint/backend/tests/audit_phase3c1/test_phase3c1_backend_reliability.py)

---

## 1. Executive Verdict

**VERDICT: CONDITIONAL PASS**

Phase 3C's core cryptographic, persistence, idempotency, dependency-resolution, multi-user isolation, and server-side optimistic-concurrency guarantees are **sound and verified** for Medi Waypoint's session-cookie web architecture. Existing emergency queue functionality has **zero regressions**.

The verdict is **CONDITIONAL PASS** rather than unconditional PASS for two reasons:
1. **Audit 7 (Browser-Level Offline Workflow) is `NOT VERIFIED`** because the user-facing offline phone-less patient registration and offline standard referral submission forms are Phase 3D deliverables (out of scope for Phase 3C), so end-to-end browser UI execution cannot yet be performed.
2. **Four concrete reliability defects/gaps (1 High, 3 Medium)** were independently uncovered during adversarial probing (same-referral action chaining on transient failure, CSRF refresh on offline-stale cookies, missing edit/discard recovery for permanent errors, and non-session DRF auth idempotency bypass) that should be fixed with minimal targeted patches before production/pilot deployment.

---

## 2. File-by-File Audit Findings

| File | Assessment | Key Observations |
|---|---|---|
| [`frontend/src/offline/crypto.ts`](file:///d:/medi_waypoint/frontend/src/offline/crypto.ts) | **PASS** | Uses Web Crypto `AES-GCM` 256-bit with `extractable: false` and fresh `crypto.getRandomValues(new Uint8Array(12))` IV per encryption. |
| [`frontend/src/offline/unifiedQueue.ts`](file:///d:/medi_waypoint/frontend/src/offline/unifiedQueue.ts) | **CONDITIONAL PASS** | Strong user scoping (`ownerUserId`), single-flight lock (`inflightByUser`), non-destructive `decryption_key_unavailable` handling, and `patient_create -> standard_referral` dependency rewriting. **Gaps:** (1) Unlinked sequential `referral_action` items on the same `referral_id` continue after an earlier action fails (**F-2, High**); (2) `db.put("keys", ...)` failure is silently swallowed into in-memory `KEY_CACHE` (**F-5, Medium**); (3) No update/discard method for permanent validation/conflict items (**F-3, Medium**); (4) `423 sync_pending` falls through to `"unknown"` (**F-6, Low**). |
| [`frontend/src/offline/syncTransport.ts`](file:///d:/medi_waypoint/frontend/src/offline/syncTransport.ts) | **CONDITIONAL PASS** | Correctly forwards `Idempotency-Key`, `provisional_code`, and `If-Match` (`expectedVersion`) headers and separates `ApiError` from network exceptions. **Gap:** Does not handle Django's `403 CSRF Failed` by refreshing `/auth/me` as `useAuth().post` does (**F-4, Medium**). |
| [`frontend/src/components/offline/OfflineSyncBar.tsx`](file:///d:/medi_waypoint/frontend/src/components/offline/OfflineSyncBar.tsx) | **PASS** | Renders zero PHI in bar or drawer; handles `online`/`offline`/`focus`/interval triggers; surfaces `AUTH_REQUIRED` sign-in link and `reconciledPartial` indicator. Note: Permanent error items currently only offer "Retry now" (tied to **F-3**). |
| [`frontend/src/auth/me.ts`](file:///d:/medi_waypoint/frontend/src/auth/me.ts) | **PASS** | `signOut()` calls `clearBrowserCaches()`, which clears only Service Worker `caches` and leaves IndexedDB untouched. |
| [`frontend/src/offline/queue.ts`](file:///d:/medi_waypoint/frontend/src/offline/queue.ts) | **PASS** | Completely untouched by Phase 3C; uses separate IndexedDB (`medi-waypoint-emergency-queue`). |
| [`backend/apps/common/middleware.py`](file:///d:/medi_waypoint/backend/apps/common/middleware.py) | **CONDITIONAL PASS** | Correctly enforces user-scoped idempotency replay for session-cookie requests (`AuthenticationMiddleware` precedes `IdempotencyMiddleware` in `base.py`). **Gap:** Fails for non-session DRF auth (`force_authenticate`/token/JWT) because `process_request` runs before DRF authentication (**F-1, Medium**), and writes `IdempotencyRecord` outside `create_patient_record`'s atomic transaction. |
| [`backend/apps/referrals/views.py`](file:///d:/medi_waypoint/backend/apps/referrals/views.py) & [`backend/apps/workflow/engine.py`](file:///d:/medi_waypoint/backend/apps/workflow/engine.py) | **PASS** | `ReferralActionView` parses `If-Match` as integer and passes it to `execute_referral_transition` (`select_for_update()` + `transaction.atomic()`), enforcing `StaleVersionError` (`412`) and `TransitionNotAllowedError` (`409`). |

---

## 3. Encryption Key Lifecycle Analysis

1. **Generation:** `generateNonExtractableAesKey()` in `crypto.ts` generates a 256-bit `AES-GCM` `CryptoKey` with `extractable = false` and usages `["encrypt", "decrypt"]`.
2. **Persistence:** `UnifiedOfflineQueueStore.getKey(true)` persists the `CryptoKey` handle into the IndexedDB `keys` object store under key `"aes-gcm-master"` via structured cloning, and caches the `Promise<CryptoKey>` in module-level `KEY_CACHE` keyed by `dbName`.
3. **Refresh / Restart Survival:** Verified in our isolated audit test by explicitly clearing `KEY_CACHE` (`clearInMemoryKeyCacheForTesting()`) and instantiating a fresh `UnifiedOfflineQueueStore({ dbName })`. The key was reloaded from IndexedDB and decrypted the queued record cleanly. *(Note: production test #3 in `phase3c-sync.test.tsx` omitted `clearInMemoryKeyCacheForTesting()`, so it had only tested in-memory cache hits.)*
4. **Missing Key / Corrupted Ciphertext:** `listItemsForUser` calls `getKey(false)`. If the key is missing or AES-GCM decryption fails, the record is marked `FAILED` (`decryption_key_unavailable`, `payload: null`) and **preserved intact** in IndexedDB. Even if a new record is later enqueued (which generates a fresh master key), the old undecryptable ciphertext is still preserved non-destructively.
5. **Key Persistence Failure Risk (F-5):** If `db.put("keys", freshKey, "aes-gcm-master")` throws (e.g., browser storage quota or restricted context), the `catch` block silently keeps the key only in `KEY_CACHE`, meaning items encrypted in that session would become undecryptable after reload.
6. **Logout & Account Switching:** `clearBrowserCaches()` in `me.ts` only deletes `window.caches` (Service Worker caches), never IndexedDB. Pending encrypted items survive logout and remain isolated by `ownerUserId`.
7. **PHI Exposure:** Inspected raw IndexedDB records (`inspectRawRecord`), `SyncedReceipt`, error classifications, and rendered `OfflineSyncBar` DOM. Zero plaintext patient names, phone numbers, or clinical reasons appear outside AES-GCM `ciphertext`.

---

## 4. Test Scenario Matrix

| Audit | Scenario | Verification Type | Status |
|---|---|---|---|
| **1** | AES-GCM non-extractable key + unique 96-bit IV + zero plaintext PHI | Automated test + Code inspection | **PASS** |
| **1** | True reload key & ciphertext recovery (after clearing in-memory `KEY_CACHE`) | Isolated Vitest audit test | **PASS** |
| **1** | Missing key / corrupted ciphertext preserves encrypted record non-destructively | Isolated Vitest audit test | **PASS** |
| **1** | Logout (`clearBrowserCaches()`) preserves encrypted IndexedDB records | Isolated Vitest audit test | **PASS** |
| **2** | Lost HTTP response on `POST /api/v1/patients/` (session-cookie auth) -> 1 patient, original `id` + `MWP-*` recovered, `409` on payload mismatch | Real Django backend pytest | **PASS** |
| **2** | Lost HTTP response on `POST /api/v1/patients/` (non-session DRF auth) | Real Django backend pytest (probe) | **FAIL (F-1)** |
| **2** | Lost HTTP response on `POST /api/v1/referrals/` -> 1 referral, same `Idempotency-Key` | Real Django backend pytest | **PASS** |
| **3** | Offline patient -> dependent standard referral -> true reload -> reconnect -> sync (`local-pat-*` replaced, `MWP-*` propagated) | Isolated Vitest audit test | **PASS** |
| **3** | Failed patient creation blocks dependent referral while independent items sync | Automated test (Phase 3C) | **PASS** |
| **3** | Sequential unlinked `referral_action` items on same referral when action #1 fails transiently | Isolated Vitest audit test (probe) | **FAIL (F-2)** |
| **4** | User A queues -> logout -> User B login & sync -> User A login (strict isolation) | Isolated Vitest audit test | **PASS** |
| **5** | Error matrix: timeout, `401`, `403`, `400`, `409`, `412`, `500`, missing key, refresh, duplicate sync trigger | Isolated Vitest audit test | **PASS** |
| **5** | Edit/correct or dismiss permanent `400`/`409`/`412` error without losing data | Code inspection | **FAIL (F-3)** |
| **5** | Stale CSRF cookie (`403 CSRF Failed`) auto-recovery during offline sync | Code inspection | **FAIL (F-4)** |
| **6** | Server-side `If-Match` / `expected_version` enforcement (`412 stale_version`), action idempotency replay, and `409 transition_not_allowed` without `If-Match` | Real Django backend pytest | **PASS** |
| **7** | Full live browser offline workflow (Steps 1–11: CHW login, offline phone-less patient form, offline standard referral form, offline refresh, reconnect, server verify) | Live browser UI | **NOT VERIFIED** *(Phase 3D UI forms not yet built)* |
| **8** | Emergency queue persistence, encryption, sync, conflict handling, UI regression | Automated test (`offline.test.tsx`) + Code inspection | **PASS** |

---

## 5. Actual Commands Executed & Outputs

1. **Frontend Isolated Audit Suite:**
   ```powershell
   cd d:\medi_waypoint\frontend; npx vitest run src/offline/__audit__/phase3c1-reliability-audit.test.tsx
   ```
   **Result:** Exit code `0` — `1 passed (1)`, `12 passed (12)` (including true-reload key recovery, missing-key preservation, logout cache safety, multi-user isolation, error matrix, and F-2 probe).

2. **Backend Isolated Audit Suite (against real Django views & middleware):**
   ```powershell
   cd d:\medi_waypoint\backend; .\.venv\Scripts\pytest.exe tests/audit_phase3c1/test_phase3c1_backend_reliability.py -v
   ```
   **Result:** Exit code `0` — `4 passed in 9.97s`:
   - `test_patient_creation_lost_response_retry_with_session_auth_is_idempotent` — PASSED
   - `test_audit_probe_drf_non_session_auth_bypasses_idempotency_middleware` — PASSED (confirming defect F-1)
   - `test_standard_referral_lost_response_retry_creates_single_referral` — PASSED
   - `test_referral_action_enforces_if_match_version_and_idempotency` — PASSED

3. **Emergency Queue Regression Suite:**
   ```powershell
   cd d:\medi_waypoint\frontend; npx vitest run src/offline/offline.test.tsx
   ```
   **Result:** Exit code `0` — `1 passed (1)`, `4 passed (4)`.

---

## 6. Defects, Severity & Reproduction Steps

| ID | Severity | Defect | Reproduction |
|---|---|---|---|
| **F-2** | **High** | **Unlinked sequential `referral_action` items on the same referral continue after action #1 fails.** In `unifiedQueue.ts:659-751`, `syncForUser` only checks `dependsOnQueueId`. If a user queues `acknowledge` (v2) then `start` (v3) on `ref-99` without manually linking `dependsOnQueueId`, and `acknowledge` hits a transient network error, the loop immediately attempts `start` (v3), which fails with permanent `412 stale_version` (`conflict`) and stops retrying. | Run `AUDIT PROBE` test in `phase3c1-reliability-audit.test.tsx`. |
| **F-1** | **Medium** | **Backend `IdempotencyMiddleware` misses replay for non-session DRF auth & writes outside `Patient` transaction.** For session-cookie web clients, replay works (`201` + `X-Idempotent-Replay: true`). However, for any DRF-level auth (e.g., future mobile token/JWT), `process_request` sees `AnonymousUser` while `process_response` saves `user_id`, causing retries to create duplicate patients. Also, `IdempotencyRecord` is written in `process_response`, outside `create_patient_record`'s `transaction.atomic()`. | Run `test_audit_probe_drf_non_session_auth_bypasses_idempotency_middleware` in `test_phase3c1_backend_reliability.py`. |
| **F-3** | **Medium** | **No edit/resolve/discard recovery API for permanent errors (`400`, `409`, `412`, `decryption_key_unavailable`).** Records are safely preserved, but users can only click "Retry now" (which replays the identical invalid/conflicting payload). | Code inspection of `unifiedQueue.ts` and `OfflineSyncBar.tsx`. |
| **F-4** | **Medium** | **Offline-stale CSRF cookie (`403 CSRF Failed`) is classified as permanent `permission_denied`.** `createUnifiedSyncTransport` does not refresh `/auth/me` on CSRF failure (unlike `useAuth().post` in `me.ts`), halting sync permanently after a CSRF rotation. | Code inspection of `syncTransport.ts` vs `auth/me.ts:63-67`. |
| **F-5** | **Medium** | **Silent fallback to in-memory-only `CryptoKey` if `db.put("keys", ...)` throws.** In `unifiedQueue.ts:257-261`, swallowing IndexedDB key-write failure would allow enqueuing items that cannot be decrypted after reload. | Code inspection of `unifiedQueue.ts:255-263`. |
| **F-6** | **Low** | **HTTP `423 sync_pending` (FHIR write locked) falls through to `"unknown"`** in `classifyTransportError` instead of explicit `server_unavailable` transient classification. | Code inspection of `unifiedQueue.ts:172-180` & `exceptions.py:85-88`. |

---

## 7. Distinction Between Automated Tests, Browser Tests & Code Inspection

- **Automated Frontend Tests (Vitest + `fake-indexeddb` + Node WebCrypto):** Verified Audits 1, 2 (client), 3, 4, 5, and 8.
- **Automated Backend Integration Tests (Django `APIClient` + real middleware/views/workflow engine):** Verified Audits 2 (server idempotency) and 6 (server `If-Match` optimistic concurrency & action idempotency).
- **Code Inspection:** Verified `crypto.ts`, `me.ts`, `syncTransport.ts`, `OfflineSyncBar.tsx`, `middleware.py`, `base.py`, `exceptions.py`, and identified F-3, F-4, F-5, F-6.
- **Live Browser Tests (Audit 7):** **NOT VERIFIED** — blocked solely because Phase 3D UI forms (phone-less patient registration & offline standard referral submission) have not yet been implemented. No unit tests are substituted for Audit 7.

---

## 8. Is Phase 3C Safe to Approve?

**Yes — conditionally.** Phase 3C's foundation is safe to approve to unblock Phase 3D UI integration, **provided** the minimal targeted hardening fixes below (especially **F-2** and **F-4**, plus **F-3** when wiring Phase 3D forms) are applied before pilot deployment and **Audit 7** is executed in a live browser once Phase 3D forms exist.

---

## 9. Minimal Recommended Fixes (Not Implemented)

1. **Fix F-2 (High — `unifiedQueue.ts`):** In `enqueueReferralAction`, automatically set `dependsOnQueueId` to the latest queued `referral_action` (or `standard_referral`) for the same `(ownerUserId, referral_id)`, OR track a `failedReferralIds` set inside `syncForUser` so any failure on a `referral_id` skips subsequent actions for that same `referral_id` in that pass.
2. **Fix F-4 (Medium — `syncTransport.ts`):** Mirror `useAuth().post`: on `ApiError` with `code === "csrf_failed"` or `/^CSRF Failed/i.test(err.message)`, call `api.get("/auth/me")` once to refresh the CSRF cookie and retry the request once before returning `permission_denied`.
3. **Fix F-5 (Medium — `unifiedQueue.ts`):** Do not silently swallow `db.put("keys", freshKey, "aes-gcm-master")` errors in production; surface a clear persistence error (allowing fallback only when explicitly in a non-cloneable test environment). Also add `clearInMemoryKeyCacheForTesting()` to `phase3c-sync.test.tsx` test #3.
4. **Fix F-3 (Medium — `unifiedQueue.ts` + `OfflineSyncBar.tsx`):** Add `updateItemPayload(ownerUserId, queueId, updatedPayload)` (re-encrypts with a fresh IV and resets `syncState = "PENDING_SYNC"`, `errorKind = null`) and `discardItem(ownerUserId, queueId)` for permanent error recovery.
5. **Fix F-1 (Medium — `backend/apps/identity/`):** If non-session DRF auth is ever enabled, move patient idempotency to a DB-backed `idempotency_key` field on `Patient` (matching `Referral.idempotency_key`) inside `create_patient_record`'s `transaction.atomic()`.
6. **Fix F-6 (Low — `unifiedQueue.ts`):** Map HTTP `423` (`sync_pending`) explicitly to `"server_unavailable"` in `classifyTransportError`.
