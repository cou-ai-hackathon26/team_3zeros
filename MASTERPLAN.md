# Medi Waypoint — Masterplan

> **BLUF:** This file is the single entry point and the single source of truth
> for every fact that more than one part of the system depends on: roles,
> states, API endpoints, error formats, events, decisions and open questions.
> The five workstream documents link here instead of copying these facts.
> Read this file before working on any part of the system. If a fact is not
> written here or in the owning document, it is not decided. Do not invent it.

---

## 1. How to use this documentation set

### 1.1 Document map

| Document | Owns | Read it when |
|---|---|---|
| [MASTERPLAN.md](MASTERPLAN.md) (this file) | Shared contracts, decisions, open questions, phase map, interface ledger | Always, first |
| [docs/BACKEND.md](docs/BACKEND.md) | Django apps, data models, services, state-machine engine, FHIR sync, workers, AI/triage orchestration | Building or changing anything server-side |
| [docs/FRONTEND.md](docs/FRONTEND.md) | Next.js structure, routes, data fetching, auth handling, i18n, voice client, offline queue client | Building or changing anything in the browser |
| [docs/UIUX_DESIGN.md](docs/UIUX_DESIGN.md) | Visual identity, design tokens, components, screen layouts, motion, copy rules | Designing or styling any screen |
| [docs/redesign/](docs/redesign/REDESIGN_IMPLEMENTATION_PLAN.md) | "Handover" identity, component strategy, auth/RBAC architecture, application and landing design, redesign phases | Any UI work; it supersedes UIUX_DESIGN §3–§5 (D-14, D-15) |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, authentication, authorization, consent enforcement, audit, privacy controls | Any change that touches patient data, auth, files, AI input or external vendors |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Environments, containers, networks, CI/CD, backups, observability, release order | Running, shipping or operating the system |

Source documents these were derived from (do not edit to match; they are the
input record):
[Medi_Waypoint_System_Architecture.md](Medi_Waypoint_System_Architecture.md) and
[Medi_Waypoint_Project_Plan.md](Medi_Waypoint_Project_Plan.md).

### 1.2 Required reading by task

| You are working on | Read, in this order |
|---|---|
| A backend endpoint | §3–§7 here → BACKEND → SECURITY §4–§6 |
| A frontend screen | §3–§7 here → UIUX_DESIGN → FRONTEND → SECURITY §4 |
| A full-stack feature | §3–§7 here → BACKEND → FRONTEND → UIUX_DESIGN → SECURITY |
| Voice triage | §3, §5.3, §8.2 (Q-03, Q-05, Q-06) here → BACKEND §8 → FRONTEND §8 → SECURITY §8 → UIUX_DESIGN §6.2 |
| Infrastructure | §8 here → DEPLOYMENT → SECURITY §9 |

### 1.3 Anti-drift rules (how context stays consistent across ends)

1. **One owner per fact.** Every shared fact lives in exactly one place (see
   §1.1). Other documents link to it. A copied table is a bug.
2. **Contract first.** To change a state, endpoint, field, role or event: edit
   this file first, then update BACKEND and FRONTEND in the same change, then
   record it in §10 (Interface ledger).
3. **Generated types, not hand-written ones.** The backend publishes an
   OpenAPI schema (BACKEND §11). The frontend generates its TypeScript types
   from it (FRONTEND §5). If the two disagree, the build fails rather than the
   UI silently drifting.
4. **Open means open.** Items in §8.2 are undecided. Code must not assume an
   answer. Build behind a setting or an adapter, and mark it with the
   question ID (for example `# Q-03`).
5. **No invented clinical content.** Red-flag rules, emergency instructions,
   emergency numbers, approved medical sources, Bangla clinical wording and
   escalation thresholds come only from named clinical reviewers. Until they
   exist, use clearly marked placeholders (`PLACEHOLDER — NOT CLINICALLY
   APPROVED`) that fail a pilot-readiness check.
6. **Plain English.** Write requirements as mechanisms, not adjectives.

---

## 2. Product in one page

Medi Waypoint is a web platform for Bangladesh that takes a patient from first
symptom to a suitable doctor, carries their record between providers, and
returns the referral outcome to the doctor who referred them.

- **Patient journey:** website → Bangla/English voice (or text) triage in the
  browser → reviewable summary → find doctor → request appointment → doctor
  decides in dashboard → status visible to patient.
- **Clinical journey:** clinician records visit → uploads reports → verifies
  OCR values → reviews AI referral draft → patient consents to sharing →
  sending doctor approves and sends → receiver acknowledges or declines →
  receiver records outcome → outcome returns to sender → referral closes.
- **Emergency journey:** upazila facility submits a five-field emergency
  referral (online or queued offline, with a printed slip) → district hospital
  acknowledges → outcome returns.

### 2.1 Product invariants (apply to every phase and every document)

| ID | Rule |
|---|---|
| INV-1 | Primary triage starts on the website. No phone call is part of the primary flow. |
| INV-2 | Voice uses the browser microphone after an explicit user action and permission prompt. A text fallback always exists. |
| INV-3 | Bangla and English are both supported, including switching mid-session. |
| INV-4 | Doctors approve appointment requests and outgoing referrals only in the authenticated dashboard. |
| INV-5 | Receiving facilities acknowledge or decline referrals only in their dashboard. |
| INV-6 | SMS is only for notifications, reminders and status. An SMS cannot perform or approve any action. |
| INV-7 | AI does not diagnose, prescribe, give doses, approve, or send. AI output is a draft until a clinician accepts it. |
| INV-8 | Deterministic clinician-authored red-flag rules run before any generated triage text. |
| INV-9 | Every access to patient data and every state transition is permission-checked on the server and audited. |
| INV-10 | Patient consent to share is a separate action from doctor approval. |
| INV-11 | The browser never writes to PostgreSQL or HAPI FHIR directly. All writes pass through Django. |
| INV-12 | An action is not shown as complete until its required FHIR write has succeeded. Otherwise show a pending-sync or error state. |
| INV-13 | Duplicate patient identities are suggested for human review. Never merge automatically. |
| INV-14 | Capacity data shows its last-updated time and source. It is never shown as live. |
| INV-15 | The system never cancels or suppresses a test automatically. |
| INV-16 | Emergency transfer is never blocked by non-essential fields or by network failure. |

