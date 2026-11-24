# Phase 3B Implementation Report — Partial Referral Intake & Deterministic Reconciliation Engine

**Date:** 2026-11-24  
**Branch:** `development` (uncommitted per Git Safety rules)  
**Scope:** Strictly Phase 3B — Backend Partial Referral Intake API, Missing-Field Tracking, Deterministic Reconciliation Engine, Audit Trail, Migrations, Tests, and `MASTERPLAN.md` update.

---

## 1. Executive Summary

Phase 3B implemented and verified the receiving-facility **Partial Referral Intake** workflow and the **Deterministic Reconciliation Engine** on top of the existing `Referral` model and workflow engine. When a patient arrives at a receiving facility before the sender's offline referral has synchronized, authorized receiving staff can immediately accept the patient with the minimum available information, clearly inspect missing fields (with zero fabricated medical data), advance clinical care (`IN_PROGRESS`, `OUTCOME_RECORDED`, `OUTCOME_RETURNED`), and automatically reconcile when the full referral later arrives—**without creating duplicates, without regressing receiver state, and without ever fuzzy-matching on patient name**.

All **105 executed backend tests** in Phase 3B verification (7 new Phase 3B tests + 98 Phase 3A & core regression tests) **passed with 0 failures**.

---

## 2. Implementation Overview

- Reused the canonical `Referral` model and `REFERRAL_TRANSITIONS` state machine (zero parallel referral tables or duplicate status enums).
- Encapsulated all partial-intake, missing-field computation, and deterministic reconciliation logic in a clean dedicated module: `backend/apps/referrals/reconciliation.py`.
- Enforced DB-level uniqueness per receiving facility and provisional code, row locking (`select_for_update()`), strict cross-facility isolation, and rollback-safe security conflict auditing.

---

## 3. Files Created

- `PHASE_3B_IMPLEMENTATION_PLAN.md`
- `PHASE_3B_IMPLEMENTATION_REPORT.md`
- `backend/apps/referrals/reconciliation.py` (partial intake, `compute_missing_fields`, deterministic reconciliation engine)
- `backend/apps/referrals/migrations/0004_referral_completeness_status_referral_is_partial_and_more.py`
- `backend/tests/test_phase3b_partial_intake.py` (7 comprehensive Phase 3B test suites covering intake, missing fields, reconciliation, conflicts, and security)

## 4. Files Modified

- `MASTERPLAN.md` (§10 Interface Ledger)
- `backend/apps/referrals/models.py` (partial/completeness fields, nullable sender FKs, conditional unique constraint)
- `backend/apps/referrals/serializers.py` (`PartialReferralIntakeSerializer`, null-safe sender fields, partial/reconciliation fields, `provisional_code` on `ReferralCreateSerializer`)
- `backend/apps/referrals/services.py` (wired `reconcile_partial_referral` into `create_referral_draft`; reconciled sender payload hash check in `_verify_idempotent_match`)
- `backend/apps/referrals/selectors.py` (`MW-REF:` QR prefix stripping + null-safe `sender_facility` facility-scope check)
- `backend/apps/referrals/transitions.py` (null-safe `_active(actor, facility)` guard when `sender_facility` is `None`)
- `backend/apps/referrals/views.py` & `urls.py` (`POST /api/v1/referrals/partial-intake`)
- `backend/apps/common/middleware.py` (deferred `/api/v1/referrals/partial-intake` to DB-backed facility-scoped idempotency)
- `backend/apps/notifications/services.py` (`referral.partial_received` & `referral.reconciled` templates in `en` and `bn`)
- `backend/apps/workflow/handlers.py` (null-safe `sender_facility` broadcast & notify guard)

*Verified via `git status`: zero frontend or offline queue files were modified.*

---

## 5. Model Changes & 6. Migrations

- **Migration:** `backend/apps/referrals/migrations/0004_referral_completeness_status_referral_is_partial_and_more.py`
  - Added `is_partial` (`BooleanField(default=False, db_index=True)`), `completeness_status` (`complete` | `partial`), `missing_fields` (`JSONField`), `reconciled_at` (`DateTimeField(null=True)`), `reconciliation_metadata` (`JSONField`).
  - Made `sender_facility` and `sender_practitioner` nullable (`null=True, blank=True`) for unreconciled partial intakes where sender metadata is not yet synced.
  - Added conditional DB unique constraint `uniq_referral_receiver_provisional_code` on `(receiver_facility, provisional_code)` where `provisional_code IS NOT NULL AND provisional_code != ''`.
- Verified cleanly via `manage.py migrate`, `manage.py makemigrations --check --dry-run` (`No changes detected`), and `manage.py check` (`0 issues`).

---

## 7. Partial Intake API Contract

