# Phase 3D Implementation Report — CHW Patient Registration & Referral UI

**Date:** 2026-11-24  
**Scope:** Phase 3D ONLY (CHW navigation, phone-less patient registration, assisted in-person consent, offline-first standard referral creation, printable zero-PII QR referral slip, CHW My Referrals list, and F-3 uncertain-outcome reconciliation).  
**Branch:** `development` (uncommitted, awaiting Phase 3D Approval Gate)

---

## 1. Architecture & UI Decisions

- **Reuse over rebuild:** Extended the existing `(clinician)` workspace routes (`/patients`, `/patients/new`, `/referrals/new`, `/referrals/[id]`, `/referrals/outgoing`), existing Handover design system primitives (`PageHeader`, `Panel`, `Field`, `Input`, `Textarea`, `Button`, `SegmentedControl`, `Alert`, `StatusBadge`), and the hardened Phase 3C/3C.2 `unifiedOfflineStore` without altering the backend data model or existing emergency referral flow.
- **Clear separation of sync vs. clinical workflow state:** Every offline-saved patient and referral explicitly displays local/provisional status (`local-pat-*`, `PROVISIONAL — SAVED LOCALLY`, `"Saved locally"` / `"Pending synchronization"` / `"Synchronization failed"`) and never claims that the receiving facility has received or accepted a locally saved referral.
- **Zero-PII QR security:** Built a lightweight, zero-dependency SVG QR renderer (`QrCodeSvg.tsx`) that encodes **only** the approved opaque token `MW-REF:<referenceCode>` (`buildReferralQrToken`), matching the Phase 3B backend lookup endpoint `GET /api/v1/referrals/by-reference/{code}`.

---

## 2. Files Created & Modified