---

## 3. Glossary

| Term | Meaning in this project |
|---|---|
| Patient | A person receiving care. May have a platform account, or be a record created by staff. |
| Clinician | A licensed doctor using the clinician dashboard. |
| Facility staff | Non-doctor staff at a facility (scheduler, coordinator, emergency desk). |
| Facility admin | Maintains a facility's directory data, slots, capacity reports and staff accounts. |
| Platform admin | Operates the platform. Has no default access to patient clinical data. |
| Sender / sending facility | The clinician and facility that create a referral. |
| Receiver / receiving facility | The facility (and its clinicians) a referral is sent to. |
| Triage session | One voice or text conversation between a patient and the triage assistant. |
| Red flag | A clinician-authored danger sign that triggers the emergency pathway. |
| Approved source | A versioned, rights-cleared, clinician-approved medical passage in the knowledge base. |
| Draft | Any AI or OCR output not yet accepted by a clinician. |
| Verified | A value or document a clinician has reviewed and accepted. |
| Outbox | Database table of events written in the same transaction as a state change and delivered later by a worker. |
| Idempotency key | A client-generated UUID sent with a write so a retry does not create a duplicate. |
| Reference code | Short human-readable code printed on an emergency slip to identify the referral. |
| Break-glass | Policy-approved emergency access to a record without prior consent, always audited and reviewed. |

---

## 4. Roles and permissions

