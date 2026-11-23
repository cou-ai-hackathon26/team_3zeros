# Medi Waypoint — Backend Plan

> **BLUF:** One Django + DRF codebase (modular monolith) serves the API over
> ASGI and runs Celery workers from the same code. PostgreSQL owns accounts,
> directory, scheduling and workflow state; HAPI FHIR owns clinical exchange
> resources. Every state change goes through one transition engine that checks
> permission, locks the row, writes audit and outbox events in the same
> transaction, and only reports success after any required FHIR write.

---

## 1. Read first

- Shared contracts live in [MASTERPLAN.md](../MASTERPLAN.md): roles (§4),
  state machines (§5), API contract (§6), data shapes (§7), decisions and
  open questions (§8). This document says **how** the backend implements them.
  If this file and MASTERPLAN disagree, MASTERPLAN wins; fix this file.
- Security requirements: [SECURITY.md](SECURITY.md). Runtime topology:
  [DEPLOYMENT.md](DEPLOYMENT.md).
- What the frontend expects from you: §16 of this file.

---

## 2. Codebase structure

```text
backend/
  pyproject.toml
  manage.py
  config/
    settings/            # base.py, local.py, staging.py, production.py
    urls.py              # mounts /api/v1/, /ws/
    asgi.py              # HTTP + WebSocket (Django Channels)
    celery.py
  apps/
    common/              # base models, UUID ids, idempotency, errors, pagination
    accounts/            # User, roles, memberships, sessions, MFA (TOTP)
    identity/            # Patient, identifiers, duplicate candidates
    organizations/       # Facility, Department, Practitioner, PractitionerRole
    directory/           # Area, Specialty, Service, CapacityReport, discovery queries
    scheduling/          # Schedule, Slot, Appointment, transitions
    triage/              # TriageSession, Turn, RuleSet, orchestrator
    records/             # Encounter, chart read models
    documents/           # Document, ExtractionJob, ExtractedField
    referrals/           # Referral, EmergencyReferral, transitions, escalation
    consent/             # Consent, ConsentRequest
    notifications/       # Notification, channel adapters (in-app, SMS, email)
    fhir/                # client, mappers, profiles, sync tasks
    ai/                  # model adapters, RAG, schemas, prompt templates
    emergency_dept/      # EDVisit, triage, intake observations, disposition transitions
    audit/               # AuditEvent (append-only), writers
    integrations/        # Health ID / SHR adapters (disabled until Q-10)
    workflow/            # transition engine, outbox (shared by stateful apps)
  workers/
    tasks.py             # task routing only; logic lives in app services
    schedules.py         # Celery beat schedule
  tests/
```

Rules:

- **Apps import downward only.** `common` and `workflow` depend on nothing in
  `apps`. Domain apps may import `common`, `workflow`, `audit`, `fhir`,
  `accounts`, `identity`, `organizations`. Domain apps do not import each
  other's models in views; they call the other app's `services.py`.
- **Thin views, fat services.** Views parse input, call one service function,
  serialize output. Services hold business rules and are what tests target.
- **No network services split** until measured need (D-01).

Each app has the same layout:

```text
apps/<name>/
  models.py  services.py  selectors.py  transitions.py (if stateful)
  serializers.py  views.py  urls.py  permissions.py  fhir_mapping.py (if projected)
  tasks.py  tests/
```

`selectors.py` holds read queries that already apply the caller's access
scope. A view must never call `Model.objects` directly.

---

## 3. Cross-cutting conventions

| Topic | Rule |
|---|---|
| Primary keys | `BigAutoField` internally, `public_id = UUIDField(unique)` exposed. URLs use `public_id`. |
| Base model | `common.models.TimeStamped` adds `created_at`, `updated_at`, `version` (integer, incremented on every save, used for `If-Match`). |
| Time | `USE_TZ=True`, store UTC, `TIME_ZONE="Asia/Dhaka"` for scheduling arithmetic only. |
| Money / units | Clinical values keep the unit as entered plus a UCUM code when known. Never convert silently. |
| Text | Store Bangla as entered (NFC-normalized). Search uses `pg_trgm` on normalized text. |
| Settings | All environment values via `django-environ`. No defaults for secrets. |
| Feature flags | Settings booleans for unfinished/approval-dependent features: `FEATURE_VOICE_TRIAGE`, `FEATURE_BREAK_GLASS`, `FEATURE_NATIONAL_ID`, `FEATURE_PATIENT_UPLOAD`. Each names its open question. |
| Logging | Structured JSON (`structlog`), `request_id` on every line, PHI redaction filter (SECURITY §7). |

