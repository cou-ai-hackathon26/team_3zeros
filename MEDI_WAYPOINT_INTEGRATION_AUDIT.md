# Medi Waypoint — Integration Audit Report (Phase 1)

**Date:** 2026-11-24  
**Branch Audited:** `development` (`ae7b5e9`)  
**Scope:** Integration of Challenge 1 (*Referral for a Patient Without a Personal Phone*) and Challenge 2 (*Referral Continuity During Network Failure & Partial Referral Acceptance*) into the existing Medi Waypoint platform.

---

## 1. Existing Architecture

Medi Waypoint is an established, well-structured full-stack web application built around shared contracts in [MASTERPLAN.md](MASTERPLAN.md):

| Layer | Technology & Structure | Key Files |
|---|---|---|
| **Backend** | Django 5+ / Django REST Framework (`api/v1/`), 19 modular domain apps, SQLite (local) / PostgreSQL (prod), Celery + Redis outbox workers, Django Channels (WebSocket). | `backend/config/settings/`, `backend/config/urls.py`, `backend/apps/*` |
| **Workflow Engine** | Centralized declarative state-machine engine (`apps/workflow/engine.py`) with server-computed `allowed_actions`, optimistic concurrency (`If-Match` / `version`), `HistoryEntry` audit trail, and `OutboxEvent` delivery. | `backend/apps/workflow/`, `backend/apps/referrals/transitions.py` |
| **Interoperability** | HL7 FHIR R4 sync boundary (`apps/fhir/sync.py`, `client.py`) with `fhir_sync_status` (`PENDING`, `SYNCED`, `FAILED`) and `202 Accepted` semantics (`INV-12`). | `backend/apps/fhir/` |
| **Frontend** | Next.js 15.5 (App Router, `[locale]` i18n for `bn`/`en`), React 19, Tailwind CSS v4, Radix UI, TanStack Query, `openapi-fetch`, `idb` (IndexedDB), Web Crypto API, Vitest (29 suites / 331 tests). | `frontend/src/app/[locale]/`, `frontend/src/api/`, `frontend/src/components/` |
| **Design System** | "Handover" design system defined in `frontend/src/tokens/tokens.json` & `tokens.css` (`@layer base`). Enforced by `lint:tokens` (no raw hex/rgb outside `src/tokens/`), `cn()` utility (`src/lib/cn.ts`), and `UIUX_DESIGN.md` / `docs/redesign/DESIGN_SYSTEM.md`. | `frontend/src/tokens/`, `frontend/src/components/ui/` |
| **Voice & Triage** | Bangla/English browser voice call room (Vapi / ElevenLabs / WebRTC / Text fallback) backed by deterministic red-flag rules (`INV-8`), Cerebras LLM dialogue, and `apps/knowledge` RAG search. | `backend/apps/triage/`, `frontend/src/voice/`, `frontend/src/features/patient/TriageView.tsx` |
| **Offline Module** | AES-GCM encrypted IndexedDB queue (`EmergencyQueueStore`) for the 5-field emergency referral form, with Crockford Base32 provisional codes and printable `EmergencySlip`. | `frontend/src/offline/` (`queue.ts`, `crypto.ts`, `provisionalCode.ts`, `EmergencySlip.tsx`, `store.ts`) |

---

## 2. Existing Functionality Relevant to Both Challenges

### Already Present & Reusable
1. **Nullable Patient Phone & Multi-Identifier Model (`backend/apps/identity/models.py`):**
   - `Patient.phone` is already `null=True, blank=True`.
   - `PatientIdentifier` supports `nid`, `birth_reg`, `health_id`, and `facility_mrn`.
   - `POST /api/v1/patients/` (`PatientListCreateView`) and `GET /api/v1/patients/?q=...` (`search_patients`) already exist and search across `phone`, `given_name`, `family_name`, `name_bn`, and `identifiers__value`.
   - Duplicate identity detection (`DuplicateCandidate`) is already non-destructive (`INV-13`: human review, never auto-merge).
2. **Reference & Provisional Code Lookup (`backend/apps/referrals/`):**
   - `Referral` already generates an 8-character Crockford Base32 `reference_code` and stores a `provisional_code`.
   - `GET /api/v1/referrals/by-reference/<code>` (`get_referral_by_code`) already searches `Q(reference_code=code) | Q(provisional_code=code)` scoped to active facility memberships.
   - `ReferralsIndex.tsx` already includes a `SlipLookup` form on the incoming referrals tab.
