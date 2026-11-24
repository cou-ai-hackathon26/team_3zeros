# Phase 3D Implementation Plan — CHW Patient Registration & Referral UI

**Date:** 2026-11-24  
**Scope:** Phase 3D ONLY (CHW navigation, phone-less patient registration, assisted in-person consent, standard referral creation with offline-first queue integration, zero-PII QR referral slip, and CHW My Referrals list).

---

## 1. Verified Backend Contracts (No Backend Changes Required)

- **Patient Registration:** `POST /api/v1/patients/` (`PatientCreateSerializer`: required `given_name`, `sex`; optional `family_name`, `name_bn`, `birth_date`, `estimated_age`, `phone`, `area_id`, `identifiers[]`). Returns `{ id, system_id: "MWP-XXXXXXXX", has_account, ... }`.
- **Patient Search:** `GET /api/v1/patients/?q=...` (searches name, `system_id` `MWP-*`, NID, birth registration, phone).
- **Standard Referral Creation:** `POST /api/v1/referrals/` (`ReferralCreateSerializer`: required `patient_id`, `receiver_facility_id`, `reason`; optional `encounter_id`, `receiver_practitioner_id`, `urgency`, `summary`, `provisional_code`, `idempotency_key`). Accepts `Idempotency-Key` header.
- **Assisted In-Person Consent:** `POST /api/v1/consents/requests/{id}/record-assisted` (`AssistedConsentRecordSerializer`: `method` in `["assisted_verbal", "assisted_paper"]`, `patient_confirmed_in_person: bool`, `witness_name`, `notes`, `consent_language`). Blocked if patient has an active `PatientAccount`; advances referral only to `READY_FOR_SENDER_APPROVAL`.
- **Receiving Lookup by Reference / QR:** `GET /api/v1/referrals/by-reference/{code}` (strips `MW-REF:` prefix; enforces facility authorization).

---

## 2. Files to Create & Modify

### New Files
1. `frontend/src/components/chw/RegisterPatientForm.tsx` — Phone-less online + offline (`patient_create`) patient registration form with duplicate-submission prevention, optional identifiers (`nid`, `birth_registration`), `MWP-*` display after sync, and temporary `local-pat-*` display while offline.
2. `frontend/src/app/[locale]/(clinician)/patients/new/page.tsx` — Route for `/patients/new`.
3. `frontend/src/components/chw/AssistedConsentPanel.tsx` — CHW assisted consent (`assisted_verbal` / `assisted_paper`) panel with explicit in-person confirmation, witness & notes fields, clinical/legal review notice on Bangla/English text, `PatientAccount` guard, and clinician-approval reminder.
4. `frontend/src/components/chw/QrCodeSvg.tsx` — Lightweight zero-dependency SVG QR encoder encoding strictly `MW-REF:<opaque-code>` (zero PHI).
5. `frontend/src/components/chw/ReferralSlip.tsx` — Printable A6/A5 portrait standard referral slip with provisional vs. confirmed reference distinction, `MWP-*` system ID, and zero-PII QR code.
6. `frontend/src/components/chw/__tests__/phase3d-chw-workflow.test.tsx` — Focused Vitest suite covering patient registration, assisted consent, standard referral creation, offline-first dependency & F-3 uncertain-outcome reconciliation, referral slip/QR zero-PHI guarantee, and My Referrals.

### Modified Files
1. `frontend/src/auth/access.ts` — Add `referralCreate` and `consentRecordAssisted` to `PERMISSIONS`.
2. `frontend/src/auth/nav.ts` — Expose `patients` and `referrals` nav items to CHWs with `referral.create`.
3. `frontend/src/api/queries/types.ts` — Add Phase 3A/3B fields (`system_id`, `has_account`, `patient_system_id`, `patient_has_account`, `consent_request_id`, `is_partial`, `completeness_status`, `reconciled_at`).
4. `frontend/src/offline/unifiedQueue.ts` — Add `reconcileUncertainFailedItem(ownerUserId, queueId, transport)` implementing the F-3 safety rule (probe server with original `idempotencyKey` before rotating key on edit).
5. `frontend/src/app/[locale]/(clinician)/patients/page.tsx` — Add "Register patient" button and show `system_id` in search rows.
6. `frontend/src/app/[locale]/(clinician)/referrals/new/page.tsx` — Support offline-created patient dependency, optional clinical context (`symptoms`, `observations`, `allergy_status`: `unknown` / `none_known` / `known`), offline `standard_referral` enqueue, and immediate provisional `ReferralSlip`.
7. `frontend/src/app/[locale]/(clinician)/referrals/[id]/page.tsx` — Mount `AssistedConsentPanel` when `CONSENT_REQUESTED` and add printable `ReferralSlip` toggle.
8. `frontend/src/components/clinical/ReferralsIndex.tsx` — Enable Outgoing tab + "New referral" for CHWs with `referral.create`, show `patient_system_id`, and display local unsynchronized referrals with distinct sync vs. workflow status labels.
9. `frontend/src/i18n/messages/en.json` & `bn.json` — Add `chw.*` bilingual keys (full parity).

---

## 3. Out of Scope (Strictly Excluded)

- Receiving facility's full partial-intake / reconciliation management UI.
- Voice AI / speech recognition changes.
- Backend model/migration changes.
- Git commits or pushes.