---

## 4. Data model

Only the fields that drive behavior are listed. All models extend
`TimeStamped` and have `public_id`.

### 4.1 accounts

- `User` (custom, `AUTH_USER_MODEL`): `phone` (E.164, unique nullable),
  `email` (nullable), `display_name`, `preferred_language` (`bn`|`en`),
  `is_active`, `mfa_enabled`.
- `Membership`: `user`, `facility`, `role` (`clinician`|`facility_staff`|
  `facility_admin`), `permissions` (JSON list, e.g. `["schedule.manage",
  "referral.acknowledge", "emergency.create"]`), `active_from`, `active_to`.
- `PatientAccount`: `user` ↔ `identity.Patient` one-to-one link.
- `PlatformAdmin`: flag model; grants no clinical access.

### 4.2 identity

- `Patient`: `given_name`, `family_name`, `name_bn`, `birth_date` or
  `estimated_age`, `sex`, `phone`, `area`, `fhir_id`, `fhir_version`.
- `PatientIdentifier`: `patient`, `system` (`nid`, `birth_reg`, `health_id`,
  `facility_mrn`), `value`, `verified`.
- `DuplicateCandidate`: `patient_a`, `patient_b`, `score`, `reasons`,
  `status` (`open`|`same_person`|`different`), `resolved_by`, `resolved_at`.
  Merging is a separate, audited, human-triggered operation (INV-13).

### 4.3 organizations and directory

- `Facility`: `name`, `name_bn`, `type` (upazila health complex, district
  hospital, private clinic, private chamber …), `area`, `address`, `phone`, `fhir_id`.
- `Department`, `Practitioner` (`registration_number`, `name`, `name_bn`,
  `user` nullable), `PractitionerRole` (`practitioner`, `facility`,
  `specialty`, `active`).
- `AccessRequest` (MASTERPLAN D-19): `name`, `bmdc_registration_number`, `contact`,
  `facility` (optional), `chamber_name`, `chamber_name_bn`, `status` (`PENDING`, `APPROVED`, `REJECTED`),
  `rejection_reason`, `reviewed_at`, `reviewed_by`.
  - `POST /access-requests`: Public clinician access / chamber onboarding request.
  - `GET /admin/access-requests`: Admin list with optional `?status=`.
  - `POST /admin/access-requests/{id}/approve`: Approves request, auto-creates private chamber facility & practitioner account if chamber.
  - `POST /admin/access-requests/{id}/reject`: Declines request with required reason.
- `Area`: hierarchical (`division` → `district` → `upazila`) with Bangla and
  English names. Discovery filters by area, never by exact GPS.
- `Specialty`, `Service` (`facility`, `code`, `name`, `name_bn`).
- `CapacityReport`: `facility`, `service`, `reported_value`, `reported_at`,
  `reported_by`, `source`. API adds computed `is_stale` using a per-facility
  threshold (Q-08; default unset, which means always show the date only).

### 4.4 scheduling

- `Schedule`: `practitioner_role`, recurrence rules.
- `Slot`: `schedule`, `start`, `end`, `state` (`AVAILABLE`|`HELD`|`BOOKED`|
  `BLOCKED`).
- `Appointment`: `patient`, `slot` (the currently held/booked slot),
  `original_slot` (set by `propose_alternate`), `state` (MASTERPLAN §5.1),
  `triage_session` (nullable), `decline_reason`, `expires_at`, `fhir_id`,
  `fhir_sync_status`.

### 4.5 triage

- `RuleSet`: `version`, `status` (`draft`|`approved`|`retired`),
  `approved_by` (clinician names), `approved_at`, `rules` (JSON DSL, §8.3).
- `TriageSession`: `patient` (nullable if guest, Q-03), `language`, `mode`,
  `triage_disclosure_version`, `triage_disclosure_accepted_at` (required to
  create; wording per Q-07),
  `state` (§5.3), `ruleset_version`, `kb_version`, `model_version`,
  `provider`, `provider_session_ref` (random, no PII), `started_at`,
  `ended_at`.
- `Turn`: `session`, `role` (`patient`|`assistant`|`system`), `text`,
  `language_detected`, `asr_confidence`, `red_flag_hits` (JSON),
  `passage_ids` (array), `response_policy` (`grounded`|`declined`|
  `emergency`|`question`), `at`.