3. **Encrypted IndexedDB Emergency Queue (`frontend/src/offline/`):**
   - `EmergencyQueueStore` uses `idb` + non-extractable Web Crypto `AES-GCM` keys to persist encrypted payloads across page refreshes.
   - `POST /api/v1/referrals/emergency` already enforces server-side idempotency via `EmergencyReferral.idempotency_key` (`UUIDField(unique=True)`), returning `409` on payload mismatch and returning the existing referral on identical retry.
   - `SyncBadge` component (`frontend/src/components/SyncBadge/SyncBadge.tsx`) already exists for displaying sync status.
   - `EmergencySlip.tsx` provides a clean, black-on-white, print-ready A6/A5 slip.

---

## 3. Missing Functionality — Challenge 1 (Patient Without a Personal Phone)

| Gap ID | Area | Current Limitation | Required Addition |
|---|---|---|---|
| **C1-1** | **Frontend Patient Registration UI** | `/patients` (`patients/page.tsx`) only supports searching. `/referrals/new` only selects existing patients. (`handover.md` notes `"Register patient"` UI is unbuilt.) | Add a Bangla/English "Register Patient" form (standalone on `/patients` and inline in `/referrals/new`) where phone and email are explicitly optional ("No personal phone" toggle), supporting alternative identifiers (NID, Birth Reg, Facility MRN) and optional age/DOB/area. |
| **C1-2** | **Human-Readable System Patient ID** | Patients only have a 36-char UUID (`public_id`). If a patient has no phone and no NID, there is no simple ID to print on a slip or search verbally. | Auto-generate a short, Crockford Base32 system patient ID (e.g., `MWP-XXXX-XXXX` stored as a `PatientIdentifier` with `system="system_id"`) on patient creation, searchable via `GET /api/v1/patients/?q=...`. |
| **C1-3** | **Consent Deadlock for Account-less Patients (Critical)** | `REFERRAL_TRANSITIONS["approve"]` and `["send"]` require `guard_active_consent`. `grant_consent_request` (`apps/consent/services.py:7`) strictly checks `user.patient_account.patient_id == patient.id`. A patient without a phone/account **cannot** log in to grant consent, permanently blocking the referral in `AWAITING_PATIENT_CONSENT`. | Implement **CHW/Clinician-Witnessed In-Person Consent** (`method="assisted_verbal"` / `"assisted_paper"`): when a patient has no platform account, an authorized health worker/clinician can record the patient's explicit in-person consent (with witness actor, timestamp, and confirmation note) as a separate audited action (`INV-10`), allowing the referral to advance to `READY_FOR_SENDER_APPROVAL`. |
| **C1-4** | **CHW Assisted Referral Permissions & Tracking** | `create_referral_draft` (`apps/referrals/services.py:31`) strictly requires `membership.role == "clinician"`. `facility_staff` (including CHWs) cannot initiate standard referrals or view the `outgoing` tab (`ReferralsIndex.tsx:111`). | Support CHW-assisted referral initiation and outgoing tracking via a permission scope on `facility_staff` (e.g., `referral.create_assisted` / `chw`), allowing CHWs to register phone-less patients, capture symptoms/triage, draft/submit referrals, print slips, and monitor status—while keeping clinical sign-off / audit trails intact. |
| **C1-5** | **Referral Token / QR Code & Printable Slip for Standard Referrals** | `EmergencySlip` is only wired to `/emergency` and has no QR code. Standard referrals (`/referrals/[id]`) have no printable slip or scannable token. | Add a printable `ReferralSlip` (reusing `EmergencySlip` design language) available on any referral, displaying: Reference Code, System Patient ID, Facility destination, and a **zero-PII QR code** (encoding only an opaque retrieval token / reference code, never raw clinical data) plus a quick-lookup scanner/input at the receiving facility. |
| **C1-6** | **Notification Independence** | Ensure notification dispatch (`apps/notifications/services.py`) gracefully skips SMS/email when `patient.phone` is `None` and `patient` has no `PatientAccount`, instead surfacing status updates in the health worker's dashboard. | Audit and guard notification hooks so phone-less referrals never throw errors or block transitions. |

