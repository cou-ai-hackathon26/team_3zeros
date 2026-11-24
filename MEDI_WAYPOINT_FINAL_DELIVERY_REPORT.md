# Medi Waypoint — Final MVP Delivery Report

**Date:** 2026-11-24  
**Target Branch:** `development` (`origin/development`)  
**Scope:** Complete Medi Waypoint MVP — Phone-less Patient Registration, Assisted In-Person Consent, Unified Encrypted Offline Queue & Reliability Hardening, Printable Zero-PII QR Referral Slip, Receiving-Facility Partial Referral Intake & Deterministic Reconciliation, Closed-Loop Outcome Return & Closure, and Integration with Remote Voice/RAG Triage (`025be3e`).

---

## 1. Completed MVP Capabilities

1. **Phone-less Patient Identity & Registration (Challenge 1)**
   - CHWs register patients without personal phone, email, NID, birth registration, or patient account (`/patients/new`, `RegisterPatientForm.tsx`).
   - Server generates collision-resistant `MWP-XXXXXXXX` system patient IDs (`PatientIdentifier(system="system_id")`) searchable across authorized facilities.
   - Offline patient registration queues encrypted `patient_create` items with temporary `local-pat-*` references (never fabricating fake `MWP-*` IDs).
2. **Assisted In-Person Consent**
   - CHWs with `consent.record_assisted` record `assisted_verbal` or `assisted_paper` consent with mandatory in-person confirmation and witness name (`POST /api/v1/consents/requests/{id}/record-assisted`, `AssistedConsentPanel.tsx`).
   - Blocked for patients with an active `PatientAccount`; advances referral only to `READY_FOR_SENDER_APPROVAL` (clinician approval remains required).
   - Bangla and English consent copy includes explicit `[Clinical/legal review required before live pilot]` notices.
3. **Unified Encrypted Offline Queue & Hardened Sync (Challenge 2)**
   - `UnifiedOfflineQueueStore` (`medi-waypoint-unified-offline-v1` IndexedDB + non-extractable Web Crypto AES-GCM 256-bit, unique random 96-bit IV per record) supporting `patient_create`, `standard_referral`, `emergency_referral`, and ordered `referral_action` updates.
   - Preserves existing `EmergencyQueueStore` and `/emergency` untouched.
   - Reliability hardening (Phase 3C.2): per-referral FIFO action chaining, patient→referral dependency resolution (`local-pat-*` → server UUID + `MWP-*`), single-flight sync lock, exponential backoff (`5s→15s→30s→60s→120s`), single-attempt CSRF cookie refresh via `GET /auth/me`, `AUTH_REQUIRED` pause/resume, fail-closed `OfflineStorageKeyError`, F-3 uncertain-outcome reconciliation (`reconcileUncertainFailedItem`), two-step deliberate discard in `OfflineSyncBar`, and strict `ownerUserId` shared-device isolation.
4. **Printable Standard Referral Slip & Zero-PII QR**
   - `ReferralSlip.tsx` + `QrCodeSvg.tsx`: A6/A5 portrait black-on-paper printable slip clearly distinguishing provisional offline codes from server-confirmed references, displaying `MWP-*` (or pending-sync notice), and encoding **strictly** `MW-REF:<code>` in the QR SVG with zero PHI.
5. **Receiving-Facility Partial Intake & Deterministic Reconciliation**
   - `PartialReferralIntakePanel.tsx` integrated into Incoming Referrals (`ReferralsIndex.tsx`) and 404 slip/QR lookup (`MW-REF:` prefix stripped).
   - Allows immediate acceptance via `POST /api/v1/referrals/partial-intake` (`ACKNOWLEDGED_BY_RECEIVER`) with explicit `is_partial` / `missing_fields` banners on `/referrals/[id]`.
   - Deterministic reconciliation on `(receiver_facility, provisional_code)` merges sender's full referral when connectivity returns with **zero duplicates** and **zero status regression** (preserving `ACKNOWLEDGED_BY_RECEIVER` / `IN_PROGRESS` / `OUTCOME_RETURNED`), displaying a **Reconciled** confirmation banner.
6. **Bangla Voice & RAG Triage Integration**
   - Integrated cleanly with remote `origin/development` (`025be3e`), preserving bounded Bangla voice/text triage, pgvector hybrid knowledge retrieval, Vapi fail-closed webhook handling, and safe written fallback when external voice credentials are not configured.

---

## 2. Full Patient-to-Outcome Workflow

`Patient (no phone) → CHW Registration (MWP-*) → Assisted Consent (verbal/paper) → Clinician Approval & Send (or Offline Queue + Provisional Slip/QR) → Receiving Facility Lookup / Partial Intake → Acknowledge → In Progress → Deterministic Reconciliation → Record Outcome (auto-returns to sender) → CHW Outcome Visibility → Sender Closure (CLOSED)`

---

## 3. Backend Changes & Database Migrations

- **Models & Migrations:**
  - `backend/apps/identity/migrations/0002_alter_patientidentifier_system.py` — Adds `system_id` identifier choice and backfills `MWP-XXXXXXXX` for existing patients.
  - `backend/apps/referrals/migrations/0003_referral_idempotency_key_referral_initiated_by_and_more.py` — Adds `idempotency_key`, `initiated_by`, and conditional unique constraint `(sender_facility, idempotency_key)` (linearly chained after remote `0003_sender_practitioner_nullable`).
  - `backend/apps/referrals/migrations/0004_referral_completeness_status_referral_is_partial_and_more.py` — Adds `is_partial`, `completeness_status`, `missing_fields`, `reconciled_at`, `reconciliation_metadata`, nullable `sender_facility`, and conditional unique constraint `(receiver_facility, provisional_code)`.