- `TriageSummary`: `session`, `patient_words`, `structured_fields` (JSON
  schema), `guidance_given`, `patient_confirmed_at`, `patient_edits`.

### 4.6 records

- `Encounter`: `patient`, `facility`, `practitioner`, `period`, `type`,
  `fhir_id`, `fhir_version`, `fhir_sync_status`. Clinical entries
  (Observation, Condition, AllergyIntolerance, MedicationStatement) are
  written to HAPI as canonical; PostgreSQL keeps only an index row
  `FhirIndex(resource_type, fhir_id, version, patient, encounter)` for
  listing and permission filtering.
- `ClinicalObservation`: local index and cache for clinical measurements and vital signs.
- `ClinicalOrder`: `encounter`, `patient`, `test_name`, `code`, `notes`, `priority`,
  `status`, `ordered_by`. Diagnostic test orders placed by clinicians; response returns
  recent verified results advisory (INV-15: non-suppression). Endpoint `POST /encounters/{id}/orders`.

### 4.7 documents

- `Document`: `patient`, `encounter` (nullable), `uploaded_by`,
  `storage_key` (random UUID path, never the filename), `original_filename`,
  `content_type`, `size`, `sha256`, `state` (§5.4), `fhir_document_reference_id`.
- `ExtractionJob`: `document`, `engine`, `engine_version`, `started_at`,
  `finished_at`, `error`.
- `ExtractedField`: `job`, `name`, `value`, `unit`, `observed_date`, `lab`,
  `confidence`, `page`, `bbox`, `status` (`candidate`|`corrected`|
  `accepted`|`rejected`), `verified_by`, `verified_at`.

### 4.8 referrals and consent

- `Referral`: `patient`, `encounter`, `sender_practitioner`, `sender_facility`,
  `receiver_facility`, `receiver_practitioner` (nullable), `urgency`,
  `emergency_mode`, `reason`, `state` (§5.2), `pending_action`,
  `pending_since`, `summary` (JSON validated by schema §10.3), `content_hash`
  (SHA-256 of canonicalized summary + included record references),
  `summary_origin` (`manual`|`ai_draft_edited`), `consent` (nullable FK),
  `reference_code` (unique, 8 chars, Crockford base32), `provisional_code`
  (nullable, unique per facility), `outcome` (JSON),
  `decline_reason`, `sent_at`, `acknowledged_at`, `escalated_at`,
  `fhir_service_request_id`, `fhir_task_id`, `fhir_sync_status`.
- `ReferralDraftVersion`: every AI draft and every saved edit, so draft vs
  final is traceable (Project Plan Phase 6).
- `EmergencyReferral`: one-to-one extension of `Referral` holding the five
  minimum fields, `idempotency_key` (unique), `created_at_device`,
  `unverified_identity_description`.
- `ConsentRequest`: `referral`, `patient`, `recipient_facility`,
  `recipient_practitioner`, `purpose`, `categories`, `content_hash` (hash of
  the referral content it covers), `state` (MASTERPLAN §5.6).
- `Consent`: fields per MASTERPLAN §7 (including `content_hash` copied from
  the granted request) plus `method` (`web_app`|
  `assisted_web_app`), `verification_context`, `revoked_at`, `fhir_id`.

### 4.9 workflow, audit, notifications

- `OutboxEvent`: `id`, `aggregate_type`, `aggregate_id`, `event_type`,
  `payload` (IDs only), `created_at`, `dispatched_at`, `attempts`,
  `last_error`.
- `IdempotencyRecord`: `key`, `user`, `endpoint`, `request_hash`,
  `response_status`, `response_body`, `created_at` (TTL 7 days; emergency
  referrals: 90 days to cover long offline periods).
- `AuditEvent`: append-only (§12).
- `Notification`: `recipient`, `type`, `object_ref`, `channel`, `state`,
  `sent_at`, `read_at`. Templates per language. SMS body contains no clinical
  details (SECURITY §7).

### 4.12 emergency_dept

- `EDVisit`: `facility`, `patient`, `encounter`, `state` (MASTERPLAN §5.9:
  `ARRIVED → TRIAGED → UNDER_CARE → {ADMITTED, DISCHARGED, TRANSFERRED, LEFT, DIED}`),
  `triage_category` (`RED`, `ORANGE`, `YELLOW`, `GREEN`, `BLUE`), `chief_complaint`,
  `arrival_mode`, `arrived_at`, `triaged_at`, `triaged_by`, `disposition_at`,
  `disposition_notes`, `discharge_summary`, `transfer_facility`, `transfer_referral`.