---

## 4. Missing Functionality — Challenge 2 (Network Failure & Partial Referral Acceptance)

| Gap ID | Area | Current Limitation | Required Addition |
|---|---|---|---|
| **C2-1** | **Offline Queue Limited to `/emergency`** | `EmergencyQueueStore` only handles `POST /referrals/emergency`. Creating a standard referral (`/referrals/new`) or executing status updates (`acknowledge`, `start`, `record_outcome`) fails immediately when offline and loses form input on refresh. | Generalize/extend the encrypted IndexedDB offline architecture (`frontend/src/offline/`) to support: (a) **offline referral creation** (both standard/CHW and emergency), and (b) **offline status update / action queueing** with automatic retry on `online` / `focus` / interval and manual "Retry now" controls. |
| **C2-2** | **Explicit Sync Lifecycle & Queue Visibility** | `EmergencyQueueStore.syncAll` deletes synced items immediately (`db.delete`) and there is no dedicated queue drawer/panel showing all locally queued items across refreshes/restarts. | Track and surface all 5 required states in the UI: `Saved locally` (`QUEUED_LOCAL`), `Pending synchronization` (`PENDING_SYNC`), `Synchronizing` (`SYNCING`), `Synchronized` (`SYNCED` — retained briefly as a reconciled summary linking to the live server referral), and `Synchronization failed / retry required` (`FAILED` / `CONFLICT`). |
| **C2-3** | **Missing Idempotency on Standard Referral Creation** | `POST /api/v1/referrals/` does not persist or validate `idempotency_key`. Retrying after a dropped response creates duplicate referrals. | Add `idempotency_key` (`UUIDField(unique=True, null=True, blank=True)`) to `Referral` and enforce idempotent creation in `create_referral_draft` (return existing referral on identical payload, `409` on mismatch), matching `EmergencyReferral`. |
| **C2-4** | **No Partial Referral Acceptance at Receiving Facility (Critical)** | If the sender's network drops before syncing, the receiving facility gets `404` when looking up the slip/provisional code. They have **no way** to accept the patient into Medi Waypoint with the minimum summary from the slip/QR/phone call. | Implement **Partial Referral Intake & Reconciliation**:<br>1. Receiving facility endpoint (`POST /api/v1/referrals/partial-intake`) + UI ("Accept Partial / Unsynced Referral") to create a `Referral` marked `is_partial=True` (`completeness_status="partial"`) with `missing_fields` explicitly computed and displayed (never fabricated).<br>2. Receiving facility can immediately acknowledge, mark patient received (`IN_PROGRESS`), and record outcomes.<br>3. When the sender's offline queue later syncs with the same `provisional_code` / `idempotency_key`, the backend **reconciles** into the existing partial referral: enriches missing clinical fields, upgrades `completeness_status` to `"complete"`, and **preserves** the receiving facility's advanced state & outcome updates without creating duplicates or regressing status. |
| **C2-5** | **Clear Visual Distinction of Incomplete Records** | `ReferralWorkspacePage` assumes all referral fields are present and has no missing-field banner or completeness indicator. | Add a clear, non-alarmist completeness badge & missing-fields checklist on partial referrals (e.g., `"Partial record — waiting for full sync from sending facility; missing: Full clinical summary, Lab reports"`), using existing design system tokens. |

---

## 5. Proposed Implementation Approach

We will integrate both challenges cleanly inside the existing modular monolith and Next.js App Router without rewriting working flows:

1. **Contract-First Updates (`MASTERPLAN.md`):**
   - Document the new fields (`idempotency_key`, `is_partial`, `completeness_status`, `missing_fields`, `assisted_consent` method) and endpoints (`POST /api/v1/referrals/partial-intake`, `POST /api/v1/consents/requests/<id>/record-assisted`) in `MASTERPLAN.md` and `openapi.json` / `schema.d.ts` per `CLAUDE.md` rules.
