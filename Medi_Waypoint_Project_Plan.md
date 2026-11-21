# Medi Waypoint — Project Plan

**Document type:** Delivery roadmap, work breakdown and acceptance plan  
**Project:** Medi Waypoint: From First Symptom to Referral Outcome  
**Plan basis:** 11-page project proposal plus the two agreed product corrections  
**Planning estimate:** Approximately 16–18 weeks for a focused prototype/pilot release, subject to team availability, clinical review, facility access and integration readiness

---

## 1. Project objective

Deliver a working web-based patient navigation and closed-loop referral platform that demonstrates two connected journeys:

1. A patient visits Medi Waypoint, speaks to a Bangla/English AI triage agent through the browser, reviews the resulting summary, discovers a suitable doctor and submits an appointment request. The doctor reviews and accepts/rejects the request through the clinician dashboard.
2. A clinician records the visit, uploads reports, reviews extracted information, creates an onward referral, approves it in the dashboard and sends it to a receiving facility. The receiver acknowledges the referral, records the outcome and returns it to the referring doctor.

The project should also demonstrate the emergency referral workflow from an upazila-level facility to a district hospital, including the minimum emergency dataset and a low-connectivity fallback.

### 1.1 Product rules that apply to every phase

- Patients enter the primary triage flow through the website, not by calling a phone number.
- Voice interaction happens in the browser using the device microphone after permission is granted.
- Bangla and English are both supported, with a text fallback for users who cannot use voice.
- Doctors approve appointment requests and outgoing referrals through their authenticated dashboard.
- Receiving facilities acknowledge/decline incoming referrals through their dashboard.
- SMS is supplementary: OTP, notifications, reminders and status messages. SMS is not the doctor-approval interface.
- AI can assist with bounded triage, report extraction and draft summaries. It cannot diagnose, prescribe, approve referrals or autonomously send them.
- Every referral decision and access to patient records must be permission-checked and auditable.
- FHIR R4 and the applicable Bangladesh Core profiles guide clinical data exchange. National-system integration remains dependent on approval and access.

---

## 2. Delivery strategy

### 2.1 Build the core workflow before advanced AI

The referral and clinical-record workflow is the platform's central value. Build identity, scheduling, records, FHIR and the referral lifecycle before polishing the voice agent. The product should remain useful if a third-party voice or AI provider is unavailable.

### 2.2 Use incremental releases

| Release | Goal | What must work |
|---|---|---|
| R0 — Foundation | Establish the engineering base | Repositories, environments, CI, API skeleton, design system, initial FHIR/HAPI setup |
| R1 — Operational core | Make doctor and patient workflows usable | Accounts, facility directory, schedules, appointment requests and doctor-dashboard decisions |
| R2 — Clinical continuity | Make records and referrals work end to end | Patient chart, documents, referral lifecycle, patient consent, receiver acknowledgement and outcome return |
| R3 — AI assistance | Reduce manual documentation without removing clinician control | OCR verification, referral drafting and browser voice triage |
| R4 — Pilot-ready | Demonstrate reliable operation in realistic conditions | Emergency offline flow, security, clinical validation, monitoring, training and pilot acceptance |

### 2.3 Planning assumptions

The 16–18 week estimate assumes:

- A small team of approximately three developers working consistently.
- A clinician/advisor is available to review clinical rules, content, triage test cases and workflow decisions.
- A pilot facility can provide workflow feedback and sample (synthetic or properly de-identified) reports.
- The team can provision a Bangladesh-based test/staging environment.
- No production access to the national Health ID or Shareable Health Record is required for the prototype. Those integrations are treated as approval-dependent future work.
- Voice and SMS providers can be evaluated using test accounts. Final production provider selection remains subject to privacy, language and hosting review.

If these assumptions are not met, retain the phase order but revise the calendar rather than reducing clinical or security validation.

---

## 3. Scope

### 3.1 MVP / pilot scope

**Patient application**

- Responsive patient website.
- Account/identity flow appropriate to the pilot.
- Browser-based Bangla/English voice triage.
- Microphone preflight, session start/end and text fallback.
- Clinician-authored emergency red-flag pathway.
- Approved-source guidance with safe refusal when unsupported.
- Patient-visible triage summary.
- Doctor/facility discovery by area, specialty and availability.
- Appointment request submission and status tracking.
- Patient consent for sharing specified information with a named provider.

**Clinician application**