- **Services, Views & Idempotency:**
  - `backend/apps/common/idempotency.py` — View-level user-scoped idempotency helpers for `PatientListCreateView` (atomic) and `ReferralActionView`.
  - `backend/apps/common/middleware.py` — Hardened cross-user replay prevention.
  - `backend/apps/consent/` — `POST /api/v1/consents/requests/{id}/record-assisted`.
  - `backend/apps/referrals/reconciliation.py` — `create_partial_referral_intake`, `compute_missing_fields`, `reconcile_partial_referral`, `MW-REF:` QR lookup normalization.
  - `backend/apps/accounts/catalogue.py` — Added `consent.record_assisted` permission.

---

## 4. Frontend Changes

- **Offline Engine:** `frontend/src/offline/unifiedQueue.ts`, `syncTransport.ts`, `store.ts`, `frontend/src/components/offline/OfflineSyncBar.tsx`, mounted in `(clinician)/layout.tsx`.
- **CHW Workflow:** `frontend/src/components/chw/RegisterPatientForm.tsx`, `AssistedConsentPanel.tsx`, `QrCodeSvg.tsx`, `ReferralSlip.tsx`, `frontend/src/app/[locale]/(clinician)/patients/new/page.tsx`, enhanced `patients/page.tsx`, `referrals/new/page.tsx`, `referrals/[id]/page.tsx`.
- **Receiving Facility Workflow:** `frontend/src/components/clinical/PartialReferralIntakePanel.tsx`, enhanced `ReferralsIndex.tsx` (CHW Outgoing + offline referrals + Receiving partial intake & badges), `referrals/[id]/page.tsx` (Partial Record `missing_fields` banner & Reconciled banner).
- **Auth & Bilingual i18n:** `frontend/src/auth/access.ts`, `nav.ts`, `frontend/src/api/queries/types.ts`, `en.json`, `bn.json` (`offlineSync.*`, `chw.*`, `receiving.*`).

---

## 5. Verification Commands & Actual Results

### Pre-Merge (SQLite test DB — all backend E2E & regression tests executed against real Django views)
- `backend`: `pytest tests/test_mvp_e2e_journey.py -v` → **2 / 2 passed** (full 16-step partial-intake/reconciliation/outcome/closure journey + online assisted-consent/approval/QR-lookup journey).
- `backend`: `pytest tests/test_phase3a_foundation.py tests/test_phase3b_partial_intake.py tests/test_phase3c2_idempotency_hardening.py tests/audit_phase3c1/test_phase3c1_backend_reliability.py -v` → **23 / 23 passed**.
- `frontend`: `npx vitest run` across 10 suites (`mvp-receiving-and-reconciliation`, `phase3d-chw-workflow`, `phase3c2-hardening`, `phase3c-sync`, `phase3c1-reliability-audit`, `offline`, `access`, `i18n`, `clinical-pages`, `ed-pages`) → **130 / 130 passed**.

### Post-Merge with `origin/development` (`025be3e`)
- `backend`: `python manage.py check` → **0 issues**.
- `backend`: `python manage.py makemigrations --check --dry-run` → **No changes detected** (linear migration graph verified).
- `frontend`: `npx vitest run` (7 core MVP + RBAC + i18n + offline suites) → **67 / 67 passed**.
- `frontend`: `npx tsc --noEmit` → **0 errors**.
- `frontend`: `npm run lint:tokens` → **Passed (190 files, 0 violations)**.

### Environment-Blocked Tests (Honest Disclosure)
- **Post-merge PostgreSQL+pgvector pytest execution:** Remote `origin/development` commit `699e4ee` switched `config.settings.local` from SQLite to PostgreSQL (`localhost:5432`) for pgvector hybrid search; no local Postgres server is running in this Windows sandbox (`Connection failed on 127.0.0.1:5432`), so post-merge DB test runs require `docker compose up -d db`.
- **Live browser Playwright E2E:** Deferred until PostgreSQL+pgvector and live Vapi credentials are running in a staging/local Docker environment.

---

## 6. Remaining Limitations & Manual Setup

1. **PostgreSQL + pgvector:** Start Postgres via `docker compose up -d db` (or configure `DATABASE_URL` in `.env`) and run `python manage.py migrate`.
2. **Voice / LLM Credentials:** Set `VAPI_*` / `LLM_PROVIDER` keys in local `.env` (never committed) to enable live voice calls; written triage fallback works without external keys.
3. **Clinical/Legal Review:** Bangla and English assisted-consent text in `en.json` / `bn.json` is explicitly flagged for clinical/legal sign-off before live pilot deployment.
4. **Local `.env.example`:** Excluded from Git staging to preserve user-edited local credentials without committing secrets.

---

## 7. Git Delivery Verification

- **Branch:** `development`
- **Feature Commit:** `137aa5c` (`feat: complete Medi Waypoint end-to-end referral workflow`)
- **Merge & Push:** Merged with `origin/development` (`025be3e`) and pushed cleanly (no force-push); exact final merge commit hash and remote ref verification are reported in the delivery response.