2. **Backend Enhancements (Additive Migrations Only):**
   - `apps/identity`: Auto-generate `system_id` (`MWP-XXXXXXXX`) in `create_patient_record`; add `system_id` to `PatientIdentifier.SYSTEM_CHOICES`.
   - `apps/consent`: Add `record_assisted_consent(...)` service & endpoint for patients without a `PatientAccount`, requiring witness actor + documented in-person method (`assisted_verbal` / `assisted_paper`), strictly audited and separate from clinician referral approval.
   - `apps/referrals`:
     - Add `idempotency_key`, `is_partial`, `completeness_status` (`complete` | `partial`), `missing_fields` (`JSONField`), and `initiated_by` to `Referral`.
     - Allow `facility_staff` with `referral.create_assisted` (CHW) to create referral drafts and view outgoing referrals.
     - Add `POST /api/v1/referrals/partial-intake` for receiving facilities to accept a patient with minimum slip/QR data when full sync hasn't arrived.
     - Add **reconciliation logic** in `create_referral_draft` and `create_emergency_referral`: if a partial referral already exists with the same `provisional_code` or `idempotency_key`, merge the sender's full clinical data into it, mark it `complete`, record a `HistoryEntry` (`reconciled_full_record`), and preserve receiver-side states (`ACKNOWLEDGED_BY_RECEIVER`, `IN_PROGRESS`, `OUTCOME_RECORDED`, etc.).
3. **Frontend Enhancements (Reusing "Handover" Design System & `idb`):**
   - **No unnecessary libraries:** Use existing `idb` + Web Crypto AES-GCM for offline storage; generate crisp SVG QR codes via a tiny zero-dependency pure-TS QR encoder (or evaluate lightweight `qrcode` if needed, keeping patient/clinical bundle budgets intact).
   - **Offline Sync Engine (`frontend/src/offline/`):** Extend `EmergencyQueueStore` or add a unified `ReferralOfflineQueue` storing encrypted referral creations AND queued state transitions, with a visible `OfflineSyncBanner` / `SyncQueuePanel` accessible from the clinician/CHW shell.
   - **CHW & Phone-less Patient UI:**
     - Add "Register Patient" form (with optional phone & alternative IDs) on `/patients` and inline in `/referrals/new`.
     - Add Bangla/English voice-to-text / symptom capture support in the CHW referral form (reusing existing `src/voice/` helpers without diagnosing).
     - Add printable `ReferralSlip` with Reference Code, System Patient ID, and zero-PII QR code on `/referrals/[id]` and after offline save.
     - Add "Record In-Person Witnessed Consent" action on `/referrals/[id]` when the patient has no personal account.
   - **Partial Referral Intake UI:**
     - Add "Accept Partial Referral (Offline / Unsynced)" modal/drawer inside `ReferralsIndex` (`incoming` tab) when a code lookup returns 404 or when a patient arrives with a slip/QR while the sender is offline.
     - Display a clear "Partial Record" banner and missing-fields checklist on `/referrals/[id]` until full reconciliation completes.

---

## 6. Files & Components Likely to Be Modified / Created

### Backend
- `backend/apps/identity/models.py`, `services.py`, `serializers.py` (system patient ID auto-generation, phone-less registration support)
- `backend/apps/consent/models.py`, `services.py`, `views.py`, `urls.py` (witnessed in-person consent for account-less patients)
- `backend/apps/referrals/models.py`, `serializers.py`, `services.py`, `selectors.py`, `transitions.py`, `views.py`, `urls.py` (idempotency key, CHW assisted initiation, partial referral intake, full-sync reconciliation)
- `backend/apps/notifications/services.py` (verify null-phone / account-less safety)
- `backend/apps/accounts/catalogue.py` & `seed_demo_data.py` (add CHW permission `referral.create_assisted` and demo CHW account for testing)
- New migrations in `identity`, `referrals`, `consent`
- New pytest suites in `backend/tests/test_challenge1_no_phone.py` and `backend/tests/test_challenge2_offline_partial.py`

