# Phase 3C.2 — Critical Reliability Hardening Plan

**Date:** 2026-11-24  
**Scope:** Targeted fixes ONLY for confirmed Phase 3C.1 findings (**F-1** through **F-6**). No Phase 3D UI, no architecture rewrite, no Git commit/push.

---

## 1. Fixes by Finding

| ID | Priority | Files to Change | Minimal Fix |
|---|---|---|---|
| **F-2** | **Highest (High)** | `frontend/src/offline/unifiedQueue.ts` | Persist non-PII `targetReferralId` on `referral_action` items; auto-chain `dependsOnQueueId` to the latest queued item for the same `(ownerUserId, referral_id)` so FIFO survives refresh/restart; add `blockedReferralIds` guard in `syncForUser` so any failure on a referral blocks subsequent actions for that referral while unrelated referrals sync independently. |
| **F-1** | **Medium** | `backend/apps/common/idempotency.py` (new), `backend/apps/identity/views.py`, `backend/apps/referrals/views.py` | Document that `SessionAuthentication` is the only intentionally supported production auth method (`settings/base.py:163`). Add a small DRF-layer idempotency helper (`resolve_idempotent_replay` / `persist_idempotent_response`) scoped to `request.user` inside `PatientListCreateView.post` and `ReferralActionView.post` (atomic with the view transaction), guaranteeing identical replay/conflict semantics for both session auth and DRF-layer auth without schema migrations. |
| **F-5** | **Medium** | `frontend/src/offline/unifiedQueue.ts` | Throw `OfflineStorageKeyError` when `db.put("keys", freshKey, "aes-gcm-master")` fails instead of silently keeping an in-memory-only key in `KEY_CACHE`; preserve all existing ciphertext records untouched. |
| **F-4** | **Medium** | `frontend/src/offline/syncTransport.ts`, `frontend/src/offline/unifiedQueue.ts` | On `ApiError` with `csrf_failed` or `403` matching `/^CSRF Failed/i`, call `api.get("/auth/me")` once to refresh CSRF cookie: if `/auth/me` returns `401`/`not_authenticated`, return `401` so queue pauses with `AUTH_REQUIRED`; if `/auth/me` succeeds, retry the exact request once with the same `Idempotency-Key`. |
| **F-3** | **Medium** | `frontend/src/offline/unifiedQueue.ts`, `frontend/src/components/offline/OfflineSyncBar.tsx`, `frontend/src/i18n/messages/en.json`, `frontend/src/i18n/messages/bn.json` | Add `updateFailedItemPayload(ownerUserId, queueId, updatedPayload)` (re-encrypts with fresh IV + rotates `idempotencyKey` for corrected payloads) and `discardFailedItem(ownerUserId, queueId, reason)` (marks dependent items `parent_discarded` instead of silently deleting or unblocking them). Add two-step deliberate Discard confirmation in `OfflineSyncBar` queue drawer. |
| **F-6** | **Low** | `frontend/src/offline/unifiedQueue.ts` | Map HTTP `423` (`sync_pending`) explicitly to `"server_unavailable"` (transient backoff retry) in `classifyTransportError`. |

---

## 2. Verification Plan

1. New targeted regression tests:
   - Frontend: `frontend/src/offline/__tests__/phase3c2-hardening.test.tsx` covering F-2, F-5, F-4, F-3, and F-6.
   - Backend: `backend/tests/test_phase3c2_idempotency_hardening.py` covering F-1 (session auth, DRF non-session auth, cross-user isolation, payload mismatch `409`).
2. Re-run Phase 3C.1 frontend & backend audit suites (updating probe assertions only where probes previously asserted the pre-fix buggy behavior — or keeping audit probes intact and verifying the new regression suite).
3. Re-run Phase 3C sync tests (`phase3c-sync.test.tsx`), emergency regression (`offline.test.tsx`), `i18n.test.ts`, `clinical-pages.test.tsx`, `ed-pages.test.tsx`.
4. Run `npx tsc --noEmit`, `npm run lint:tokens`, and Django `manage.py check` + Phase 3A/3B backend tests.
