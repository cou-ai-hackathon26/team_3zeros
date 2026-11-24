# Phase 3A Implementation Plan — Backend Foundation

**Date:** 2026-11-24  
**Scope:** Strictly Phase 3A (Patient System ID, Standard Referral Idempotency, CHW Permissions, Assisted In-Person Consent, Migrations, Tests, `MASTERPLAN.md` contract update).

---

## 1. Files to Modify / Create

| File | Change |
|---|---|
| `backend/apps/accounts/catalogue.py` | Add `consent.record_assisted` permission (reusing existing `referral.create`). |
| `backend/apps/identity/models.py` | Add `("system_id", "Medi Waypoint Patient ID")` to `PatientIdentifier.SYSTEM_CHOICES` + collision-resistant `generate_system_patient_id()` (`MWP-XXXXXXXX`, Crockford Base32). |
| `backend/apps/identity/services.py` | Atomically generate & attach `PatientIdentifier(system="system_id")` on `create_patient_record` with `IntegrityError` retry loop; extend duplicate check to NID/Birth Reg without crashing when `phone` is `None`. |
| `backend/apps/identity/serializers.py` | Expose `system_id` and `has_account` read-only fields on `PatientSerializer`. |
| `backend/apps/identity/migrations/0002_system_id_backfill.py` | Alter `PatientIdentifier.system` choices + safe data migration backfilling `MWP-XXXXXXXX` for existing patients lacking a `system_id` without altering existing identifiers. |
| `backend/apps/referrals/models.py` | Add `idempotency_key` (`UUIDField`, nullable, indexed), `idempotency_scope_hash` / scoped unique constraint `(sender_facility, idempotency_key)` (when `idempotency_key` is non-null) and `initiated_by` (`FK User`, nullable). |
| `backend/apps/referrals/serializers.py` | Accept optional `idempotency_key` on `ReferralCreateSerializer`; expose `idempotency_key`, `initiated_by_id`, `patient_system_id`, `patient_has_account`, `consent_request_id` on `ReferralSerializer`. |
| `backend/apps/referrals/services.py` | Implement idempotent `create_referral_draft` (accepting header `Idempotency-Key` or body `idempotency_key`, scoped to `(sender_facility, idempotency_key)`, safe under concurrency via `IntegrityError` + `select_for_update`, returning `(referral, created)` or raising `IdempotencyConflictError` on payload mismatch); allow `facility_staff` with `referral.create` to create & edit drafts. |
| `backend/apps/referrals/transitions.py` | Allow `facility_staff` with `referral.create` to execute `request_consent`, `reopen_draft`, `cancel` at their active `sender_facility`, while keeping `approve`, `send`, `use_existing_consent` strictly clinician-only (`INV-4`). |
| `backend/apps/referrals/views.py` | Extract `Idempotency-Key` header in `ReferralListCreateView.post`; return `201` on creation and `200` on idempotent replay. |
| `backend/apps/referrals/migrations/0003_referral_idempotency_and_initiator.py` | Additive migration for `idempotency_key` (with conditional `UniqueConstraint` on `(sender_facility, idempotency_key)` where `idempotency_key__isnull=False`) and `initiated_by`. |
| `backend/apps/consent/services.py` | Add `record_assisted_consent(user, request_public_id, method, witness_name, notes, patient_confirmed_in_person, request_id)` and `revoke_assisted_consent(...)` reusing existing `Consent.method` and `Consent.verification_context` (zero new columns on `Consent`). |
| `backend/apps/consent/serializers.py` | Add `AssistedConsentRecordSerializer` (`assisted_verbal` \| `assisted_paper`, `patient_confirmed_in_person`, `witness_name`, `notes`, `consent_language`) and expose `verification_context` on `ConsentSerializer`. |
| `backend/apps/consent/views.py` & `urls.py` | Add `POST /api/v1/consents/requests/<uuid:public_id>/record-assisted` (`RecordAssistedConsentView`). |
| `MASTERPLAN.md` | Minimal contract updates in §4.2, §6.3, §7, and §10 Interface Ledger. |
| `backend/tests/test_phase3a_foundation.py` | Full automated pytest coverage for Patient ID, Idempotency, CHW Permissions, and Assisted Consent. |

---

## 2. Migration Strategy

1. **`identity.0002_system_id_backfill`:**
   - Schema op: `AlterField` on `PatientIdentifier.system` adding `("system_id", "Medi Waypoint Patient ID")`.
   - Data op (`RunPython`): Iterates over `Patient` records without a `system_id` identifier and creates a unique `MWP-XXXXXXXX` `PatientIdentifier`. Non-destructive; reverse is a no-op so existing identifiers are never deleted.
2. **`referrals.0003_referral_idempotency_and_initiator`:**
   - Additive nullable columns: `idempotency_key` (`UUIDField(null=True, blank=True, db_index=True)`) and `initiated_by` (`ForeignKey(User, null=True, blank=True, on_delete=SET_NULL)`).
   - Conditional `UniqueConstraint(fields=["sender_facility", "idempotency_key"], condition=Q(idempotency_key__isnull=False), name="uniq_referral_facility_idempotency_key")` — enforces facility-scoped idempotency at the DB level while allowing multiple legacy rows with `idempotency_key=NULL`.
3. **Consent:** Zero migration required (`Consent.method` and `Consent.verification_context` already exist).

---

## 3. Idempotency Contract (Standard Referral Creation)

- **Supply:** Client sends UUIDv4 in `Idempotency-Key` HTTP header (preferred) or `idempotency_key` in JSON body. If both are provided and differ -> `400 ValidationError`.
- **Storage & Scope:** Stored on `Referral.idempotency_key` with DB unique constraint `(sender_facility, idempotency_key)`. Because it is scoped to `sender_facility` and gated by active membership, another facility or unauthorized user can never retrieve or collide with another tenant's referral.
- **Retry Behavior:** Canonical payload fingerprint (`patient_id`, `receiver_facility_id`, `receiver_practitioner_id`, `urgency`, `reason`, `summary`) is compared:
  - Identical payload -> returns existing referral with HTTP `200 OK` (no duplicate created).
  - Different payload -> raises `IdempotencyConflictError` (HTTP `409 Conflict`).
- **Concurrency:** Wrapped in `transaction.atomic()` with `savepoint` catching `IntegrityError` on the unique constraint, then re-querying the winning row and applying the exact same payload equality check.

---

## 4. Test Plan & Completion Criteria

- All tests in `backend/tests/test_phase3a_foundation.py` pass (Patient ID, Idempotency, CHW permissions, Assisted consent).
- Existing regression suites (`test_contract.py`, `test_referrals.py`, `test_referral_lifecycle.py`, `test_referral_alignment.py`, `test_workflow.py`, `test_accounts.py`, `test_admin_access.py`, `test_notifications.py`) pass with 0 failures.
- `manage.py check` and `manage.py makemigrations --check --dry-run` report 0 issues.
- Zero frontend or out-of-scope files modified.