### Created Files
- [`PHASE_3D_IMPLEMENTATION_PLAN.md`](file:///d:/medi_waypoint/PHASE_3D_IMPLEMENTATION_PLAN.md)
- [`frontend/src/components/chw/RegisterPatientForm.tsx`](file:///d:/medi_waypoint/frontend/src/components/chw/RegisterPatientForm.tsx)
- [`frontend/src/app/[locale]/(clinician)/patients/new/page.tsx`](file:///d:/medi_waypoint/frontend/src/app/[locale]/(clinician)/patients/new/page.tsx)
- [`frontend/src/components/chw/AssistedConsentPanel.tsx`](file:///d:/medi_waypoint/frontend/src/components/chw/AssistedConsentPanel.tsx)
- [`frontend/src/components/chw/QrCodeSvg.tsx`](file:///d:/medi_waypoint/frontend/src/components/chw/QrCodeSvg.tsx)
- [`frontend/src/components/chw/ReferralSlip.tsx`](file:///d:/medi_waypoint/frontend/src/components/chw/ReferralSlip.tsx)
- [`frontend/src/components/chw/__tests__/phase3d-chw-workflow.test.tsx`](file:///d:/medi_waypoint/frontend/src/components/chw/__tests__/phase3d-chw-workflow.test.tsx)

### Modified Files
- [`frontend/src/auth/access.ts`](file:///d:/medi_waypoint/frontend/src/auth/access.ts) — Added `referralCreate` (`"referral.create"`) and `consentRecordAssisted` (`"consent.record_assisted"`) to `PERMISSIONS`.
- [`frontend/src/auth/nav.ts`](file:///d:/medi_waypoint/frontend/src/auth/nav.ts) — Exposed `patients` and `referrals` nav items to CHWs holding `referral.create` while keeping unprivileged `facility_staff` restricted to `queue`.
- [`frontend/src/api/queries/types.ts`](file:///d:/medi_waypoint/frontend/src/api/queries/types.ts) — Added `system_id`, `has_account` on `Patient` and `patient_system_id`, `patient_has_account`, `initiated_by_id`, `consent_request_id`, `is_partial`, `completeness_status`, `reconciled_at` on `Referral`.
- [`frontend/src/offline/unifiedQueue.ts`](file:///d:/medi_waypoint/frontend/src/offline/unifiedQueue.ts) — Added `reconcileUncertainFailedItem(ownerUserId, queueId, transport)` implementing the F-3 uncertain-outcome safety rule.
- [`frontend/src/app/[locale]/(clinician)/patients/page.tsx`](file:///d:/medi_waypoint/frontend/src/app/[locale]/(clinician)/patients/page.tsx) — Added **Register patient** CTA and surfaced `system_id` (`MWP-*`) in search results.
- [`frontend/src/app/[locale]/(clinician)/referrals/new/page.tsx`](file:///d:/medi_waypoint/frontend/src/app/[locale]/(clinician)/referrals/new/page.tsx) — Added offline-created patient selection/dependency wiring, clinical context (`symptoms`, `observations`, `allergy_status`: `unknown` / `none_known` / `known`), offline `standard_referral` enqueue, and immediate provisional `ReferralSlip`.
- [`frontend/src/app/[locale]/(clinician)/referrals/[id]/page.tsx`](file:///d:/medi_waypoint/frontend/src/app/[locale]/(clinician)/referrals/[id]/page.tsx) — Mounted `AssistedConsentPanel` when `CONSENT_REQUESTED` and added printable `ReferralSlip` toggle.
- [`frontend/src/components/clinical/ReferralsIndex.tsx`](file:///d:/medi_waypoint/frontend/src/components/clinical/ReferralsIndex.tsx) — Enabled Outgoing tab + **New referral** CTA for CHWs with `referral.create`, surfaced `patient_system_id` and `reference_code`, and added the **Unsynchronized referrals on this device** section with distinct sync vs. workflow labels.
- [`frontend/src/i18n/messages/en.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/en.json) & [`frontend/src/i18n/messages/bn.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/bn.json) — Added complete `chw.*` bilingual keys (100% parity).
- [`MASTERPLAN.md`](file:///d:/medi_waypoint/MASTERPLAN.md) — Added Phase 3D row to §10 Interface Ledger.

---

## 3. Actual API Contracts Used (Zero Backend Changes)

| Capability | Endpoint | Contract Verified |
|---|---|---|
| Patient registration | `POST /api/v1/patients/` | `given_name`, `sex` required; `phone`, `family_name`, `name_bn`, `estimated_age`, `birth_date`, `identifiers[]` optional; `Idempotency-Key` header; returns `system_id` (`MWP-*`) & `has_account`. |
| Patient search | `GET /api/v1/patients/?q=...` | Matches name, `MWP-*`, NID, birth reg, phone within authorized scope. |
| Assisted consent | `POST /api/v1/consents/requests/{id}/record-assisted` | `method` (`assisted_verbal` / `assisted_paper`), `patient_confirmed_in_person: true`, `witness_name`, `notes`, `consent_language`. Advances only to `READY_FOR_SENDER_APPROVAL`. |
| Standard referral | `POST /api/v1/referrals/` | `patient_id`, `receiver_facility_id`, `reason`, `urgency`, optional `encounter_id`, `summary`, `provisional_code`, `idempotency_key` + `Idempotency-Key` header. |
| Receiving QR lookup | `GET /api/v1/referrals/by-reference/{code}` | Accepts `MW-REF:<code>` or bare reference/provisional code; enforces facility authorization. |

---

## 4. Patient Registration Workflow (`/patients/new`)

- Clearly distinguishes required (`given_name`, `sex`) and optional fields (`family_name`, `name_bn`, `estimated_age`, `birth_date`, `phone`, `nid`/`birth_registration`).
- Prevents duplicate submission via a single-intent `intentKeyRef` + `submittingRef` lock.
- **Online:** Displays the server-generated `MWP-*` System Patient ID and a direct **Start referral for this patient** CTA.
- **Offline / network failure:** Enqueues an encrypted `patient_create` record in `unifiedOfflineStore`, displays the temporary `local-pat-*` reference (never fabricates a fake `MWP-*` ID), and links directly to `/referrals/new?offlinePatientQueueId=...&localPatientRef=...`.

---

## 5. Assisted Consent Workflow (`AssistedConsentPanel`)

- Mounted on `/referrals/[id]` whenever `state === "CONSENT_REQUESTED"` and `consent_request_id` is present for clinicians or CHWs holding `consent.record_assisted`.
- Supports `assisted_verbal` and `assisted_paper`, requires explicit in-person confirmation checkbox and witness full name, collects optional notes and explanation language (`bn`/`en`).
- Displays an explicit `[Clinical/legal review required before live pilot]` / `[লাইভ পাইলটের আগে ক্লিনিক্যাল/আইনি পর্যালোচনা প্রয়োজন]` notice and states that assisted consent does **not** replace clinician sender approval.
- Automatically blocks assisted consent if `patient_has_account` is `true`.

---

## 6. Standard Referral Creation & Offline Integration (`/referrals/new`)

- Supports existing patients, newly registered patients, and offline-created patients (loaded from `unifiedOfflineStore` or URL params).
- Includes optional clinical context (`symptoms`, `observations`, and `allergy_status` preserving `unknown` vs. `none_known` vs. `known` + details).
- When offline, on network failure, or when linked to an offline-created patient, enqueues `standard_referral` with `dependsOnQueueId` (never submitting before the patient dependency resolves) and immediately displays the printable provisional `ReferralSlip` with an explicit **"Saved locally (not yet sent)"** banner.
- Implements the **F-3 uncertain-outcome safety rule** (`reconcileUncertainFailedItem`): probes the server using the **original `idempotencyKey`** before rotating keys on edit, finalizing as `SYNCED` with zero duplicates if the server had already accepted the original request.

---

## 7. Referral Slip & QR Security (`ReferralSlip` + `QrCodeSvg`)

- Printable A6/A5 portrait slip reusing the black-on-paper Handover aesthetic of `EmergencySlip.tsx`.
- Clearly distinguishes **PROVISIONAL — SAVED LOCALLY (PENDING SYNC)** vs. **CONFIRMED SERVER REFERENCE**.
- Displays `MWP-*` System Patient ID when available or `"Pending sync (local patient)"` while offline.
- QR SVG encodes **strictly** `MW-REF:<referenceCode>` (`data-qr-payload="MW-REF:..."`) with **zero PHI** (no patient name, phone, or diagnosis).

---

## 8. English & Bangla Coverage

- Zero hardcoded user-facing strings; all new UI copy lives under `chw.*` in [`en.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/en.json) and [`bn.json`](file:///d:/medi_waypoint/frontend/src/i18n/messages/bn.json), verified by `src/i18n/i18n.test.ts` (9/9 passed).

---

## 9. Test Commands & Actual Results

| Check | Command | Result |
|---|---|---|
| Phase 3D & Full Frontend Regression Suite | `cd d:\medi_waypoint\frontend; npx vitest run src/components/chw/__tests__/phase3d-chw-workflow.test.tsx src/auth/access.test.ts src/i18n/i18n.test.ts src/offline/offline.test.tsx src/offline/__tests__/phase3c-sync.test.tsx src/offline/__tests__/phase3c2-hardening.test.tsx src/app/clinical-pages.test.tsx` | **PASSED — 7 / 7 files, 112 / 112 tests** (`phase3d-chw-workflow.test.tsx` 9/9, `access.test.ts` 18/18, `i18n.test.ts` 9/9, `offline.test.tsx` 4/4, `phase3c-sync.test.tsx` 13/13, `phase3c2-hardening.test.tsx` 12/12, `clinical-pages.test.tsx` 47/47) |
| TypeScript Typecheck | `cd d:\medi_waypoint\frontend; npx tsc --noEmit` | **PASSED — 0 errors** |
| Design Token Lint | `cd d:\medi_waypoint\frontend; npm run lint:tokens` | **PASSED — 181 files, 0 violations** |

---

## 10. Remaining Limitations & Walkthrough

- **Walkthrough of CHW End-to-End Journey:**
  1. CHW signs in -> sees **Queue**, **Patients**, and **Referrals** in sidebar.
  2. Opens **Patients** -> clicks **Register patient** (`/patients/new`) -> registers phone-less patient (online -> receives `MWP-XXXXXXXX`; offline -> encrypted `local-pat-*` queued).
  3. Clicks **Start referral** (`/referrals/new`) -> selects destination, urgency, reason, and optional symptoms/vitals/allergy status (`unknown` vs. `none_known` vs. `known`).
  4. Offline or with offline patient -> saved encrypted with `dependsOnQueueId`, provisional printable **Referral Slip + zero-PII QR** shown immediately.
  5. On reconnect -> `OfflineSyncBar` syncs patient first (`MWP-*`), resolves dependency, syncs referral cleanly without duplicates.
  6. On `/referrals/[id]` when `CONSENT_REQUESTED` -> CHW records **Assisted in-person consent** (`assisted_verbal` or `assisted_paper` with witness), advancing to `READY_FOR_SENDER_APPROVAL` for clinician approval, and can print the confirmed **Referral Slip**.
  7. On **Referrals → Outgoing**, CHW tracks unsynchronized local referrals separately from server-submitted referrals and their receiving-facility workflow status.
- **Limitations:** Receiving-facility partial-intake UI (`PartialReferralModal`) and full live browser E2E Playwright walkthrough remain deferred to the next phase (explicitly out of scope for Phase 3D). No Git commits or pushes were performed.