- Secure clinician login and role/facility permissions.
- Dashboard for pending appointment requests and referrals.
- Appointment accept, decline and alternate-slot response.
- Patient chart with triage summary, encounter history, reports and key clinical information.
- Upload and view PDF/photo reports.
- OCR extraction shown as unverified values alongside the original.
- Doctor-reviewed referral draft and dashboard approval.
- Incoming referral acknowledgement/decline.
- Outcome documentation and return to the referring doctor.

**Platform and interoperability**

- Django REST API and PostgreSQL application database.
- HAPI FHIR R4 integration for the resources selected for the pilot.
- FHIR validation against the agreed profile package.
- Consent and audit trail.
- Private file storage.
- SMS for optional OTP and notifications.
- Background workers, retries, backups and basic operational monitoring.
- Emergency referral form with five required information groups, offline queue and printable slip.

### 3.2 Explicitly not required for the first pilot

- A telephone hotline or phone-call-based primary triage flow.
- Native Android/iOS applications.
- E-prescribing and pharmacy integrations.
- Direct laboratory-system integrations.
- Ambulance dispatch or telemedicine.
- Automatic national Health ID / Shareable Health Record integration before approval and interface access.
- Autonomous diagnosis, treatment plans or medicine recommendations.
- Fully live bed-management integration across hospitals.
- Large-scale research analytics using identifiable patient data.

These may be considered in later releases after the core workflow is validated.

---

## 4. Phase-by-phase roadmap

The schedule below is a planning baseline, not a guarantee. Some design, API and testing activities can run in parallel, but the dependencies listed must be respected.

### Phase 0 — Product, clinical and technical alignment

**Indicative duration:** Week 1

**Objectives**
- Convert the proposal into agreed user stories and workflow rules.
- Resolve safety, consent, identity and approval decisions before implementation.
- Confirm the pilot demonstration scenarios.

**Work items**
- Map patient, doctor, receiving-facility and facility-admin journeys.
- Confirm the exact appointment request/approval behavior.
- Define the referral state machine and transition permissions.
- Define patient consent scope and how it is captured in the web app.
- Select the pilot FHIR resource/profile scope; verify the relevant Bangladesh Core package and terminology.
- Agree emergency red-flag content and who clinically approves it.
- Confirm what the browser voice provider receives and what it may retain.
- Define the minimum data required for the emergency offline form.
- Create wireframes for patient voice session, appointment status, doctor dashboard and referral details.

**Deliverables**
- Approved MVP scope and user stories.
- Workflow/state diagrams.
- Initial FHIR resource/profile mapping.
- Clinical safety and consent decision log.
- UI wireframes and acceptance criteria.
- Initial risk register.

**Exit criteria**
- The team can explain who may perform each key action and what state transition it creates.
- A clinician has reviewed the draft emergency rules and triage limitations.
- The patient web voice journey and dashboard-based doctor approvals are reflected consistently in all designs.

### Phase 1 — Engineering foundation and environments

**Indicative duration:** Weeks 2–3

**Objectives**
- Establish a repeatable development and deployment foundation.
- Implement the initial frontend/backend integration.

**Work items**
- Set up repositories and branch/PR conventions.
- Create the Next.js + TypeScript application and shared component system.
- Create the Django + DRF backend with domain app structure.
- Configure PostgreSQL and migrations.
- Provision HAPI FHIR R4 in a private environment.
- Add Redis and background worker skeleton.
- Add private object-storage integration.
- Configure reverse proxy, TLS for staging, environment settings and secret management.
- Add CI for formatting, linting, tests and production builds.
- Add structured logs and initial error reporting.

**Deliverables**
- Running local development environment.
- Running staging environment.
- Authenticated test API and frontend shell.
- HAPI FHIR connectivity and a basic validation test.
- CI pipeline and environment documentation.

**Exit criteria**
- A developer can start the stack using documented steps.
- The frontend can authenticate against Django.
- Django can create/read a test FHIR resource through HAPI.
- Secrets are not committed to source control or exposed in browser bundles.

### Phase 2 — Accounts, identity, facilities and scheduling foundation

**Indicative duration:** Weeks 4–5

**Objectives**
- Establish who is using the platform and which facilities/doctors are available.
- Build the data foundation required for appointments and referrals.

