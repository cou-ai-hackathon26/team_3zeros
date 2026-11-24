# Phase 3C.1 — Offline Reliability & Failure-Recovery Audit Plan

**Date:** 2026-11-24  
**Mode:** Independent Audit & Adversarial Testing ONLY (zero modifications to application source code, backend models/APIs/migrations, production tests, or Git state).

---

## 1. Audit Objectives

Independently verify whether Medi Waypoint's Phase 3C unified encrypted offline queue (`unifiedQueue.ts`, `syncTransport.ts`, `OfflineSyncBar.tsx`, `crypto.ts`, `queue.ts`) and its Phase 3A/3B backend counterparts safely preserve, retry, isolate, and synchronize patient registrations, standard referrals, emergency referrals, and referral actions under real-world failure conditions.

---

## 2. Audit Areas & Verification Strategy

| Audit | Scope | Verification Methods |
|---|---|---|
| **Audit 1** | Encryption & Key Lifecycle (`crypto.ts`, `unifiedQueue.ts`, `me.ts`) | Code inspection + isolated Vitest adversarial tests (true reload with cleared in-memory `KEY_CACHE`, missing key, corrupted ciphertext, logout non-destruction, PHI leakage scan). |
| **Audit 2** | Lost HTTP Response & Idempotency (`POST /patients/`, `POST /referrals/`, `IdempotencyMiddleware`) | Code inspection + isolated Django backend pytest tests against real `PatientListCreateView`, `ReferralListCreateView`, and `IdempotencyMiddleware` + frontend Vitest tests. |
| **Audit 3** | Dependency Ordering (`patient_create` -> `standard_referral`, multi-action ordering) | Code inspection + isolated Vitest tests (reload preserving `dependsOnQueueId`, parent failure blocking child, sibling action failure behavior). |
| **Audit 4** | Multi-User Isolation (User A -> logout -> User B -> sync -> User A login) | Code inspection + isolated Vitest tests (cross-user read/sync/receipt isolation, concurrent multi-user sync, logout preservation). |
| **Audit 5** | Error Recovery Matrix (timeout, 401, 403, 400, 409, 412, 423, 500, missing key, refresh, duplicate trigger) | Code inspection + isolated Vitest tests verifying every status code, backoff window, permanent error stop, and whether permanent errors can be edited/recovered. |
| **Audit 6** | Referral Action Concurrency (`syncTransport.ts`, `ReferralActionView`, `execute_referral_transition`, `execute_transition`) | Code inspection + isolated Django backend pytest tests verifying `If-Match` / `expected_version` -> `412 stale_version`, repeated action idempotency, receiver state change race (`409 transition_not_allowed` / `412`), and missing `If-Match` behavior. |
| **Audit 7** | Browser-Level Offline Workflow | Check actual UI readiness & live server availability. Note: Phase 3D offline patient registration UI and offline standard referral submission UI are explicitly out of scope for Phase 3C; document exact steps that are runnable vs. `NOT VERIFIED`. |
| **Audit 8** | Emergency Queue Regression (`queue.ts`, `EmergencySlip.tsx`, `offline.test.tsx`, `clinical-pages.test.tsx`) | Code inspection + re-running existing emergency queue & UI regression suites. |

---

## 3. Isolated Audit Artifacts (Non-Production)

To avoid altering any production code or production tests, all adversarial tests will live in isolated audit paths:
- Frontend audit suite: `frontend/src/offline/__audit__/phase3c1-reliability-audit.test.tsx`
- Backend audit suite: `backend/tests/audit_phase3c1/test_phase3c1_backend_reliability.py`

After execution, full findings, severity ratings, exact commands/outputs, and minimal recommended fixes (without implementing them) will be recorded in `PHASE_3C_1_RELIABILITY_AUDIT_REPORT.md`.