- Permissions: Governed by `ed.manage` catalogue permission.
- Unidentified emergency arrivals create an emergency unverified patient immediately without blocking care (INV-16).
- Vitals and clinical observations are recorded as `records.ClinicalObservation` on the linked emergency `Encounter`.

---

## 5. Persistence and FHIR ownership

Ownership follows the architecture's table (Architecture §4.1). Implementation:

1. **Domain write first, FHIR second, success last.** A service performs the
   domain change in a PostgreSQL transaction with `fhir_sync_status=PENDING`
   and an outbox event `fhir.sync_requested`. A worker calls HAPI and sets
   `SYNCED` or `FAILED`.
2. **FHIR-gated transitions** are exactly those marked **FHIR: yes** in
   MASTERPLAN §5 (`send`, `record_outcome`, `retry_sync`, document `verify`).
   The service sets `pending_action` and `fhir_sync_status=PENDING` without
   changing `state`, commits, then attempts the FHIR write inline with a
   5-second timeout. On success it applies the target state in a second
   transaction and returns `200` with the final state. On failure or timeout
   it returns `202` with the unchanged state and `pending_action`; the worker
   retries (exponential backoff, 6 attempts, ~30 minutes), applies the target
   state on success, or runs `sync_failed` and notifies the actor. Any other
   action while `pending_action` is set returns `423 sync_pending`.
   Appointment and directory projections are not gated: their state changes
   immediately and FHIR sync is reported through `fhir_sync_status` only.
   Emergency referral creation is also not gated (INV-16, §13).
3. **Transaction bundles.** Related resources (e.g. ServiceRequest + Task +
   Provenance) go in one FHIR `transaction` Bundle. The bundle uses
   conditional create on an identifier derived from our `public_id`, so a
   retry cannot create a duplicate.
4. **Index, don't copy.** We store `fhir_id` and `fhir_version`. Chart reads
   query HAPI by patient through `fhir.client`, scoped by our permission
   check first.
5. **Profiles.** `fhir/profiles/` holds the Bangladesh Core package once
   Q-01 is answered. Until then, validate against base R4 and log
   `profile_pending=Q-01`. HAPI runs with validation enabled on write.
6. **Mappers.** One function per resource in each app's `fhir_mapping.py`,
   pure (model in, dict out), unit-tested against stored synthetic fixtures in
   `tests/fhir_fixtures/`.

FHIR resource mapping: Architecture §4.3 (unchanged).

Implementation notes (as built):

- `apps/fhir/sync.py` holds `complete_fhir_transition(obj)`. It builds the
  transaction bundle (ServiceRequest + Task for referrals, DiagnosticReport +
  Observations for documents, each with a conditional-create identifier),
  writes it, then calls the engine's `finalize_fhir_transition`. Bundles use
  base R4 until Q-01 is answered and are not yet validated against a live HAPI.
- `FHIR_SYNC_MODE` is `live` (default) or `stub`. `stub` skips the write and is
  set only in `config.settings.local` so tests and local development can run
  without HAPI. Staging and production must stay `live`.
- System-only actions (`workflow.engine.is_system`) pass their permission check
  only when called with no actor. The consent service, workers and the OCR
  pipeline call them that way; the generic action endpoints always pass the
  signed-in user, so users cannot trigger them.
- A referral points at its current `ConsentRequest` (`consent_request`); the
  granted `Consent` is stored on `consent`. `approve` and `send` require an
  active consent whose `content_hash` matches the referral.

---

## 6. State-machine engine

Lives in `apps/workflow`. Used by scheduling, referrals, triage, documents.

### 6.1 Transition table

Each stateful app declares its table in `transitions.py`, mirroring
MASTERPLAN §5 exactly:

```python
REFERRAL_TRANSITIONS = {
    "approve": Transition(
        source={"READY_FOR_SENDER_APPROVAL"},
        target="APPROVED_BY_SENDER",
        permission=is_sender_clinician,
        requires=["summary_valid", "consent_active"],
        fhir_required=False,
    ),
    "send": Transition(
        source={"APPROVED_BY_SENDER"},
        target="SENT",
        permission=is_sender_clinician,
        fhir_required=True,
        on_fhir_failure="FAILED_TO_SYNC",
    ),
    # ...
}
```

A test (`test_transition_tables_match_masterplan`) parses the tables in
MASTERPLAN §5 and fails if any transition, source or target differs.

### 6.2 Executing a transition