**Work items**
- Implement patient, clinician and facility-staff account types.
- Implement role and facility-scoped permissions.
- Implement patient identifiers and duplicate-candidate suggestions; do not auto-merge records.
- Implement facility, department, practitioner, specialty and service directory.
- Implement area-based discovery; avoid requiring exact GPS location.
- Implement practitioner schedules and appointment slots.
- Add dated capacity reports and freshness labels.
- Map relevant organization/practitioner/location/service data to FHIR where agreed.

**Deliverables**
- Sign-in and role-aware navigation.
- Facility and doctor directory.
- Basic facility/practitioner administration.
- Appointment availability API.
- Initial FHIR directory mappings.

**Exit criteria**
- A patient can find a suitable doctor by area and specialty.
- A clinician sees only permitted facility and patient information.
- Facility data can be created and maintained by authorized users.
- Duplicate identity candidates are flagged for human review, not merged automatically.

### Phase 3 — Patient and doctor appointment workflows

**Indicative duration:** Weeks 6–7

**Objectives**
- Implement appointment requests and make the doctor dashboard the approval interface.

**Work items**
- Build patient appointment selection and request submission.
- Build clinician dashboard queues for pending appointment requests.
- Implement accept, decline and alternate-slot actions.
- Implement slot conflict prevention and transaction-safe booking.
- Implement appointment status history and audit events.
- Add patient-visible request/confirmation status.
- Add SMS/in-app notification after a dashboard decision.
- Map confirmed appointments to FHIR Appointment and supporting schedule/slot resources as agreed.

**Deliverables**
- Working patient appointment request flow.
- Doctor dashboard appointment queue.
- Status history and notifications.
- Appointment FHIR mapping and validation tests.

**Exit criteria**
- A patient can request a slot but it remains pending until a doctor/authorized scheduler accepts it.
- The doctor can accept, decline or suggest another time from the dashboard.
- Two concurrent requests cannot silently book the same slot.
- SMS sends a notification only; it cannot approve or modify an appointment.

### Phase 4 — Patient records, encounters and report management

**Indicative duration:** Weeks 8–9

**Objectives**
- Give clinicians a useful patient chart and a safe way to manage reports.

**Work items**
- Implement patient chart and authorized history view.
- Implement encounter creation and key clinical sections.
- Implement report upload, file validation and private storage.
- Preserve original report files as immutable source material.
- Add document metadata and FHIR DocumentReference mapping.
- Implement OCR job queue and draft extraction schema.
- Display extracted test name, value, unit, date and lab beside the original report.
- Add clinician correction/verification workflow.
- Implement access logging for patient chart and report views/downloads.

**Deliverables**
- Clinician patient chart.
- Report upload/view workflow.
- OCR extraction prototype marked as unverified.
- Encounter and document FHIR mappings.

**Exit criteria**
- An authorized clinician can view the patient's relevant history and upload a report.
- Original file is retained and is not overwritten by OCR output.
- OCR values are not treated as verified clinical results until a clinician confirms them.
- Unauthorized users cannot access a report by guessing its URL.

### Phase 5 — Referral lifecycle and closed-loop outcome

**Indicative duration:** Weeks 10–11

**Objectives**
- Implement the core Medi Waypoint value: a referral that is tracked from sender to receiver and back to the sender.

**Work items**
- Implement referral draft creation from patient history and selected reports.
- Implement a clinician-editable referral summary.
- Implement patient consent capture in the web application, scoped to recipient and purpose.
- Implement sending-doctor approval in the dashboard.
- Implement referral destination selection and sending.
- Implement receiver dashboard queue with acknowledge/decline and reason.
- Implement referral state transitions, timestamps and audit events.
- Implement outcome entry by the receiving facility.
- Return outcome to referring doctor and close the referral.
- Map ServiceRequest and Task workflow resources to the agreed FHIR profiles.
- Add time-based reminders/escalation configuration for unanswered referrals.

**Deliverables**
- End-to-end private-practice referral flow.
- Receiving-facility acknowledgement workflow.
- Outcome-return workflow.
- Referral dashboard and state history.
- Referral FHIR validation tests.

**Exit criteria**
- The sending doctor must review and approve a referral in the dashboard before it is sent.
- Patient consent is recorded separately from doctor approval.
- The receiving facility can acknowledge or decline the referral in its dashboard.
- The sender can see the current referral state and receives the outcome.
- All important state transitions are permission-checked and auditable.

### Phase 6 — AI document assistance and referral drafting

**Indicative duration:** Weeks 12–13

**Objectives**
- Reduce documentation effort while keeping clinical authority with the doctor.

