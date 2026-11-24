# Phase 3A Implementation Report — Backend Foundation

**Date:** 2026-11-24  
**Branch:** `development` (uncommitted per Git Safety rules)  
**Scope:** Strictly Phase 3A — Patient System ID, Standard Referral Idempotency, CHW Permissions, Assisted In-Person Consent, Migrations, Tests, and `MASTERPLAN.md` contract update.

---

## 1. Summary

Phase 3A implemented and verified the complete backend foundation required for Challenge 1 (patients without personal phones) and the idempotency foundation for Challenge 2 (network-resilient referral creation), without modifying any frontend, offline queue, partial-intake, or out-of-scope files.

All **145 executed backend tests** (9 new Phase 3A tests + 136 existing regression tests across contracts, common middleware, workflow engine, URLs, notifications, accounts, admin access, documents, referrals, and referral lifecycle) **passed with 0 failures**.

---

## 2. Files Created

- `PHASE_3A_IMPLEMENTATION_PLAN.md`
- `PHASE_3A_IMPLEMENTATION_REPORT.md`
- `backend/apps/identity/migrations/0002_alter_patientidentifier_system.py` (schema + safe backfill migration)
- `backend/apps/referrals/migrations/0003_referral_idempotency_key_referral_initiated_by_and_more.py`
- `backend/tests/test_phase3a_foundation.py` (9 comprehensive Phase 3A test cases)

## 3. Files Modified

- `MASTERPLAN.md` (§4.2 Action Matrix & §10 Interface Ledger)
- `backend/apps/accounts/catalogue.py` (added `consent.record_assisted`)
- `backend/apps/common/middleware.py` (scoped `IdempotencyMiddleware` to authenticated user; deferred `/api/v1/referrals/` to DB-backed facility-scoped idempotency)
- `backend/apps/consent/serializers.py`, `services.py`, `urls.py`, `views.py`
- `backend/apps/identity/models.py`, `selectors.py`, `serializers.py`, `services.py`
- `backend/apps/referrals/models.py`, `serializers.py`, `services.py`, `transitions.py`, `views.py`
- `backend/tests/test_admin_access.py` (updated closed permission catalogue assertion for `consent.record_assisted`)

*Verified via `git status`: zero frontend or offline files were modified.*

---

## 4. Models & Migrations Changed

| App | Migration | Operations |
|---|---|---|
| `identity` | `0002_alter_patientidentifier_system.py` | Adds `("system_id", "Medi Waypoint Patient ID")` to `PatientIdentifier.system` choices + `RunPython` backfill assigning unique `MWP-XXXXXXXX` IDs to existing patients without altering existing identifiers (reverse is `noop`). |
| `referrals` | `0003_referral_idempotency_key_referral_initiated_by_and_more.py` | Adds nullable `idempotency_key` (`UUIDField`), nullable `initiated_by` (`FK User`), and conditional `UniqueConstraint(fields=["sender_facility", "idempotency_key"], condition=Q(idempotency_key__isnull=False), name="uniq_referral_facility_idempotency_key")`. |
| `consent` | *None needed* | Reused existing `Consent.method` and `Consent.verification_context` fields cleanly. |

`manage.py migrate`, `manage.py makemigrations --check --dry-run`, and `manage.py check` all succeeded with **0 issues**.

---

## 5. Patient System ID Implementation

- **Format:** `MWP-XXXXXXXX` (8 cryptographically random Crockford Base32 characters via `secrets.choice`, $32^8 \approx 1.1 \times 10^{12}$ keyspace, excluding ambiguous `I, L, O, U`).
- **Storage:** Integrated into existing `PatientIdentifier(system="system_id", verified=True)` leveraging the DB-level `unique_together = ("system", "value")` constraint.
- **Collision Safety:** `assign_system_patient_id()` runs inside a `transaction.atomic()` savepoint with up to 10 retries on `IntegrityError`.
- **Phone/Email/NID Independence:** Empty phone strings normalize to `None`; `PatientCreateSerializer` accepts `phone=None` and requires only `given_name` and `sex`.
- **Anti-Spoofing & Anti-Enumeration:** Client-supplied `system="system_id"` is rejected (`400`). `search_patients` and `get_patient_by_public_id` enforce active `clinician` or `facility_staff` membership (blocking `platform_admin`, `facility_admin`, and cross-patient enumeration).
- **API Exposure:** `PatientSerializer` exposes read-only `system_id` and `has_account`.

---

## 6. Standard Referral Idempotency Contract

- **Key Supply:** `Idempotency-Key` HTTP header (preferred) or `idempotency_key` in JSON body (UUIDv4). Header/body mismatch returns `400 ValidationError`.
- **Scope & Storage:** Persisted on `Referral.idempotency_key` with conditional DB unique constraint `(sender_facility, idempotency_key)`. Authorization and facility membership are verified **before** idempotency lookup so unauthorized users or other facilities can never probe or retrieve another facility's referral.
- **Retry & Conflict:**
  - First request -> `201 Created`.
  - Exact retry (same canonical `patient_id`, `receiver_facility_id`, `receiver_practitioner_id`, `urgency`, `reason`, `summary`) -> `200 OK` returning the existing referral (no duplicate).
  - Same key + different payload -> `409 Conflict` (`idempotency_conflict`).
- **Concurrency:** `create_referral_draft` catches `IntegrityError` on the unique constraint, re-queries the winning row for `(sender_facility, idempotency_key)`, and validates payload equality.

---

## 7. CHW Permissions & Assisted In-Person Consent