`workflow.execute(obj, action, actor, payload, idempotency_key, expected_version)`:

1. Return the stored response if `idempotency_key` was already used with the
   same request hash; raise `idempotency_conflict` if the hash differs.
2. `SELECT … FOR UPDATE` the object.
3. Check `expected_version` → `stale_version`.
4. Check `action in table` and `obj.state in source` → `transition_not_allowed`.
5. Check permission (role + facility + relationship, SECURITY §4) →
   `permission_denied` / `not_found`.
6. Check `requires` guards (e.g. consent active and covers current content
   hash).
7. Apply state, increment `version`, write `HistoryEntry`, `AuditEvent`,
   `OutboxEvent` in the same transaction.
8. After commit: inline FHIR write if `fhir_required` (§5.2).
9. Return serialized object with fresh `allowed_actions`.

`allowed_actions` is computed by running steps 4–6 for every action without
side effects.

### 6.3 Concurrency for slots

- `Appointment` has a partial unique index:
  `UNIQUE(slot_id) WHERE state IN ('REQUESTED','ALTERNATE_SLOT_PROPOSED','PATIENT_ACCEPTED','CONFIRMED')`.
  Because `propose_alternate` moves `appointment.slot` to the alternate slot,
  the alternate is protected by the same index.
- Requesting a slot locks the `Slot` row, checks `AVAILABLE`, sets `HELD`,
  creates the appointment. A concurrent second request gets
  `409 slot_unavailable`. The index is the final guard if locking is bypassed.
- `propose_alternate` locks both slots, requires the alternate to be
  `AVAILABLE`, sets it `HELD`, releases the original to `AVAILABLE`, and
  stores it in `original_slot`, all in one transaction.
- On `DECLINED`, `EXPIRED`, `CANCELLED` the current slot returns to
  `AVAILABLE` in the same transaction.

---

## 7. Background work

### 7.1 Outbox dispatcher

A Celery beat task every 2 seconds claims undispatched `OutboxEvent` rows with
`FOR UPDATE SKIP LOCKED`, routes them to handlers, marks `dispatched_at`.
Handlers must be idempotent (keyed on event id).

| Event | Handlers |
|---|---|
| `*.state_changed` | WebSocket broadcast (MASTERPLAN §6.4), notifications |
| `fhir.sync_requested` | FHIR sync task |
| `document.uploaded` | OCR job |
| `referral.draft_requested` | AI draft task |
| `consent.granted` / `consent.revoked` | Referral guard re-evaluation |

### 7.2 Scheduled jobs

| Job | Interval | Behavior |
|---|---|---|
| `expire_appointment_requests` | 5 min | Applies `expire` per Q-04 policy (disabled until set) |
| `escalate_unacknowledged_referrals` | 1 min | Applies `escalate` to `urgency=emergency` referrals in SENT past the facility-approved threshold (Q-06); never a code default |
| `remind_unacknowledged_referrals` | 15 min | Notification reminders for non-emergency referrals in SENT (no state change) |
| `abandon_idle_triage_sessions` | 1 min | Applies `abandon` after the inactivity timeout setting (`TRIAGE_IDLE_TIMEOUT`, product decision; start value agreed in Phase 0) |
| `expire_consent_requests` | 15 min | Q-07 |
| `retry_failed_fhir_sync` | 5 min | Bounded retries; alerts on backlog (DEPLOYMENT §7) |
| `purge_idempotency_records` | daily | TTL cleanup |
| `retention_enforcement` | daily | Applies retention policy once approved (Q-07) |

### 7.3 Queues

Separate Celery queues so slow AI work cannot delay notifications:
`default`, `fhir`, `notifications`, `ocr`, `ai`. Worker pools are sized per
queue (DEPLOYMENT §3).

---

## 8. Triage orchestrator

The orchestrator owns conversation state and every word the assistant says
(D-08, Architecture §5.1).

### 8.1 Components

```text
apps/triage/
  orchestrator.py     # turn loop, state machine
  rules/engine.py     # deterministic red-flag evaluation
  rules/dsl.py        # rule schema + validator
  normalizer.py       # Bangla/English normalization, numerals, negation markers
  policy.py           # response policy: question | grounded | declined | emergency
  providers/base.py   # VoiceProvider interface
  providers/<vendor>.py
  providers/text.py   # text-mode "provider" used by the fallback and tests
```

### 8.2 Turn sequence