**Work items**
- Select an open-weight model and approved deployment approach for the prototype.
- Implement report extraction service adapter and quality checks.
- Implement referral summary generation using only authorized patient data.
- Require source references for report-derived statements.
- Mark uncertain/missing data explicitly.
- Add structured output schema validation.
- Add doctor edit/approve workflow and retain draft-versus-final history.
- Log model/version, input record references and accepted/modified output.
- Build a clinician-reviewed evaluation set using synthetic or approved de-identified records.

**Deliverables**
- OCR-assisted report extraction.
- AI referral summary draft feature.
- Source-linked draft statements.
- Clinician correction metrics and evaluation report.

**Exit criteria**
- AI cannot send a referral or make a clinical record final.
- Each AI-generated summary is editable and must be approved by the sending doctor.
- Generated factual statements can be traced to source reports/record entries.
- The system does not invent unavailable patient values.

### Phase 7 — Browser-based voice triage

**Indicative duration:** Weeks 14–15 (can begin a limited provider proof of concept earlier)

**Objectives**
- Add the corrected patient entry experience: a voice agent launched from the website.

**Work items**
- Compare voice providers for browser real-time audio, Bangla/English quality, latency, data handling, retention and deployment approval.
- Implement a provider adapter and server-side credential/session creation.
- Implement microphone preflight and explicit consent/disclosure screen.
- Implement live browser voice UI, language choice, session stop/reconnect and visible errors.
- Implement deterministic clinician-authored red-flag checks before generative output.
- Keep the triage orchestrator, conversation state, approved-source retrieval and response policy in the Medi Waypoint backend; do not allow an external voice-agent model to answer outside these controls.
- Use the provider for browser audio transport and/or speech-to-text/text-to-speech, with a backend-controlled response turn.
- Implement approved-source retrieval, source logging and safe refusal.
- Implement triage summary generation and patient review.
- Attach the patient-approved summary to the patient record.
- Connect triage to doctor discovery and appointment request.
- Add text fallback and accessibility checks.
- Test Bangla, English and code-switching scenarios with clinician-reviewed scripts.

**Deliverables**
- Browser-based voice triage in the patient web app.
- Triage-session records and reviewable summaries.
- Red-flag test results.
- Voice-provider privacy and technical assessment.

**Exit criteria**
- A patient can start and end a voice session from the website without dialing a phone number.
- The interface clearly explains microphone use and the agent's limitations.
- Red-flag cases trigger the approved emergency pathway before normal guidance.
- Unsupported questions are declined rather than improvised.
- The selected voice provider cannot bypass the backend red-flag, knowledge-source and response-policy controls.
- A triage summary can be reviewed and used to request an appointment.
- Both languages pass the agreed clinician-reviewed test suite before pilot use.

### Phase 8 — Emergency offline workflow, security and pilot hardening

**Indicative duration:** Weeks 16–17

**Objectives**
- Make the application suitable for a controlled demonstration/pilot environment.

**Work items**
- Implement the five-field emergency referral form.
- Implement an encrypted/minimized local queue on authorized facility devices.
- Implement idempotent synchronization and conflict/error display.
- Implement printable referral slip with reference code.
- Implement controlled emergency break-glass access, if approved by policy.
- Complete role/relationship access-control review.
- Complete audit review and data-retention configuration.
- Run security checks, dependency scans and API abuse tests.
- Run backup and restore test.
- Run load tests for expected pilot usage.
- Run end-to-end tests across patient, sender doctor and receiver facility.
- Prepare clinician training, facility onboarding and support procedure.

**Deliverables**
- Emergency referral offline queue and printable slip.
- Security and access-control review report.
- Test and restore reports.
- Pilot deployment checklist and user guide.
- Demonstration-ready staging/pilot release.

**Exit criteria**
- Emergency transfer is not blocked by nonessential form fields or network failure.
- A queued referral synchronizes without creating duplicates.
- A printed slip can be used to identify the referral when connectivity is unavailable.
- Critical permissions, consent and audit controls pass review.
- The team can restore the system from backup in a test environment.

### Phase 9 — Controlled pilot and evaluation

**Indicative duration:** Week 18 and ongoing evaluation window

**Objectives**
- Validate workflow usability and safety with a small number of participating users/facilities.

