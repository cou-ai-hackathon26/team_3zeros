# Phase 3B Implementation Plan — Partial Referral Intake & Deterministic Reconciliation Engine

**Date:** 2026-11-24  
**Scope:** Strictly Phase 3B (Backend Partial Referral Intake API, Missing-Field Tracking, Deterministic Reconciliation Engine, Audit Trail, Migrations, Tests, `MASTERPLAN.md` update). Zero frontend or offline queue files modified.

---

## 1. Files to Modify / Create

| File | Change |
|---|---|
| `backend/apps/referrals/models.py` | Make `sender_practitioner` & `sender_facility` nullable for offline partial intakes; add `is_partial`, `completeness_status`, `missing_fields`, `reconciled_at`, `reconciliation_metadata`; add conditional DB `UniqueConstraint(fields=["receiver_facility", "provisional_code"], condition=Q(provisional_code__isnull=False) & ~Q(provisional_code=""), name="uniq_referral_receiver_provisional_code")`. |
| `backend/apps/referrals/migrations/0004_partial_intake_and_reconciliation.py` | Safe additive migration for the new fields, nullable sender FKs, and conditional unique constraint. |
| `backend/apps/referrals/serializers.py` | Add `PartialReferralIntakeSerializer`; accept optional `provisional_code` on `ReferralCreateSerializer`; expose `is_partial`, `completeness_status`, `missing_fields`, `reconciled_at`, `reconciliation_metadata` on `ReferralSerializer` (null-safe for `sender_facility` / `sender_practitioner`). |
| `backend/apps/referrals/services.py` | Implement `compute_missing_fields(referral)`, `create_partial_referral_intake(user, validated_data, idempotency_key, request_id)`, and `reconcile_partial_referral(...)`; integrate reconciliation into `create_referral_draft` and `create_emergency_referral`. |
| `backend/apps/referrals/selectors.py` | Strip optional `MW-REF:` prefix in `get_referral_by_code`; ensure `sender_facility` null-safety in `list_referrals` and `get_referral_by_public_id` / `get_referral_by_code`. |
| `backend/apps/referrals/transitions.py` | Guard `is_sender_clinician` and `is_sender_clinician_or_chw` cleanly when `obj.sender_facility` is `None` (unreconciled partial intake). |
| `backend/apps/referrals/views.py` & `urls.py` | Add `POST /api/v1/referrals/partial-intake` (`PartialReferralIntakeView`); return `200 OK` on idempotent replay or reconciliation into existing partial intake, `201 Created` on fresh creation. |
| `backend/apps/common/middleware.py` | Defer `/api/v1/referrals/partial-intake` to DB-backed facility-scoped idempotency (same pattern as `/api/v1/referrals/`). |
| `backend/apps/notifications/services.py` | Add `referral.partial_received` and `referral.reconciled` message templates in `en` and `bn`. |
| `MASTERPLAN.md` | Document `POST /api/v1/referrals/partial-intake`, partial completeness fields, deterministic reconciliation rules, and §10 Interface Ledger row. |
| `backend/tests/test_phase3b_partial_intake.py` | Comprehensive automated pytest suite covering partial intake, missing fields, reconciliation, conflicts, concurrency, security, and regression checks. |

---

## 2. Partial Record Identification & Missing-Field Strategy

- **Persisted + Deterministically Computed:** `is_partial`, `completeness_status`, and `missing_fields` are persisted on `Referral` (for fast indexed filtering and audit visibility) and recomputed via a pure deterministic helper `compute_missing_fields(referral)`.
- **No Fabricated Data:** Omitted optional fields (`allergies`, `vitals`, `treatment_given`, `clinical_summary`, `sender_facility`, `sender_practitioner`, `consent`) are explicitly listed in `missing_fields`. An empty list `allergies: []` is treated as a known negative, whereas omitted/`None` is flagged as missing.
- **Receiving-Facility Workflow Reuse:** Partial intake enters `state="ACKNOWLEDGED_BY_RECEIVER"` immediately, reusing existing `REFERRAL_TRANSITIONS` (`start` -> `IN_PROGRESS` -> `record_outcome` -> `OUTCOME_RECORDED` -> `close`).

---

## 3. Deterministic Reconciliation & State Preservation Policy

- **Matching Key:** Strictly `(receiver_facility, provisional_code)` inside `transaction.atomic()` with `select_for_update()`. **Never** matches on patient name, age, symptoms, or fuzzy heuristics.
- **Safety Checks Before Merging:**
  1. Cross-facility mismatch (`existing.sender_facility` already set and `!= incoming_sender_facility`) -> `409 Conflict` + `AuditEvent(action="reconciliation_conflict")`.
  2. Already reconciled with a different `idempotency_key` -> `409 Conflict` + `AuditEvent(action="reconciliation_conflict")`.
  3. Verified patient identity mismatch (`not patient_identity_unverified` and `existing.patient != incoming_patient`) -> `409 Conflict` (prevents arbitrary identity hijacking).
  4. Multiple candidates -> `409 Conflict` (rejects ambiguity).
  5. Terminal conflict states (`DECLINED`, `CANCELLED`, `EXPIRED`) -> `409 Conflict` (never forces invalid transitions).
- **Explicit State Preservation:** If the partial referral is in `{"ACKNOWLEDGED_BY_RECEIVER", "IN_PROGRESS", "OUTCOME_RECORDED", "OUTCOME_RETURNED", "CLOSED"}`, the receiver's state and `outcome` are strictly preserved (zero regression to `DRAFT`/`SENT`).
- **Clinical Enrichment & Conflict Recording:** Original partial intake payload is preserved in `summary["partial_intake_snapshot"]`; sender fields enrich missing sections; any differing fields (`urgency`, `reason`) are recorded in `reconciliation_metadata["conflicts_detected"]` without silently erasing receiver data.

---

## 4. Risks & Mitigations

- **Null `sender_facility` / `sender_practitioner` on partial records:** Guard all serializer fields (`allow_null=True`), `transitions.py` checks (`if not obj.sender_facility: return False`), and `selectors.py` queries (`sender_facility_id__in=...` safely excludes `NULL`).
- **Existing DB rows with `provisional_code=""`:** Conditional `UniqueConstraint` explicitly filters `Q(provisional_code__isnull=False) & ~Q(provisional_code="")` so existing rows with blank strings never violate the constraint.