```text
patient utterance (voice: provider ASR event → /triage/provider-events | text: POST /turns)
  → normalize (keep original text)
  → red-flag engine on cumulative session facts
      hit  → state EMERGENCY_PATHWAY, response = approved emergency instruction text
             for the session language, push `triage.emergency`, stop questioning
      miss → policy decides next step:
             a) next structured question from the clinician-approved question flow
             b) guidance requested → RAG over approved KB (§10.2)
                  evidence ≥ threshold → constrained generation with passage IDs
                  else → decline + offer doctor
  → output validator (no dose, no drug name recommendation, no diagnosis phrasing;
    rejects and falls back to decline)
  → store Turn with ruleset/kb/model versions and passage IDs
  → send text to provider TTS (voice) or return in response (text)
```

The provider never receives a system prompt that lets it answer on its own.
If a vendor only offers an integrated agent mode, it may be used only if it
can be configured as pure ASR/TTS with the backend deciding each response;
otherwise use separate ASR and TTS components (Q-05).

### 8.3 Red-flag rule DSL

Rules are data, authored and approved by clinicians, loaded by version:

```json
{
  "id": "RF-CHEST-01",
  "description_en": "PLACEHOLDER — NOT CLINICALLY APPROVED",
  "any": [{ "symptom": "chest_pain", "with": { "duration_minutes_gte": null } }],
  "action": "emergency",
  "instruction_key": "emergency.instruction.default"
}
```

- The engine is pure Python, no model calls, fully unit-tested.
- Symptom extraction for rules uses a deterministic keyword + phrase lexicon
  in both languages (with negation handling), not an LLM. An LLM may suggest
  candidate symptoms, but they only count after the patient confirms them in
  a follow-up question.
- A `RuleSet` cannot be activated unless `status=approved` and it passes the
  clinician-approved scripted test suite stored with it.
- Pilot readiness check fails if any active rule or instruction contains the
  placeholder marker.

### 8.4 Voice provider interface

```python
class VoiceProvider(Protocol):
    def create_session(self, session_ref: str, language: str) -> ProviderCredentials: ...
    def verify_webhook(self, request) -> ProviderEvent: ...   # signature check
    def speak(self, session_ref: str, text: str, language: str) -> None: ...
    def end_session(self, session_ref: str) -> None: ...
```

Credentials are short-lived (≤ 5 minutes to start, bound to one session).
Only `session_ref` (random) is sent; no name, phone or record ID (SECURITY §8).
Until a vendor is wired (Q-05, e.g. Vapi), `apps/triage/providers/placeholder.py`
provides `PlaceholderVoiceProvider` implementing `VoiceProvider`.

**Vapi (D-22).** `VOICE_PROVIDER=vapi` selects `apps/triage/providers/vapi.py`
(`VAPI_PUBLIC_KEY`, `VAPI_PRIVATE_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET`):
- `create_session` returns the public key and assistant ID (no private key, no personal data).
- `POST /triage/provider-events` verifies the `x-vapi-secret` header, then passes each
  *final patient* transcript through `process_patient_turn` (same red-flag rules as text,
  INV-8), speaks the reply through the call's control URL, and on an emergency also ends
  the call (INV-16). Partial and assistant transcripts are ignored; the payload is not stored.
- The browser starts the call with `metadata.session_ref`, which is how the webhook finds the session.
- `POST /triage/sessions/{id}/translate` returns a machine translation of one caption
  (`apps/ai/translate.py`, Gemini when `LLM_PROVIDER=gemini`; otherwise `text: null`).
- Replies (D-23): `apps/triage/dialogue.py` asks the model for the next question when
  `LLM_PROVIDER=gemini`; otherwise the scripted replies run. The red-flag check runs first and
  the model is never called on an emergency; every reply still passes the INV-7 validator.
- Vapi dashboard setup: server URL = the provider-events endpoint with the same secret,
  `monitorPlan.controlEnabled = true`, and no model-generated replies.

---

## 9. Documents and OCR

1. Upload: stream to object storage under `documents/<uuid>`; compute
   SHA-256; validate type by magic bytes (PDF, JPEG, PNG, HEIC→converted copy,
   original kept); size limit 20 MB; reject encrypted PDFs with a clear
   error; virus scan (ClamAV) before state leaves `UPLOADED`.
2. Write `DocumentReference` to HAPI (attachment URL is our backend-mediated
   URL, not a storage URL).
3. OCR job on `ocr` queue produces `ExtractedField` candidates with page and
   bounding box.