**Work items**
- Onboard pilot doctors and facility coordinators.
- Run synthetic-data rehearsals before any real patient data is used.
- Start with a limited set of specialties/facilities and approved scripts.
- Collect workflow metrics and user feedback.
- Review all triage exceptions, AI edits and referral failures with clinicians.
- Record operational issues and prioritize fixes.
- Compare care measures against a baseline collected at pilot sites.

**Deliverables**
- Pilot evaluation report.
- Clinical safety review findings.
- Product backlog for the next release.
- Go/no-go recommendation for expanded deployment.

**Exit criteria**
- No unresolved critical safety/security issue remains.
- Clinical reviewers accept the tested red-flag behavior and AI boundaries.
- Referral handovers and outcomes can be traced end to end.
- Pilot metrics are collected with defined denominators and timestamps.

---

## 5. Workstream ownership

The source proposal identifies three core team functions. The following division is a suggested ownership model; specific task allocation can be adjusted to the team's strengths.

| Workstream | Suggested owner | Supporting work |
|---|---|---|
| Architecture, backend, FHIR integration and delivery coordination | Lead developer | API contracts, domain model, security boundaries, CI/CD and integration review |
| Patient/doctor frontend and UI/UX | Frontend and UI/UX developer | Patient portal, clinician dashboard, responsive design, accessibility and browser voice interface |
| Research, full-stack workflows and AI integration | Researcher & full-stack developer | FHIR/profile research, OCR, RAG, AI summary drafts, evaluation and supporting backend/frontend tasks |
| Clinical governance | Designated licensed clinician(s) — required project dependency | Red-flag rules, approved source list, Bangla wording, workflow review and AI-output evaluation |
| Pilot operations | Facility coordinator / project lead | Facility directory, staff onboarding, availability data, support and feedback |

No AI safety rule, medical source list or clinical template should be approved solely by the software team.

---

## 6. Priority backlog by epic

| Priority | Epic | Key outputs | Dependency |
|---|---|---|---|
| P0 | Identity and authorization | Accounts, roles, facility scopes, patient identity | Foundation |
| P0 | FHIR platform base | HAPI connection, profile validation, resource mapping | Foundation + profile decisions |
| P0 | Facility and doctor directory | Facilities, practitioners, services, area and availability | Identity |
| P0 | Appointment request workflow | Patient request, doctor dashboard decision, notifications | Directory |
| P0 | Patient chart and documents | Encounters, report upload, record access controls | Identity + FHIR |
| P0 | Closed-loop referral | Consent, sender approval, receiver acknowledgement, outcome return | Patient chart + FHIR |
| P1 | Audit and security | Access logs, Provenance, break-glass if approved | Identity + core workflows |
| P1 | OCR and report extraction | Draft test values, clinician verification | Documents |
| P1 | AI referral drafting | Source-linked draft and doctor approval | Patient chart + referral |
| P1 | Browser voice triage | Mic/session UI, red flags, RAG, summary | Patient portal + clinical sign-off |
| P1 | Emergency offline mode | Minimal queue, sync, printed slip | Referral workflow |
| P2 | National integration | Health ID / Shareable Health Record | External authorization and interface access |
| P2 | Lab integration | Structured FHIR lab results | Laboratory agreements |
| P2 | Research export | Opt-in, ethics-approved, de-identified aggregates | Governance approval |

P0 items define the core demonstrable referral platform. P1 adds AI and resilience required for the intended pilot. P2 is future expansion.

---

## 7. Demonstration scenarios and acceptance criteria

### Scenario A — Browser voice triage to appointment and onward referral

1. Patient opens the Medi Waypoint website on a smartphone or computer.
2. Patient selects Bangla or English, grants microphone permission and starts the voice session.
3. Agent asks follow-up questions and checks clinician-defined danger signs.
4. If no emergency condition is detected, the agent gives only supported guidance or offers a doctor.
5. Patient reviews the triage summary and selects a suitable doctor/available slot.
6. Appointment request appears in the doctor's dashboard as pending.
7. Doctor reviews the request and triage summary, then accepts/declines/proposes another time in the dashboard.
8. Patient receives an in-app status update and optional SMS notification.
9. Doctor records the encounter and uploads reports.
10. AI prepares a referral draft; doctor edits and approves it in the dashboard.
11. Patient authorizes sharing with the named receiving doctor/facility.
12. Receiving doctor acknowledges the referral, reviews the record and records the outcome.
13. Original doctor receives the outcome in the dashboard.