Authorization has three layers (detailed in [SECURITY §4](docs/SECURITY.md#4-authorization-model)):
**role** (what kind of user) + **facility scope** (which facility the user acts
for) + **relationship** (why this user may see this patient). A role alone
never grants access to a patient.

### 4.1 Roles

| Role code | Who |
|---|---|
| `patient` | A patient acting for themselves |
| `clinician` | A licensed doctor attached to one or more facilities |
| `facility_staff` | Scheduler, coordinator or emergency-desk staff at a facility |
| `facility_admin` | Facility directory and staff manager |
| `platform_admin` | Platform operator, no default clinical-data access |

### 4.2 Action matrix

✓ = allowed when scope and relationship checks also pass. — = never.
"Sending clinician" means any clinician with a membership at the referral's
sending facility; the clinician who approved is recorded, but any sending-
facility clinician may act on later steps (needed for emergency referrals
created by staff).

| Action | patient | clinician | facility_staff | facility_admin | platform_admin |
|---|---|---|---|---|---|
| Start triage session | ✓ (own) | — | — | — | — |
| Request appointment, cancel own request | ✓ (own) | — | — | — | — |
| Accept / decline / propose alternate slot, confirm after patient accepts alternate | — | ✓ | ✓ (with `schedule.manage`) | — | — |
| Accept / decline proposed alternate slot | ✓ (own) | — | — | — | — |
| Complete appointment | — | ✓ | — | — | — |
| Mark no-show, cancel confirmed appointment | — | ✓ | ✓ (with `schedule.manage`) | — | — |
| View patient chart | ✓ (own, patient view) | ✓ (relationship) | limited (relationship) | — | — |
| Upload report | ✓ (own, Q-11) | ✓ | ✓ | — | — |
| Verify / reject OCR values | — | ✓ | — | — | — |
| Create / edit / reopen referral draft, request consent, cancel | — | ✓ (sending facility) | — | — | — |
| Grant / refuse / revoke sharing consent | ✓ (own) | — | — | — | — |
| Approve and send referral | — | ✓ (sending facility) | — | — | — |
| Acknowledge / decline incoming referral | — | ✓ (receiving facility) | ✓ (receiving facility, with `referral.acknowledge`) | — | — |
| Start, record outcome | — | ✓ (receiving facility) | — | — | — |
| Close referral (normal or with exception) | — | ✓ (sending or receiving facility) | — | — | — |
| Create emergency referral | — | ✓ | ✓ (with `emergency.create`) | — | — |
| Break-glass access | — | ✓ (only if policy approved, Q-07) | — | — | — |
| Manage facility directory, slots, capacity | — | — | — | ✓ (own facility) | ✓ |
| Manage staff accounts | — | — | — | ✓ (own facility) | ✓ |
| View audit log | ✓ (own record access history, Q-07) | — | — | ✓ (own facility, metadata) | ✓ (metadata) |

---

## 5. State machines (canonical)

Backend enforces these in one transition table per entity
([BACKEND §6](docs/BACKEND.md#6-state-machine-engine)). Frontend reads the
current state and the server-provided `allowed_actions` list; it never decides
transitions itself ([FRONTEND §6](docs/FRONTEND.md#6-rendering-state-and-actions)).
Every transition writes an audit event and an outbox event.

Table format is machine-checked (BACKEND §6.1): one row per action, the
**From** column is a comma-separated list of state names (no ranges or
prose), **FHIR** marks transitions that must complete a FHIR write before the
new state is applied (§5.8).

### 5.1 Appointment request

```text
REQUESTED ──accept──────────────▶ CONFIRMED ──complete──▶ COMPLETED
    │                                 ▲   ├──cancel──▶ CANCELLED
    │                                 │   └──mark_no_show──▶ NO_SHOW
    ├─propose_alternate─▶ ALTERNATE_SLOT_PROPOSED ──patient_accept──▶ PATIENT_ACCEPTED ──accept──┘
    │                                 └─patient_decline─▶ CANCELLED
    ├─decline──────────▶ DECLINED
    ├─expire (system)──▶ EXPIRED
    └─cancel───────────▶ CANCELLED
```

| Action | From | To | Actor | FHIR |
|---|---|---|---|---|
| `request` | (new) | REQUESTED | patient | no |
| `accept` | REQUESTED, PATIENT_ACCEPTED | CONFIRMED | clinician, scheduler | no |
| `decline` | REQUESTED, PATIENT_ACCEPTED | DECLINED | clinician, scheduler (reason required) | no |
| `propose_alternate` | REQUESTED | ALTERNATE_SLOT_PROPOSED | clinician, scheduler (`alternate_slot_id` required) | no |
| `patient_accept` | ALTERNATE_SLOT_PROPOSED | PATIENT_ACCEPTED | patient | no |
| `patient_decline` | ALTERNATE_SLOT_PROPOSED | CANCELLED | patient | no |
| `expire` | REQUESTED, ALTERNATE_SLOT_PROPOSED, PATIENT_ACCEPTED | EXPIRED | system (policy Q-04) | no |
| `cancel` | REQUESTED, ALTERNATE_SLOT_PROPOSED, PATIENT_ACCEPTED, CONFIRMED | CANCELLED | patient (own), clinician, scheduler | no |
| `complete` | CONFIRMED | COMPLETED | clinician | no |
| `mark_no_show` | CONFIRMED | NO_SHOW | clinician, scheduler | no |

Terminal: COMPLETED, DECLINED, EXPIRED, CANCELLED, NO_SHOW. Following the
source (Architecture §5.3), an appointment is confirmed only by a doctor or
scheduler action; a patient accepting an alternate slot moves it to
PATIENT_ACCEPTED, not CONFIRMED. Appointment FHIR projection is asynchronous
and does not block state (shown via `fhir_sync_status`).

Slots (separate entity): `AVAILABLE`, `HELD`, `BOOKED`, `BLOCKED`.
- `request` holds the requested slot (`HELD`).
- `propose_alternate` releases the original slot to `AVAILABLE`, holds the
  alternate slot, and sets `appointment.slot` to the alternate (the original
  is kept as `original_slot`). The alternate slot is therefore protected by
  the same uniqueness constraint (BACKEND §6.3).
- `accept` → slot `BOOKED`. Any terminal state except COMPLETED and NO_SHOW
  → slot `AVAILABLE`.

### 5.2 Referral

```text
DRAFT → AWAITING_PATIENT_CONSENT → READY_FOR_SENDER_APPROVAL → APPROVED_BY_SENDER
      → SENT → ACKNOWLEDGED_BY_RECEIVER → IN_PROGRESS → OUTCOME_RECORDED
      → OUTCOME_RETURNED → CLOSED
side states: ESCALATED, DECLINED, CANCELLED, EXPIRED, FAILED_TO_SYNC
```

| Action | From | To | Actor | FHIR |
|---|---|---|---|---|
| `request_consent` | DRAFT | AWAITING_PATIENT_CONSENT | sending clinician | no |
| `use_existing_consent` | DRAFT | READY_FOR_SENDER_APPROVAL | sending clinician (allowed only if an active consent covers recipient, categories and current `content_hash`) | no |
| `consent_granted` | AWAITING_PATIENT_CONSENT | READY_FOR_SENDER_APPROVAL | system (patient granted) | no |
| `consent_refused` | AWAITING_PATIENT_CONSENT | DRAFT | system (patient refused; sender notified) | no |
| `reopen_draft` | AWAITING_PATIENT_CONSENT, READY_FOR_SENDER_APPROVAL, APPROVED_BY_SENDER | DRAFT | sending clinician (pending consent request becomes `superseded`) | no |
| `consent_revoked` | READY_FOR_SENDER_APPROVAL, APPROVED_BY_SENDER | DRAFT | system (patient revoked) | no |
| `approve` | READY_FOR_SENDER_APPROVAL | APPROVED_BY_SENDER | sending clinician | no |
| `send` | APPROVED_BY_SENDER | SENT | sending clinician | yes |
| `acknowledge` | SENT, ESCALATED | ACKNOWLEDGED_BY_RECEIVER | receiving clinician or coordinator | no |
| `decline` | SENT, ESCALATED | DECLINED | receiving clinician or coordinator (reason required) | no |
| `start` | ACKNOWLEDGED_BY_RECEIVER | IN_PROGRESS | receiving clinician | no |
| `record_outcome` | IN_PROGRESS | OUTCOME_RECORDED | receiving clinician | yes |
| `return_outcome` | OUTCOME_RECORDED | OUTCOME_RETURNED | system (immediately after `record_outcome` commits; notifies sender) | no |
| `close` | OUTCOME_RETURNED | CLOSED | sending clinician, or system after policy period | no |
| `close_with_exception` | DRAFT, AWAITING_PATIENT_CONSENT, READY_FOR_SENDER_APPROVAL, APPROVED_BY_SENDER, SENT, ESCALATED, ACKNOWLEDGED_BY_RECEIVER, IN_PROGRESS, OUTCOME_RECORDED, FAILED_TO_SYNC | CLOSED | sending or receiving clinician (documented reason required) | no |
| `cancel` | DRAFT, AWAITING_PATIENT_CONSENT, READY_FOR_SENDER_APPROVAL, APPROVED_BY_SENDER | CANCELLED | sending clinician | no |
| `expire` | AWAITING_PATIENT_CONSENT | EXPIRED | system (policy Q-07; disabled until set) | no |
| `escalate` | SENT | ESCALATED | system (only when `urgency=emergency`; threshold per facility, Q-06) | no |
| `sync_failed` | APPROVED_BY_SENDER, IN_PROGRESS | FAILED_TO_SYNC | system (FHIR retry budget exhausted) | no |
| `retry_sync` | FAILED_TO_SYNC | value of `pending_action`'s target | sending clinician (for `send`), receiving clinician (for `record_outcome`), or system | yes |

Terminal: CLOSED, DECLINED, CANCELLED, EXPIRED.

Rules:
- Content is editable (`PATCH`) only in DRAFT. To change content later, the
  sender uses `reopen_draft`. A consent covers a specific `content_hash`, so
  any content change requires a new consent decision.
- Revocation after SENT does not change state; it removes the receiver's
  access to shared record content (SECURITY §4.4), keeps the minimum dataset
  of emergency referrals visible (D-13), and notifies both facilities.
- Non-emergency referrals left unacknowledged get reminders (notifications),
  not a state change.

Emergency referrals are created by `POST /referrals/emergency` directly in
SENT with `emergency_mode=true`, skipping consent and approval. Their
receivers can always read the five-field minimum dataset (D-13). Access to
the rest of the patient's record still requires a consent or the emergency
consent exception, which waits on Q-07; until then `consent_state` is
`emergency_exception_pending_policy`.

### 5.3 Triage session

| Action | From | To | Actor |
|---|---|---|---|
| `create` | (new) | CREATED | patient (triage-use consent required, §7) |
| `connect` | CREATED | ACTIVE | system (voice connected or first text turn) |
| `pause` | ACTIVE | PAUSED | patient, or system on disconnect / tab hidden |
| `resume` | PAUSED | ACTIVE | patient |
| `red_flag` | ACTIVE, PAUSED | EMERGENCY_PATHWAY | system (rule engine hit) |
| `finish_questions` | ACTIVE | SUMMARY_PENDING_REVIEW | system (question flow complete) or patient ("I'm done") |
| `confirm_summary` | SUMMARY_PENDING_REVIEW | CONFIRMED_BY_PATIENT | patient |
| `end` | CREATED, ACTIVE, PAUSED, SUMMARY_PENDING_REVIEW | ENDED_BY_PATIENT | patient |
| `abandon` | CREATED, ACTIVE, PAUSED, SUMMARY_PENDING_REVIEW | ABANDONED | system (inactivity timeout, BACKEND §7.2) |

Terminal: EMERGENCY_PATHWAY, CONFIRMED_BY_PATIENT, ENDED_BY_PATIENT,
ABANDONED. `mode` is `voice` or `text`; it may change mid-session without a
new session.

### 5.4 Document extraction

| Action | From | To | Actor |
|---|---|---|---|
| `upload` | (new) | UPLOADED | uploader |
| `queue_ocr` | UPLOADED | OCR_QUEUED | system (after virus scan passes) |
| `start_ocr` | OCR_QUEUED | OCR_RUNNING | system |
| `ocr_succeeded` | OCR_RUNNING | EXTRACTED_UNVERIFIED | system |
| `ocr_failed` | OCR_RUNNING | OCR_FAILED | system |
| `retry_ocr` | OCR_FAILED | OCR_QUEUED | clinician or system |
| `verify` | EXTRACTED_UNVERIFIED | VERIFIED | clinician (FHIR: yes) |
| `reject` | EXTRACTED_UNVERIFIED | REJECTED | clinician |
| `quarantine` | UPLOADED | QUARANTINED | system (virus scan failed; file not viewable) |

The original file is immutable in every state.

### 5.5 Emergency queue item (client-side, offline)

```text
QUEUED_LOCAL → SYNCING → SYNCED (local copy cleared)
                  ├─▶ CONFLICT (server already has this idempotency key with different content)
                  └─▶ FAILED (retryable; shown to staff)
```

### 5.6 Consent and consent request

- `ConsentRequest`: `PENDING` → `GRANTED` | `REFUSED` | `EXPIRED` |
  `SUPERSEDED` (referral reopened). All except PENDING are terminal.
- `Consent` (created when a request is granted): `ACTIVE` → `REVOKED` |
  `EXPIRED`. A consent is specific: patient + recipient (practitioner and/or
  facility) + purpose + data categories + `content_hash` + policy version +
  optional expiry.

### 5.7 FHIR sync status (per projected record)

`NOT_REQUIRED` | `PENDING` | `SYNCED` | `FAILED`. Exposed on every API object
that has a FHIR projection, as `fhir_sync_status`.

### 5.8 Transitions that require FHIR (INV-12)

For actions marked **FHIR: yes**, the object stays in its current state
with `pending_action` set and `fhir_sync_status=PENDING` until the FHIR write
succeeds; only then is the target state applied. While `pending_action` is
set, any other action returns `423 sync_pending`. If retries are exhausted,
`sync_failed` moves the object to FAILED_TO_SYNC (referrals) or leaves it in
place with `fhir_sync_status=FAILED` (documents), and the actor is notified.
A receiver therefore never sees a referral before its FHIR write succeeded.

### 5.9 Emergency department visit (EDVisit)

```text
ARRIVED → TRIAGED → UNDER_CARE → {ADMITTED, DISCHARGED, TRANSFERRED, LEFT, DIED}
```

| Action | From | To | Actor | FHIR |
|---|---|---|---|---|
| `triage` | ARRIVED | TRIAGED | clinician or triage staff (`ed.manage`) | no |
| `start_care` | ARRIVED, TRIAGED | UNDER_CARE | clinician or staff (`ed.manage`) | no |
| `admit` | TRIAGED, UNDER_CARE | ADMITTED | clinician (`ed.manage`) | no |
| `discharge` | UNDER_CARE | DISCHARGED | clinician (`ed.manage`) | no |
| `transfer` | ARRIVED, TRIAGED, UNDER_CARE | TRANSFERRED | clinician or staff (`ed.manage`) | no |
| `mark_left` | ARRIVED, TRIAGED, UNDER_CARE | LEFT | clinician or staff (`ed.manage`) | no |
| `mark_died` | ARRIVED, TRIAGED, UNDER_CARE | DIED | clinician (`ed.manage`) | no |

Terminal: ADMITTED, DISCHARGED, TRANSFERRED, LEFT, DIED.

Rules:
- Emergency care is never blocked (INV-16). If the patient is unidentified, an unverified emergency patient record is created immediately; duplicate linking occurs later via `identity.DuplicateCandidate`.
- Arrival can capture vital signs and observations directly, automatically creating an underlying `records.Encounter` (`type=emergency`) and `records.ClinicalObservation` rows.
- Discharge can attach an AI-drafted clinical discharge summary via `DraftBlock`, which must be approved and edited by a clinician before discharge commits.

---

## 6. API contract (v1)

Owner of this section: lead developer. The OpenAPI schema generated from the
backend must match it. Paths are relative to `/api/v1`.

### 6.1 Conventions

| Topic | Contract |
|---|---|
| Transport | HTTPS only. Same origin as the web app via the reverse proxy (`/api/*` → Django). |
| Auth | Django session cookie (`HttpOnly`, `Secure`, `SameSite=Lax`) + CSRF token header `X-CSRFToken` on unsafe methods. No tokens in `localStorage`. |
| Content | JSON, UTF-8. Bangla text stored and returned as Unicode, never transliterated by the server. |
| IDs | UUIDv4 strings for all public IDs. Database integer keys are never exposed. |
| Time | ISO 8601 with offset. Server stores UTC. UI displays `Asia/Dhaka`. |
| Idempotency | Every `POST` that creates something or performs a transition requires header `Idempotency-Key: <uuid>`. Same key + same body → same response. Same key + different body → `409 idempotency_conflict`. |
| Concurrency | State-changing requests on an existing object send `If-Match: <version>`; mismatch → `412 stale_version`. |
| Pagination | Cursor based: `?cursor=&limit=` (max 100). Response `{ "results": [...], "next_cursor": "..." | null }`. |
| Language | `Accept-Language: bn` or `en`. Affects server-generated messages only. |
| Actions | Every object with a state machine returns `state` and `allowed_actions: string[]` computed for the current user. |

### 6.2 Error envelope

```json
{
  "error": {
    "code": "transition_not_allowed",
    "message": "Human-readable message in the request language",
    "field_errors": { "reason": ["This field is required."] },
    "request_id": "uuid"
  }
}
```

| HTTP | `code` values |
|---|---|
| 400 | `validation_error` |
| 401 | `not_authenticated`, `mfa_required` |
| 403 | `permission_denied`, `consent_required`, `csrf_failed` |
| 404 | `not_found` (also returned when the user lacks access, so existence is not leaked) |
| 409 | `transition_not_allowed`, `slot_unavailable`, `idempotency_conflict`, `duplicate_candidate` |
| 412 | `stale_version` |
| 423 | `sync_pending` |
| 429 | `rate_limited` |
| 502/503 | `fhir_unavailable`, `provider_unavailable` |

### 6.3 Endpoints

| Group | Method + path | Purpose |
|---|---|---|
| auth | `POST /auth/login` | Password login with email or username (every non-admin role); may return `mfa_required`. Admin accounts are refused here |
| auth | `POST /auth/mfa/verify` | Complete MFA |
| auth | `POST /auth/register` | Patient self-registration with email or username and a password; signs the patient in |
| auth | `POST /auth/logout` | End session |
| auth | `GET /auth/me` | Current user, roles, active facility, permissions |
| auth | `POST /auth/active-facility` | Switch facility scope |
| patients | `POST /patients`, `GET /patients?q=` | Create patient record (staff), search within scope |
| patients | `GET /patients/{id}` | Demographics + identifiers |
| patients | `GET /patients/{id}/duplicate-candidates`, `POST /patients/{id}/duplicate-candidates/{cid}/resolve` | Human duplicate resolution |
| directory | `GET /directory/areas` | Division / district / upazila list |
| directory | `GET /directory/specialties` | Specialty list |
| directory | `GET /directory/practitioners?area=&specialty=&facility=&available_from=` | Doctor discovery |
| directory | `GET /directory/facilities?area=&service=` | Facility discovery, includes dated capacity |
| scheduling | `GET /practitioners/{id}/slots?from=&to=&facility=` | Available slots |
| scheduling | `POST /appointments` | Patient requests a slot (+ optional `triage_session_id`) |
| scheduling | `GET /appointments?state=&role_view=` | Patient's own, or clinician/facility queue |
| scheduling | `GET /appointments/{id}` | Detail + history + `allowed_actions` |
| scheduling | `POST /appointments/{id}/actions/{action}` | Any §5.1 transition; body carries `reason`, `alternate_slot_id` as required |
| triage | `POST /triage/sessions` | Create session (`language`, `mode`, `triage_disclosure_version`); rejected with `consent_required` unless the patient accepted the current triage disclosure |
| triage | `POST /triage/sessions/{id}/voice-credentials` | Short-lived provider credentials |
| triage | `POST /triage/sessions/{id}/turns` | Text-mode turn (voice turns arrive via provider adapter) |
| triage | `GET /triage/sessions/{id}` | State, turns, summary draft |
| triage | `POST /triage/sessions/{id}/finish` | Patient is done answering; moves the session to summary review (`finish_questions`) |
| triage | `POST /triage/sessions/{id}/summary/confirm` | Patient confirms (optionally edits) summary |
| triage | `POST /triage/sessions/{id}/end` | Patient ends session |
| triage | `POST /triage/provider-events` | Server-to-server webhook from voice provider (signed) |
| records | `GET /patients/{id}/chart` | Authorized chart sections |
| records | `POST /patients/{id}/encounters`, `GET /encounters/{id}`, `PATCH /encounters/{id}` | Encounters |
| records | `POST /encounters/{id}/observations`, allergies, medications | Clinical entries |
| records | `POST /encounters/{id}/orders`, `GET /encounters/{id}/orders` | Diagnostic orders; response returns recent verified results advisory (INV-15: non-suppression) |
| documents | `POST /documents` (multipart) | Upload report (`patient_id`, optional `encounter_id`) |
| documents | `GET /documents/{id}` | Metadata + extraction state |
| documents | `POST /documents/{id}/download-link` | Short-lived signed link (audited) |
| documents | `GET /documents/{id}/extraction` | Candidate values with confidence and source location |
| documents | `POST /documents/{id}/extraction/verify` | Clinician-corrected values → verified Observations |
| documents | `POST /documents/{id}/extraction/reject` | Discard extraction |
| documents | `GET /patients/{id}/results?test=&group_by=` | Prior results timeline grouped by test with date, lab, verified status (INV-15) |
| referrals | `POST /referrals` | Create draft (`patient_id`, `encounter_id`, destination, urgency) |
| referrals | `POST /referrals/{id}/generate-draft` | Queue AI summary draft |
| referrals | `PATCH /referrals/{id}` | Edit draft content (DRAFT only; use `reopen_draft` action first otherwise) |
| referrals | `GET /referrals?direction=incoming|outgoing&state=` | Queues |
| referrals | `GET /referrals/{id}` | Detail, history, `allowed_actions`, `fhir_sync_status` |
| referrals | `POST /referrals/{id}/actions/{action}` | Any §5.2 user transition |
| referrals | `POST /referrals/emergency` | Five-field emergency referral (idempotent, offline-safe) |
| referrals | `GET /referrals/by-reference/{code}` | Lookup by `reference_code` or `provisional_code` from a printed slip (receiving facility only) |
| devices | `POST /devices/enroll`, `POST /devices/{id}/revoke` | Enroll / revoke a facility device for offline emergency mode. **Shape pending Q-09**; build behind `FEATURE_OFFLINE_EMERGENCY` |
| consents | `GET /consents?patient=me` | Patient's consents and pending requests |
| consents | `GET /consent-requests/{id}` | What will be shared, with whom, why |
| consents | `POST /consent-requests/{id}/grant`, `POST /consent-requests/{id}/refuse` | Patient decision |
| consents | `POST /consents/{id}/revoke` | Revoke |
| notifications | `GET /notifications`, `POST /notifications/{id}/read` | In-app notifications |
| admin | `/admin/facilities/*`, `/admin/practitioners/*`, `/admin/schedules/*`, `/admin/capacity-reports/*`, `/admin/staff/*` | Facility administration |
| admin | `GET /admin/permissions` | The permission catalogue (D-16) |
| admin | `POST /admin/staff` | Create a staff account and membership. Returns a one-time temporary password and TOTP setup URI |
| admin | `PATCH /admin/staff/{id}` | Change role or permissions of a membership |
| admin | `POST /admin/staff/{id}/deactivate`, `…/reactivate`, `…/reset-password`, `…/reset-mfa`, `…/revoke-sessions` | Access control actions. Secrets are returned once |
| ed | `POST /ed-visits` | Record emergency department arrival / intake |
| ed | `GET /ed-visits?state=` | List facility ED visits filterable by state |
| ed | `GET /ed-visits/{id}` | Single ED visit details, observations and handover |
| ed | `POST /ed-visits/{id}/actions/{action}` | ED state machine transition (§5.9) |
| onboarding | `POST /access-requests` | Public clinician registration / private chamber access request (D-19) |
| onboarding | `GET /admin/access-requests` | Admin review list for access requests |
| onboarding | `POST /admin/access-requests/{id}/approve` | Approve request (creates chamber facility + doctor account) |
| onboarding | `POST /admin/access-requests/{id}/reject` | Reject request with documented reason |
| auth | `POST /auth/admin/login` | Admin password login, then `POST /auth/mfa/verify`. Non-admin accounts get the same error as bad credentials |
| audit | `GET /audit/events?patient=&actor=` | Scoped audit metadata |
| fhir | `/integrations/fhir/*` | Controlled FHIR boundary for approved external systems |

### 6.4 Real-time events

WebSocket at `/ws/events` (same session cookie). Server → client messages:

```json
{ "type": "referral.state_changed", "id": "uuid", "state": "SENT", "version": 7 }
```

| Event type | Sent to |
|---|---|
| `appointment.state_changed` | Patient and facility queue members |
| `referral.state_changed` | Sender, receiving facility members |
| `referral.escalated` | Receiving facility, sender |
| `document.extraction_ready` | Uploading user, patient's treating clinicians |
| `referral.draft_ready` | Requesting clinician |
| `triage.turn` | The patient's own session only |
| `triage.emergency` | The patient's own session only |
| `notification.created` | Recipient |

Events carry IDs and states only, never clinical content. The client
refetches the object over REST. The WebSocket is an optimization; every screen
must also work by refetch on focus and on a polling interval.

---

## 7. Shared data shapes

Field names are `snake_case` on the wire. These are the minimum shapes both
ends rely on; the OpenAPI schema is authoritative for full detail.

```text
Common fields on every stateful object:
  id, state, allowed_actions[], version, created_at, updated_at, fhir_sync_status

Pending fields on objects with FHIR-gated actions (§5.8):
  pending_action? (action name), pending_since?

Appointment:  patient, practitioner, facility, slot{id,start,end}, original_slot?{id,start,end},
              triage_session_id?, decline_reason?, expires_at, history[]
Referral:     patient, encounter, sender{practitioner,facility}, receiver{facility,practitioner?},
              urgency: routine|urgent|emergency, emergency_mode: bool, reason,
              summary{sections[], source_refs[]}, content_hash,
              consent_state: not_requested|pending|active|refused|revoked|emergency_exception_pending_policy,
              reference_code, provisional_code?, outcome?, decline_reason?, history[]
EmergencyReferral (POST /referrals/emergency body; minimum dataset, INV-16):
              identity{patient_id? | unverified_description}, reason,
              urgency: emergency|urgent (both create emergency_mode=true referrals that escalate),
              vitals{recorded_at, items[{code, value, unit}]}, treatment_given,
              idempotency_key, created_at_device, facility_id, provisional_code?
              (provisional_code format is set with the slip format, Q-09)
TriageSession: language: bn|en, mode: voice|text, state, turns[{role, text, lang, at}],
              triage_consent{disclosure_version, accepted_at} (wording per Q-07),
              summary{patient_words, structured_fields, guidance_given[], source_passage_ids[]},
              ruleset_version, kb_version, model_version
Document:     patient, encounter?, filename, content_type, size, sha256, state,
              extraction{fields[{name, value, unit, date, lab, confidence, page, bbox}]}
ConsentRequest: referral, recipient{practitioner?, facility}, purpose, categories[],
              content_hash, state (§5.6), created_at
Consent:      patient, recipient{practitioner?, facility}, purpose, categories[],
              content_hash, policy_version, granted_at, method, expires_at?, state
HistoryEntry: action, from_state, to_state, actor{id,name,role}, at, reason?
```

Status labels shown to users come from i18n keys `state.<entity>.<STATE>`
(FRONTEND §7); the backend never sends display strings for states.

---

## 8. Settled decisions and open questions

### 8.1 Settled technology decisions

| ID | Decision | Source |
|---|---|---|
| D-01 | Modular monolith: one Django codebase, separate API and worker processes | Architecture §1.2 |
| D-02 | Next.js + TypeScript web app; patient, clinician and admin areas are route groups in one app | Architecture §2.2, §3.1 |
| D-03 | Django + DRF API, ASGI deployment | Architecture §3.1 |
| D-04 | PostgreSQL for application data; HAPI FHIR R4 as separate service, canonical for clinical exchange resources | Architecture §4.1 |
| D-05 | Celery + Redis for background work, outbox pattern for post-commit delivery | Architecture §3.1, §4.2 |
| D-06 | Private S3-compatible object storage (MinIO) for originals | Architecture §3.1 |
| D-07 | pgvector for approved-source retrieval | Architecture §3.1 |
| D-08 | Voice vendor behind a provider adapter; triage orchestrator stays in the backend | Architecture §5.1 |
| D-09 | Container deployment in a Bangladesh-based data center; Kubernetes not required | Architecture §9.1 |
| D-10 | Request-and-approve appointment policy (assumed) | Architecture §12.4 |
| D-11 | Session cookies + CSRF, same origin through the reverse proxy | Architecture §7.1, this file §6.1 |
| D-12 | OpenAPI schema generated by backend, TS types generated by frontend | This file §1.3 |
| D-13 | The receiving facility of an emergency referral can always read its five-field minimum dataset, without consent. Rationale: the same data travels with the patient on the printed slip, and INV-16 forbids blocking transfer. Full-record access still needs consent or the Q-07 exception. **To be confirmed by clinical/legal review under Q-07.** | Architecture §5.6, §7.2 |
| D-14 | Styling is Tailwind CSS v4 with shadcn/ui components, both generated from `tokens.json`; the default Tailwind palette is removed so classes cannot bypass tokens. Supersedes the CSS Modules choice in FRONTEND §2 | docs/redesign/UI_COMPONENT_LIBRARY_STRATEGY.md |
| D-15 | Visual identity is "Handover" (handover tracker, Bengal indigo on warm paper, Tiro Bangla + Hind Siliguri). Supersedes the "route" identity in UIUX_DESIGN §3–§5 | docs/redesign/DESIGN_SYSTEM.md |
| D-16 | Permission catalogue and grant rules. Membership permissions are drawn only from `schedule.manage`, `referral.acknowledge`, `referral.create`, `emergency.create` (served by `GET /admin/permissions`). A `facility_admin` may create and change `clinician` and `facility_staff` memberships in their own facility only. Only a `platform_admin` may create or change a `facility_admin`, and may act in any facility. A `platform_admin` is created only by the `create_platform_admin` management command. Nobody may change or deactivate their own account here, or deactivate the last platform admin. Every change is audited | docs/redesign/AUTH_RBAC_ARCHITECTURE.md §2 |
| D-17 | Admin accounts sign in only at a separate, unlinked URL (`/{locale}/admin/login`, backed by `POST /auth/admin/login`), with TOTP MFA mandatory. `POST /auth/login` refuses any account that holds an admin role, with the same neutral error as a wrong password. Sessions for staff and admins expire after 15 idle minutes. Answers Q-13 for admin accounts only; the MFA method for clinicians stays open. A hidden URL is not a security control: the server-side role check, MFA and rate limits are | docs/SECURITY.md §3 |
| D-18 | No one-time codes anywhere. Every user signs in with an email or username and a password (minimum 12 characters, common-password check). Patients register themselves at `POST /auth/register`; staff accounts are created by admins (D-16). Phone is a contact detail, not a sign-in identifier. Supersedes the patient phone-OTP design in SECURITY §3.1 | Product owner, 2026-11-23 |
| D-19 | Private chamber onboarding. A solo doctor applies via `POST /access-requests` with BMDC registration number, facility name and contacts (answers Q-16). Upon platform admin approval, a `Facility` of type `private_chamber` is created, and the doctor is granted `facility_admin` + `clinician` memberships and linked `Practitioner`. The doctor switches between patient care and chamber admin via the area switcher. | Product plan Phase B, 2026-11-23 |
| D-20 | Patient identity baseline. Primary patient identifier is phone number (and optional National ID / NID where available). Cross-facility record continuity relies on exact and fuzzy matching producing `DuplicateCandidate` records in `apps/identity`, which clinicians and staff confirm before merging records. National Health ID integration remains gated under Q-10. | Product plan Phase A, 2026-11-23 |

### 8.2 Open questions — do not assume answers

| ID | Question | Blocks | Owner |
|---|---|---|---|
| Q-01 | Exact Bangladesh Core IG package version, canonical URLs, terminology | FHIR profiles, validation | Lead dev + authority |
| Q-02 | Patient identity matching and Health ID approach | Identity linking | Lead dev + authority |
| Q-03 | Account required before triage, or guest session then link? | Triage entry flow | Product + clinician |
| Q-04 | Appointment request expiry duration | `expire` job, patient copy | Pilot facilities |
| Q-05 | Voice provider, processing location, retention, approval | Voice adapter implementation | Researcher + compliance |
| Q-06 | Red-flag rules, escalation thresholds, emergency instructions and numbers | Triage, escalation job | Clinical reviewers |
| Q-07 | Consent wording, emergency exceptions, retention, revocation, break-glass policy | Consent, break-glass, retention jobs | Clinical + legal |
| Q-08 | Capacity data owner and update frequency | Staleness threshold | Pilot facilities |
| Q-09 | Offline device model, local storage protection, slip format | Emergency offline mode | Pilot facilities + security |
| Q-10 | National Health ID / SHR access and specs | Integration adapter | Authority |
| Q-11 | Can patients upload their own reports in the pilot? | Patient upload UI | Product + clinician |
| Q-12 | LLM model choice and hosting for drafting and triage responses | AI adapter | Researcher |
| Q-13 | MFA method for clinicians (TOTP app vs SMS OTP) | Auth | Security + facilities |
| Q-14 | Staff password reset: self-service, or only by a facility admin? (proposed) | `/login/staff/reset` (flag `PASSWORD_RESET`) | Security + facilities |
| Q-15 | Patient profile fields beyond name, email or username and password (proposed) | `/welcome` (flag `PATIENT_PROFILE`) | Product + lead dev |
| Q-16 | Clinician access request and approval workflow, and whether a requester can see status without an account (proposed) | Answered by D-19 | Product + facilities |
| Q-17 | Whether and how email is verified, and who triggers it (proposed) | `/verify-email` (flag `EMAIL_VERIFICATION`) | Product + security |
| Q-18 | Hospital emergency department intake minimum dataset sign-off. Vitals/triage fields beyond the 5-field baseline (`patient_name`, `age_or_dob`, `gender`, `chief_complaint`, `triage_priority`) require formal clinical sign-off. | `apps/emergency_dept`, ED intake board | Emergency clinical reviewer |
| Q-19 | Research database access and secondary data use. Anonymised clinical dataset exports for health research require Bangladesh Medical Research Council (BMRC) ethics clearance and patient secondary-use consent. | Post-pilot research layer | BMRC + legal |

When a question is answered, move it to §8.1 with its source and update the
blocked documents in the same change.

### 8.3 Known contract gaps (found by the UI redesign audit)

Not decisions. Each needs an answer from the lead developer; until then the
frontend shows the stated fallback. Detail:
[docs/redesign/APPLICATION_DESIGN_ARCHITECTURE.md](docs/redesign/APPLICATION_DESIGN_ARCHITECTURE.md) §1.2 and
[docs/redesign/PRODUCT_UX_AUDIT.md](docs/redesign/PRODUCT_UX_AUDIT.md) §6.

| ID | Gap | Fallback in the UI |
|---|---|---|
| G-1 | No endpoint lists documents waiting for verification | "Recently ready" from events and opened charts |
| G-2 | No endpoint lists a patient's own documents | Read from the chart response, else empty state |
| G-3 | Practitioner directory has no next-available slot | Slots load per doctor on expand |
| G-4 (A-03) | `GET /auth/me` has no membership list; facility-switch response shape differs from `me` | Active facility shown as text, no switcher |
| G-5 (A-06) | `/admin/*` has list `GET`s only; schedules and staff return empty lists | Read-only tables, no create or edit controls |
| G-6 | No endpoint lists a patient's triage sessions | Resume only from the session ID in the current tab |
| G-7 (A-16) | `POST /appointments` requires `patient_id`, which patient clients cannot learn | "Request this time" fails with an error until the backend derives the patient from the session |
| A-11 | No canonical list of `Membership` permission strings | Labels keyed by the strings the backend uses today |

---

## 9. Phase map

Each phase lists which document sections carry its work. Timeline is the
project plan's baseline (16–18 weeks, ~3 developers), not a commitment.

| Phase | Weeks | Release | Backend | Frontend | UI/UX | Security | Deployment |
|---|---|---|---|---|---|---|---|
| 0 Alignment | 1 | — | §6 transition tables drafted | Route map | Tokens, wireframes | Threat model | Environment plan |
| 1 Foundation | 2–3 | R0 | §2, §11 skeleton, HAPI client | App shell, auth, type generation | Component primitives | Session/CSRF | Local + staging, CI |
| 2 Identity & directory | 4–5 | R1 | accounts, identity, organizations, directory, scheduling models | Sign-in, discovery | Discovery screens | Authz layers | — |
| 3 Appointments | 6–7 | R1 | scheduling transitions, outbox, notifications | Request flow, clinician queue | Queue + status route line | Audit of transitions | — |
| 4 Records & reports | 8–9 | R2 | records, documents, OCR queue | Chart, upload, verify view | Chart, report viewer | File upload controls | Object storage |
| 5 Referrals | 10–11 | R2 | referrals, consent, escalation | Referral workspace, consent screens | Referral detail | Consent enforcement | — |
| 6 AI drafting | 12–13 | R3 | ai module, extraction, drafting | Draft review with source links | Draft/verified styling | AI input controls | Inference service |
| 7 Voice triage | 14–15 | R3 | triage orchestrator, rules, RAG | Voice client, text fallback | Voice screen | Vendor controls | Provider egress |
| 8 Hardening | 16–17 | R4 | emergency endpoint, break-glass | Offline queue, slip print | Emergency mode | Pen test, review | Backups, restore, load |
| 9 Pilot | 18+ | — | Metrics events | Feedback hooks | Usability fixes | Incident process | Pilot ops |

First milestone: patient-to-doctor appointment request decided in the
dashboard. Second milestone: full referral handover with outcome returned.

---

## 10. Interface ledger

Record every change to §4–§7 here so both ends see it. Newest first.

| Date | Change | Backend updated | Frontend updated | By |
|---|---|---|---|---|
| 2026-11-23 | Phase D Record Continuity: `POST /encounters/{id}/orders`, `GET /encounters/{id}/orders` with recent-results advisory (INV-15: non-suppression); `GET /patients/{id}/results?group_by=test` timeline; active clinical lists (allergies, medications, problems) on chart and referral draft reconciliation; patient-held summary | yes | yes | Planning |
| 2026-11-23 | Phase C Emergency Department: `EDVisit` entity (§5.9), state transitions ARRIVED → TRIAGED → UNDER_CARE → {ADMITTED, DISCHARGED, TRANSFERRED, LEFT, DIED}; endpoints `POST /ed-visits`, `GET /ed-visits`, `GET /ed-visits/{id}`, `POST /ed-visits/{id}/actions/{action}`; permission `ed.manage` | yes | yes | Planning |
| 2026-11-23 | Phase B Private Chamber: `POST /access-requests`, `GET /admin/access-requests`, `POST /admin/access-requests/{id}/approve`, `POST /admin/access-requests/{id}/reject`; `Facility.type` gains `private_chamber` | yes | yes | Planning |
| 2026-11-23 | Product expansion decisions: D-19 (private chambers), D-20 (patient identity baseline), Q-18 (ED intake minimum dataset), Q-19 (research ethics deferral); access-request and ED visit entities initiated | yes (in progress) | yes (in progress) | Planning |
| 2026-11-23 | Admin access control: D-16, D-17; `GET /admin/permissions`, `POST /admin/staff`, `PATCH /admin/staff/{id}` and five action endpoints; `POST /auth/admin/login`; `POST /auth/register` replaces `POST /auth/otp/request` and `/auth/otp/verify` (D-18); error code `rate_limited` now returned for sign-in attempts; `me` roles ignore expired memberships | yes | yes | Planning |
| 2026-11-23 | UI redesign governance: D-14, D-15, Q-14–Q-17, §8.3 known gaps; frontend route map additions (`/home`, `/consents`, `/notifications`, `/patients`, `/referrals`, auth routes). No change to §4–§7 contracts | n/a | n/a (docs only, FRONTEND §2–§4, §10–§11) | Planning |
| 2026-11-22 | Added `POST /triage/sessions/{id}/finish` so `finish_questions` is reachable by the patient; backend implements §5.3, §5.4 and §5.8 (FHIR-gated completion, `FHIR_SYNC_MODE`); system-only actions can no longer be called by users | yes | n/a (not built) | Backend |
| 2026-11-21 | Review fixes: PATIENT_ACCEPTED appointment state; referral `reopen_draft`, `consent_refused`, `consent_revoked`, `use_existing_consent`; FHIR-gated transitions (§5.8) with `pending_action`; triage/document action tables; ConsentRequest states; `content_hash`, `emergency_mode`, `provisional_code`, triage consent; device endpoints (Q-09); D-13 | n/a (not built) | n/a (not built) | Planning |
| 2026-11-21 | Initial contract set derived from architecture and project plan | n/a (not built) | n/a (not built) | Planning |