4. Verify endpoint accepts the clinician's corrected list, writes
   `DiagnosticReport` + `Observation`s + `Provenance` (author = clinician,
   derived from = DocumentReference, agent = OCR engine version) in one
   Bundle, then marks `VERIFIED`.
5. Prior results endpoint (`GET /patients/{id}/results?test=&group_by=test`) lists
   earlier verified Observations grouped chronologically by test name with date, lab,
   and verified status. No logic cancels or hides a test (INV-15). Orders trigger
   recent-results advisory without auto-cancelling the request.

---

## 10. AI module

### 10.1 Interfaces and Adapters

`apps/ai/adapters.py` defines `LLMAdapter` (`generate(schema, messages, max_tokens)`)
and `OCRAdapter` (`extract(file_bytes) -> fields`). Concrete adapters are chosen by setting
(D-21):
- LLM adapters: `MockLLMAdapter` (default/tests), `GeminiLLMAdapter` (`gemini-1.5-flash`), `OpenAILLMAdapter` (`gpt-4o-mini`). Factory: `get_llm_adapter()`.
- OCR adapters: `MockOCRAdapter` (default/tests, returns realistic laboratory test candidate fields with coordinates and confidence), `TesseractOCRAdapter`. Factory: `get_ocr_adapter()`.
- Tasks (`apps/ai/tasks.py`):
  - `process_document_ocr(document_id)`: pulls file from storage, invokes OCR adapter, creates `ExtractionJob` and `ExtractedField` rows, transitions `Document` from `OCR_QUEUED` -> `OCR_RUNNING` -> `EXTRACTED_UNVERIFIED` (or `OCR_FAILED`).
  - `generate_referral_draft_task(referral_id)`: gathers clinical context, queries LLM adapter with schema constraints, validates with `validate_referral_draft_schema`, records `ReferralDraftVersion`, and saves draft summary (INV-7).
All calls log `model_version`, input references (IDs, not text) and
latency. No patient data is sent to any endpoint outside the approved
hosting boundary (Architecture §6.4).

### 10.2 Retrieval (RAG)

- `KnowledgeSource` (title, publisher, rights status, version, published,
  effective, language), `Passage` (source, section, page, text, embedding
  `vector`), `KnowledgeBaseVersion` (approved set of sources, approved by,
  approved at).
- Retrieval filters to the active approved version and session language
  (falls back to the other language only if the source is approved for it).
- Support threshold is a clinician-approved setting, stored on
  `KnowledgeBaseVersion`, not a code constant.
- Patient documents are never indexed into the KB (Architecture §6.2).

### 10.3 Structured outputs

Referral draft schema (JSON Schema, versioned in `apps/ai/schemas/`):
sections per Architecture §6.3, each statement carrying `source_refs`
(`fhir:Observation/123`, `document:<uuid>#page=2`). The validator rejects
drafts with statements lacking a source ref, unless the statement is in the
"missing or uncertain information" section. Missing values stay `null`; the
validator rejects placeholder text such as "N/A" invented by the model.

---

## 11. API layer

- DRF with `drf-spectacular` → `/api/v1/schema/` (OpenAPI 3.1). CI publishes
  the schema as a build artifact; the frontend generates types from it
  (MASTERPLAN D-12, FRONTEND §5). A CI step fails if the schema changes
  without a matching ledger entry in MASTERPLAN §10.
- Custom exception handler produces the MASTERPLAN §6.2 envelope for every
  error, including DRF validation and Django 404/403.
- `IdempotencyMiddleware` enforces the `Idempotency-Key` header on the routes
  listed in MASTERPLAN §6.1.
- Cursor pagination class as specified.
- Throttles: login, registration, MFA verify, triage session create, public
  directory (values in SECURITY §3.4).
- WebSocket via Django Channels at `/ws/events`; consumer authenticates by
  session, subscribes the user to groups derived from memberships and own
  patient ID; sends IDs/states only.

---

## 12. Audit

- `AuditEvent`: `at`, `actor_user`, `actor_role`, `actor_facility`,
  `action` (`read`|`create`|`update`|`transition`|`export`|`share`|
  `download`|`break_glass`|`login`|`login_failed`), `object_type`,
  `object_id`, `patient_id`, `outcome`, `reason`, `request_id`, `ip`,
  `user_agent_hash`.
- Written by a service helper used inside selectors (reads) and the
  transition engine (writes). Chart and document reads are audited per
  request, not per field.
- Table is insert-only: the application DB role has `INSERT, SELECT` only on
  it; a trigger blocks `UPDATE`/`DELETE`. A nightly job ships a hash-chained
  copy to separate storage (DEPLOYMENT §6).