**Acceptance:** Each step has a visible status, an authorized actor, a timestamp and an audit record. SMS must not be required for doctor approval. No AI action can independently approve or send the referral.

### Scenario B — Emergency referral from upazila to district hospital

1. Authorized upazila staff open emergency referral mode.
2. The form requests only identity, reason, urgency, vital signs and treatment already given.
3. The sending clinician/staff member submits the referral when connected, or queues it locally when offline.
4. The patient/family receives a printed slip with a reference code if required.
5. The district hospital sees the incoming referral, acknowledges it and accesses the authorized information.
6. Receiving staff record what happened and return an outcome.
7. The sending facility can see the returned outcome.

**Acceptance:** The transfer is not delayed for nonessential data entry. Offline retries do not create duplicate referrals. The receiving facility can identify the referral from the printed reference code.

---

## 8. Testing and quality strategy

### 8.1 Backend and workflow tests

- Unit tests for permissions, validators, state transitions and appointment conflict handling.
- Integration tests for PostgreSQL, Redis, object storage and HAPI FHIR.
- Idempotency tests for repeated requests, retries and offline synchronization.
- Authorization tests that attempt cross-patient, cross-facility and unauthorized attachment access.
- State-machine tests for every allowed and rejected appointment/referral transition.

### 8.2 FHIR tests

- Validate each supported resource against the selected FHIR R4 profiles.
- Test required fields, terminology bindings, references and Bundle transaction behavior.
- Test resource version changes and history where used.
- Test failed HAPI writes and retry behavior.
- Keep sample payloads synthetic and version-controlled.

### 8.3 Frontend and end-to-end tests

- Patient registration/sign-in and consent flows.
- Microphone permission denied/granted, browser unsupported, audio interruption and reconnect.
- Patient appointment request and status updates.
- Doctor dashboard approval/rejection/reschedule.
- Referral sender approval, receiver acknowledgement and outcome return.
- Report upload, view and access denial.
- Mobile layouts, keyboard navigation and Bangla rendering.

### 8.4 AI and clinical evaluation

Create a clinician-reviewed evaluation set before allowing pilot use. Include:

- Emergency red-flag examples and near-miss/ambiguous examples.
- Bangla, English and code-switching.
- Colloquial symptom descriptions and speech transcription mistakes.
- Negation and symptom duration.
- Unsupported medical questions that should be declined.
- OCR reports with different layouts, poor images, handwritten/stamped content and unusual units.
- Referral summaries where source records contain missing or conflicting values.

Measure:

- Sensitivity of the emergency rule test suite against the clinician-approved cases.
- Correct refusal for out-of-scope questions.
- Grounded-answer rate and source support.
- Bangla/English transcription and intent error patterns.
- OCR field-level accuracy and clinician correction rate.
- Percentage of AI drafts edited by doctors and severity of errors found in review.

The proposal sets the emergency scripted-case target at all test cases being sent to emergency care. This must be confirmed against the final clinician-approved test suite. Care improvement targets should be set after the pilot baseline is collected, rather than invented in advance.

### 8.5 Operational tests

- Load test expected pilot usage and peak request patterns.
- Verify queue retry/backoff and failed-job visibility.
- Test network loss during emergency referral creation.
- Restore PostgreSQL, FHIR persistence and object storage from backup.
- Check monitoring alerts for API errors, FHIR failures and stuck referrals.

---

## 9. Metrics and pilot evaluation

Use event timestamps and audited workflow events as the source for measurement. Define the denominator for each metric before collecting results.

| Outcome | Proposed measure |
|---|---|
| Patients reach an appropriate doctor | Share of triage sessions that result in an accepted appointment request or accepted alternative guidance |
| Emergency cases are recognized | Share of clinician-approved scripted danger-sign cases routed to the emergency pathway |
| Agent stays within approved scope | Supported-answer rate and correct-decline rate for out-of-scope questions |
| Lower tiers are used appropriately | Share of patients guided to a suitable lower tier compared with the pilot baseline |
| Receiving facilities are prepared | Share of referrals acknowledged before patient arrival |
| Referrals are complete | Share of referrals with the required minimum dataset |
| Less repeated history/testing | Share of receiving clinicians who opened prior findings; share of repeat tests not repeated after clinician review of earlier results |
| Referrers receive feedback | Share of referrals with an outcome returned to the sender |
| Emergency referrals are not left unattended | Time from submission to acknowledgement; count of emergency referrals exceeding the configured escalation threshold |
| FHIR exchange is valid | Share of exchanged resources passing the agreed profile validation |
| AI summaries are useful and safe | Doctor edit rate and clinician-reviewed error severity |
| OCR is reliable enough to assist | Field-level extraction accuracy and correction rate |