- **Endpoint:** `POST /api/v1/referrals/partial-intake`
- **Authorization:** Active `clinician` OR `facility_staff` holding `referral.acknowledge` at the target `receiver_facility`.
- **Required Minimum Fields:** `provisional_code` (accepts raw code or `MW-REF:<code>`), `reason`, `urgency` (defaults to `urgent`).
- **Optional Fields (never fabricated if omitted):** `receiver_facility_id` (defaults to caller's active receiving facility), `patient_id`, `patient_system_id`, `patient_name`, `patient_name_bn`, `unverified_identity_description`, `estimated_age`, `birth_date`, `sex`, `sender_facility_id`, `referring_worker_name`, `referred_at_device`, `presenting_symptoms`, `vitals`, `allergies`, `treatment_given`.
- **Missing vs. Negative Clinical Distinction:** Omitted `allergies` (`None`/absent) is flagged in `missing_fields`; explicit `allergies: []` is treated as a known negative and excluded from `missing_fields`.
- **Responses:** `201 Created` on fresh partial intake (entering `ACKNOWLEDGED_BY_RECEIVER`), `200 OK` on exact idempotent replay, `409 Conflict` on conflicting duplicate provisional code at the same receiving facility, `403 Forbidden` for unauthorized staff.

---

## 8. Reconciliation Matching Strategy

- **Deterministic Key Only:** Matches strictly on `(receiver_facility, provisional_code)` inside `transaction.atomic()` with `select_for_update()`.
- **Zero Fuzzy Matching:** Never auto-reconciles by patient name, age, symptoms, or approximate timestamp.
- **In-Place Enrichment Architecture:** Enriches the existing partial `Referral` row in place so all receiver-created history, outcomes, and encounters stay attached to a single canonical referral UUID with zero duplicate records.

---

## 9. State Preservation Strategy & 10. Conflict Handling

- **Explicit State Preservation Policy:**
  - `RECEIVER_PROGRESSED_STATES = {"ACKNOWLEDGED_BY_RECEIVER", "IN_PROGRESS", "OUTCOME_RECORDED", "OUTCOME_RETURNED", "CLOSED"}`.
  - When a delayed sender referral reconciles into a partial record in any of these states, the receiver's state, `acknowledged_at`, and `outcome` are **100% preserved** (zero regression to `DRAFT` or `SENT`).
- **Rejected Conflicts (All Return `409 Conflict` + Persisted `reconciliation_conflict` Audit Event):**
  1. Cross-facility sender mismatch (`existing.sender_facility != incoming_sender_facility`).
  2. Already reconciled referral targeted by a different `idempotency_key`.
  3. Verified patient identity mismatch (cannot swap a verified patient).
  4. Multiple matching candidates (ambiguity rejected).
  5. Terminal conflict states (`DECLINED`, `CANCELLED`, `EXPIRED`).
- **Non-Destructive Clinical Merge:** Original partial intake values are preserved inside `summary["partial_intake_snapshot"]`, and field discrepancies (e.g., differing `urgency` or `reason`) are explicitly recorded in `reconciliation_metadata["conflicts_detected"]`. If an unverified intake placeholder patient is upgraded to the sender's verified patient, a non-destructive `DuplicateCandidate` (`INV-13`) is created for human review.

---

## 11. Audit Implementation & 12. Security / Authorization

- **Rollback-Safe Audit Events:** Security conflicts (`reconciliation_conflict`) are written **outside** the rolled-back `transaction.atomic()` block so they always persist in `AuditEvent` even when `409 Conflict` aborts the transaction.
- **Lifecycle Events Recorded:** `partial_intake_create`, `reconciliation_succeeded`, `reconciliation_conflict` (`AuditEvent`), plus `partial_intake` and `reconciled_full_record` (`HistoryEntry`).
- **Access Control:** Guessed provisional codes return `404` to unauthorized facilities; `MW-REF:` QR lookup strictly enforces active facility membership.

---

## 13. Tests Executed, 14. Test Results & 15. Environment-Blocked Tests

| Suite | Executed | Passed | Failed | Status |
|---|---|---|---|---|
| `tests/test_phase3b_partial_intake.py` | 7 | **7** | 0 | **Passed** |
| `tests/test_phase3a_foundation.py` | 9 | **9** | 0 | **Passed** |
| `tests/test_contract.py` | 10 | **10** | 0 | **Passed** |
| `tests/test_common.py` | 3 | **3** | 0 | **Passed** |
| `tests/test_referrals.py` | 2 | **2** | 0 | **Passed** |
| `tests/test_workflow.py` | 4 | **4** | 0 | **Passed** |
| `tests/test_masterplan_urls.py` | 70 | **70** | 0 | **Passed** |
| **Total Executed** | **105** | **105** | **0** | **100% Passing** |

- **Environment-Blocked / Not Executed:** `tests/test_referral_alignment.py` test #4 (`test_the_right_people_are_notified_through_the_lifecycle`) triggers outbox dispatch paths that block in the sandboxed Windows test environment (no live Redis/external broker). Production Redis behavior was intentionally left untouched.

---

## 16. Migration Verification & 17. Known Limitations

- Migrations `identity.0002`, `referrals.0003`, and `referrals.0004` are applied and verified (`No changes detected`, `0 system check issues`).
- **Known Limitations (Deferred to Later Subphases):**
  - Emergency referral offline reconciliation wiring (`POST /api/v1/referrals/emergency`) uses `EmergencyReferral.idempotency_key`; standard CHW/clinician referrals (`POST /api/v1/referrals/`) are fully wired to `reconcile_partial_referral`.
  - Frontend offline queue extension and UI screens are intentionally deferred to **Phase 3C** and **Phase 3D**.

---

## 18. Recommended Next Subphase

**Phase 3B is complete, verified, and ready for your approval.**  
Upon approval, the recommended next subphase is **Phase 3C — Unified Encrypted Offline Queue (Frontend)** extending `frontend/src/offline/` (`idb` + AES-GCM) for standard referrals, offline patient registration, offline status updates, all 5 sync states, exponential backoff, and automated Vitest offline tests.