- FHIR `AuditEvent` and `Provenance` are written where they support exchange
  (Architecture §7.4).

---

## 13. Emergency referral endpoint

`POST /referrals/emergency` (MASTERPLAN §6.3):

- Requires only the five minimum fields (MASTERPLAN §7). Every other field is
  optional and can be added later.
- `Idempotency-Key` is the device-generated queue item key; the record is
  created once even if the device retries days later.
- If the server already holds the key with different content, return `409
  idempotency_conflict` with the stored version so staff can resolve it
  (FRONTEND §9).
- Generates `reference_code` server-side. For offline-created items the
  device prints a provisional local code (FRONTEND §9.3; format pending
  Q-09); the server stores it as `provisional_code` and
  `GET /referrals/by-reference/{code}` accepts either.
- `urgency` must be `emergency` or `urgent`; anything else is
  `validation_error`. Creation enters `SENT` with `emergency_mode=true`;
  escalation timer starts. FHIR projection is asynchronous here (not gated),
  because INV-16 forbids blocking an emergency transfer on a FHIR write.
- The receiving facility can read the five-field dataset immediately (D-13);
  full-record access follows SECURITY §4.4.
- Notifications go to the receiving facility immediately.

---

## 14. Testing

| Level | What | Tooling |
|---|---|---|
| Unit | Services, transition tables, guards, rule engine, normalizer, mappers, schema validators | pytest, factory_boy |
| Contract | Transition tables vs MASTERPLAN §5; error envelope; OpenAPI snapshot | pytest |
| Authorization | Cross-patient, cross-facility, guessed document IDs, role-without-relationship | pytest parametrized matrix generated from MASTERPLAN §4.2 |
| Concurrency | Two simultaneous slot requests; double `send`; duplicate idempotency keys | pytest with threads against real PostgreSQL |
| Integration | PostgreSQL, Redis, MinIO, HAPI in Docker (testcontainers) | pytest |
| FHIR | Profile validation of every mapper output; failed HAPI write → retry → no duplicate | HAPI `$validate` |
| Triage safety | Clinician-approved scripted cases in Bangla, English, code-switching, negation, numerals | pytest data-driven; 100% of emergency cases must route to emergency (Project Plan §8.4) |
| AI | Draft schema conformance, no invented values, source refs present | Evaluation set (synthetic) |

Coverage gate: `workflow`, `triage/rules`, `consent` and `accounts`
permissions at 95% line coverage; others 80%.

---

## 15. Phase checklist

| Phase | Backend deliverables | Exit proof |
|---|---|---|
| 1 | Skeleton (§2), settings, `common`, `/auth/me`, HAPI client create/read test, schema endpoint, CI | `pytest` green; HAPI round-trip test passes |
| 2 | accounts, identity (+ duplicates), organizations, directory, slots | Authz matrix tests for directory and patients |
| 3 | Appointment transitions, slot locking, outbox, notifications, WebSocket | Concurrency test; SMS cannot change state (no inbound SMS endpoint exists) |
| 4 | Encounters, documents, OCR queue, verify, prior results | Guessed-URL test returns 404; original unchanged after OCR |
| 5 | Referrals, consent, escalation job, outcome return, FHIR ServiceRequest/Task | Full lifecycle test incl. decline and FAILED_TO_SYNC |
| 6 | AI adapter, extraction quality checks, draft generation + versions | Schema validator rejects unsourced statements |
| 7 | Triage orchestrator, rule engine, RAG, provider adapter, summary | Scripted safety suite passes in both languages |
| 8 | Emergency endpoint, break-glass (if Q-07 approves), retention, load tests | Duplicate offline replays create one referral |

---

## 16. What the frontend relies on (handoff)

The frontend is built against these guarantees. Breaking one is a contract
change (MASTERPLAN §1.3 rule 2).

1. Every stateful object returns `state`, `allowed_actions`, `version`,
   `fhir_sync_status`, `history`.
2. Every error uses the MASTERPLAN §6.2 envelope with a stable `code`.
3. `allowed_actions` is the only source of which buttons to show.
4. `404` is returned for objects the user may not see.
5. The OpenAPI schema at `/api/v1/schema/` is complete and generated, never
   hand-edited.
6. WebSocket events carry IDs and states only.
7. State display strings are never sent; the frontend maps state codes to
   i18n keys.
8. Server responses to `Idempotency-Key` replays are byte-identical to the
   original response.