Care targets should be set after a baseline is recorded at pilot sites. The initial pilot should prioritize safety, traceability and workflow completion over claims of large population-level impact.

---

## 10. Risks, dependencies and mitigations

| Risk / dependency | Impact | Mitigation / decision needed |
|---|---|---|
| Clinical reviewers are unavailable | Unsafe rules or delayed sign-off | Assign named clinical reviewers and review dates before voice triage development is considered complete. |
| Bangladesh Core profile package is unclear or changes | FHIR rework | Verify the authoritative package/version and profile URLs in Phase 0; keep mappings versioned. |
| Browser voice quality is poor in Bangla | Triage usability and safety concerns | Run a small vendor proof of concept early with a clinician-reviewed test set; retain text fallback. |
| Voice provider data handling is unacceptable | Pilot cannot proceed with that provider | Review processing location, retention and subcontractors; select an approved alternative or self-hosted speech components. |
| Facility directory/availability is inaccurate | Patients may request unavailable services | Assign data owners and show last-updated time; pilot with a manageable facility set. |
| Doctors do not respond to dashboard requests | Patient wait time and abandoned workflow | Provide queue prioritization, notification reminders and facility-approved escalation; measure decision time. |
| Patient identity is duplicated | Wrong record may be linked | Use duplicate suggestions and human resolution; avoid automatic merges. |
| FHIR/application state mismatch | Inconsistent patient/referral status | Define system of record per data domain; use validation, idempotency, retry and visible sync states. |
| Weak network at facilities | Referral may not arrive promptly | Emergency minimum-data queue, printed slip and explicit manual fallback. |
| Scope expands too early | Core referral workflow remains unfinished | Keep e-prescription, telemedicine, ambulance and national integrations outside MVP unless mandated. |

---

## 11. Definition of done

A feature is not complete merely because its happy path works on a developer's machine. Each feature must satisfy the relevant items below:

- User story and acceptance criteria are documented.
- UI reflects the correct patient/doctor role and status.
- Backend validates permissions and input independently of the frontend.
- Database migration and rollback implications are reviewed.
- FHIR mapping/validation is added where the feature creates or updates exchange data.
- Important state changes and patient-data access are audited.
- Errors, retries and duplicate submissions are handled.
- Unit/integration/E2E tests cover the critical path and failure path.
- No secrets or unnecessary health data appear in frontend bundles or logs.
- Clinician review is complete for clinical templates, safety rules and AI behavior.
- Documentation and deployment notes are updated.

---

## 12. Immediate next actions

The most useful first actions are:

1. **Lock the workflow decisions:** appointment request/approval states, referral states, receiving-facility acknowledgement and patient-consent capture.
2. **Arrange clinical review:** emergency warning signs, approved medical sources, Bangla wording and scripted triage cases.
3. **Confirm FHIR conformance target:** obtain and verify the Bangladesh Core profiles and agree the initial resource list.
4. **Create the application skeleton:** Next.js patient/clinician routes, Django domain apps, PostgreSQL, HAPI FHIR and CI.
5. **Prototype browser voice early:** test microphone access and Bangla/English audio quality without connecting real patient records.
6. **Build the operational core:** patient/doctor identity, directory, dashboard appointment decisions, records and referral lifecycle.
7. **Prepare a controlled pilot facility:** confirm participating clinicians, test accounts, sample data, connectivity and feedback process.

The first milestone should be a working patient-to-doctor appointment request with the doctor making the decision in the dashboard. The second major milestone should be a complete referral handover with an outcome returned to the sender. Voice and advanced AI should be added on top of these reliable workflows.

---

## 13. Source basis

This plan is based on:

- *Medi Waypoint: From First Symptom to Referral Outcome* (project proposal supplied by the team).
- The agreed product correction that patient triage starts from a website with an in-browser Bangla/English AI voice agent, rather than a telephone call.
- The agreed product correction that doctors approve appointment/referral actions through the authenticated web dashboard; SMS is supplementary for notifications and verification.

The timeline, technical sequencing, work breakdown and acceptance criteria are implementation recommendations. They should be adjusted after the team confirms staffing, pilot facilities, clinical reviewers and external integration access.