- **CHW Representation:** Reused existing `facility_staff` role + canonical `referral.create` permission (already in `apps/accounts/catalogue.py`) + new `consent.record_assisted` permission.
- **Strict Separation of Authority (`INV-4`, `INV-10`):**
  - Authorized CHWs (`facility_staff` with `referral.create`) can register patients, create/edit `DRAFT` referrals (`initiated_by=user`), and trigger `request_consent` (`DRAFT -> AWAITING_PATIENT_CONSENT`).
  - CHWs **cannot** `approve`, `send`, `acknowledge`, `start`, `record_outcome`, or `close` referrals (`403 PermissionDeniedError`).
  - `update_referral_draft` now also enforces active sending-facility authorization.
- **Assisted Consent (`POST /api/v1/consents/requests/<uuid:public_id>/record-assisted`):**
  - Accepts only `method in ("assisted_verbal", "assisted_paper")`, `patient_confirmed_in_person=True`, and non-empty `witness_name` or `notes`.
  - **Blocked (`409`) if the patient has an active `PatientAccount`** (ensuring staff cannot bypass direct patient consent).
  - Scoped to the linked referral's active `sender_facility` membership (`clinician` or `facility_staff` with `consent.record_assisted` / `referral.create`).
  - Stores full provenance in `Consent.verification_context` (`recorded_by_user_id`, `recorded_by_name`, `facility_id`, `witness_name`, `patient_confirmed_in_person`, `consent_language`, `notes`, `recorded_at`) and writes `AuditEvent(action="assisted_consent_granted")`.
  - Advances referral ONLY to `READY_FOR_SENDER_APPROVAL` via the system `consent_granted` transition (never approves or sends).
  - Supports in-person withdrawal via `POST /api/v1/consents/<uuid>/revoke`, dropping `READY_FOR_SENDER_APPROVAL`/`APPROVED_BY_SENDER` referrals back to `DRAFT`.

---

## 8. Workflow Invariant Preservation

- `REFERRAL_TRANSITIONS` action names, sources, targets, and FHIR gates were **not altered** (`test_contract.py` 100% green).
- System-only transitions (`consent_granted`, `consent_refused`, `consent_revoked`, etc.) still reject all signed-in user actors.
- Existing digital patient consent (`grant_consent_request`, `refuse_consent_request`) and emergency referral flows remain untouched and passing.

---

## 9. Tests Executed & Results

| Test Suite | Executed | Passed | Failed | Notes |
|---|---|---|---|---|
| `tests/test_phase3a_foundation.py` | 9 | **9** | 0 | Patient ID, collision retry, anti-spoof/enumeration, idempotency replay/conflict/scope/race, CHW boundaries, assisted verbal & paper consent, audit, revocation, account-holder guard |
| `tests/test_contract.py` | 10 | **10** | 0 | MASTERPLAN §5 transition tables & system-only action guards |
| `tests/test_common.py` | 3 | **3** | 0 | Request ID, error envelope, `IdempotencyMiddleware` |
| `tests/test_workflow.py` | 4 | **4** | 0 | Workflow engine transitions & optimistic concurrency |
| `tests/test_masterplan_urls.py` | 70 | **70** | 0 | Canonical URL routing contract |
| `tests/test_notifications.py` | 3 | **3** | 0 | In-app notification delivery |
| `tests/test_referrals.py` | 2 | **2** | 0 | Referral creation & emergency referrals |
| `tests/test_referral_lifecycle.py` | 8 | **8** | 0 | Full referral state machine & FHIR sync |
| `tests/test_accounts.py` | 4 | **4** | 0 | Account registration & auth |
| `tests/test_admin_access.py` | 27 | **27** | 0 | RBAC, MFA, staff management, closed permission catalogue |
| `tests/test_documents.py` | 5 | **5** | 0 | Document upload & OCR verification |
| **Total** | **145** | **145** | **0** | **100% passing** |

*(Note: `tests/test_referral_alignment.py` tests 1–3 passed; test 4 invokes Channels Redis `127.0.0.1:6379` which is blocked by the sandboxed network environment during test execution, unrelated to Phase 3A.)*

---

## 10. Security Findings Resolved During Phase 3A

1. **Cross-User Replay Vulnerability in `IdempotencyMiddleware`:** Discovered that `IdempotencyMiddleware.process_request` replayed cached `IdempotencyRecord` responses globally by `(key, endpoint)` without checking `request.user`. Hardened `IdempotencyMiddleware` to never replay user-scoped records to a different/unauthenticated caller, and deferred `/api/v1/referrals/` to DB-backed facility-scoped idempotency after DRF authentication & authorization.
2. **Missing Sender Authorization on `update_referral_draft`:** Added active sending-facility membership verification (`clinician` or `facility_staff` with `referral.create`) before allowing `PATCH /api/v1/referrals/<id>`.
3. **Patient Enumeration Guard:** Restricted `search_patients` and `get_patient_by_public_id` to active `clinician` / `facility_staff` memberships (or the patient's own `patient_account`).

---

## 11. Known Limitations (Intentionally Deferred to Later Subphases)

- Partial referral intake (`POST /api/v1/referrals/partial-intake`) and delayed-sync reconciliation -> **Phase 3B**.
- Offline queue expansion for standard referrals & status updates -> **Phase 3C**.
- Frontend CHW registration, assisted consent UI, printable `ReferralSlip` + zero-PII QR -> **Phase 3D**.

---

## 12. Recommendation

**Phase 3A is complete, verified, and ready for your approval.**  
Upon approval, the recommended next subphase is **Phase 3B — Partial Referral Intake & Reconciliation Engine** (backend `partial-intake` endpoint, `missing_fields` tracking, deterministic `provisional_code` reconciliation with monotonic state preservation, QR/`MWP-` lookup support, and Challenge 2 backend tests).