### Frontend
- `frontend/src/offline/` (extend queue for standard referrals + status updates + sync status tracking + conflict/retry UI)
- `frontend/src/components/ReferralSlip/` (printable slip + zero-PII QR code component)
- `frontend/src/components/clinical/PartialReferralModal.tsx` (receiving facility intake for unsynced/partial referrals)
- `frontend/src/components/clinical/RegisterPatientForm.tsx` (reusable phone-optional patient registration)
- `frontend/src/components/clinical/ReferralsIndex.tsx` (outgoing visibility for CHWs, partial intake fallback on 404 lookup)
- `frontend/src/app/[locale]/(clinician)/patients/page.tsx` (integrate Register Patient)
- `frontend/src/app/[locale]/(clinician)/referrals/new/page.tsx` (inline patient registration, offline-capable submission, voice symptom input)
- `frontend/src/app/[locale]/(clinician)/referrals/[id]/page.tsx` (printable slip/QR, witnessed consent button, partial-record missing-fields banner, offline status update queueing)
- `frontend/src/i18n/messages/en.json` & `bn.json` (bilingual copy for new UI elements)
- New Vitest suites in `frontend/src/offline/` and `frontend/src/app/`

---

## 7. Security, Privacy & Data Integrity Concerns

1. **Zero-PII QR Codes & No Predictable Public URLs:**
   - QR codes must **never** encode raw clinical notes, diagnoses, or unauthenticated URLs. They will encode only an opaque structured token (`MW-REF:<reference_or_provisional_code>`) that requires an authenticated receiving-facility session to resolve.
   - For true offline-to-offline partial intake when the server has not yet received the record, the printed slip carries the human-readable minimum dataset (consistent with existing `EmergencySlip.tsx` and `SECURITY §6.3`), entered by authenticated receiving staff.
2. **Offline Browser Storage Risk (Explicit Disclosure & Mitigation):**
   - Locally queued referral data in IndexedDB is **encrypted at rest with AES-GCM** using a non-extractable Web Crypto key (`frontend/src/offline/crypto.ts`).
   - Only minimum required fields are stored offline; full chart history is never cached in browser storage.
   - Encrypted payloads are cleared immediately upon confirmed server reconciliation (`SYNCED`), and stale items (>72h) trigger an explicit warning banner.
   - Shared-device risk: signing out or idle timeout (`IdleTimeout.tsx`) protects the UI; we will ensure the offline queue respects facility/user scoping.
3. **Consent Integrity (`INV-10`):**
   - Assisted/witnessed in-person consent is strictly audited (`actor_user`, `method="assisted_verbal"`, `reason/notes`, `timestamp`) and remains a separate step from sending-clinician approval.
4. **Preventing Data Loss & State Regression During Reconciliation:**
   - Server-side reconciliation uses `select_for_update()` inside `transaction.atomic()`.
   - When a sender's delayed full referral arrives for an already-accepted partial referral, the server merges missing clinical fields **without** downgrading the referral's state (e.g., `ACKNOWLEDGED_BY_RECEIVER` / `IN_PROGRESS` / `OUTCOME_RECORDED` is strictly preserved) and logs a `HistoryEntry` audit record.
5. **No Fabricated Clinical Data:**
   - Partial referrals explicitly store and render `missing_fields` (e.g., `["clinical_summary", "documents", "allergies"]`) and show `Not yet received` rather than defaults or placeholders.

---

## 8. Potential Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| **Contract drift with `MASTERPLAN.md` & `openapi.json`** | Frontend type checks or backend contract tests fail. | Update `MASTERPLAN.md`, serializers, and `src/api/queries/types.ts` together; run `tsc --noEmit` and `pytest`. |
| **Token/Design System Violations (`lint:tokens`)** | CI fails if raw colors or unlayered CSS are used. | Use only design tokens (`bg-surface`, `text-ink`, `border-line`, `tone="attention"`) and `cn()`. |
| **Duplicate Referrals on Flaky Mobile Networks** | Same referral created twice if HTTP response drops after DB commit. | Enforce client-generated UUID `idempotency_key` on **all** referral creations + unique DB constraint + `provisional_code` reconciliation. |
| **Stale Conflict When Receiver Updates Partial Record** | Sender's delayed sync overwrites receiver's acknowledgement or outcome. | Monotonic state-rank reconciliation on the server: receiver's progress is never overwritten; only missing sender clinical fields are enriched. |
| **Breaking Existing 331 Frontend / 102 Backend Tests** | Regressions in existing clinical, patient, or auth workflows. | All schema changes are additive with safe defaults; run existing Vitest + Pytest suites after implementation. |

---

*End of Phase 1 Audit Report. Awaiting your approval before proceeding to **Phase 2 — UX and Workflow Design** (`MEDI_WAYPOINT_WORKFLOW_DESIGN.md`).*
