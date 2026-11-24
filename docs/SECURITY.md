# Medi Waypoint — Security and Privacy Plan

> **BLUF:** Patient health data is the asset. Access requires three passing
> checks on the server (role, facility scope, care relationship), sharing
> between providers requires a specific patient consent, and every read of
> patient data is audited in an append-only log. External vendors (voice,
> SMS, any AI endpoint) receive the minimum data, with no identity in the
> voice stream. Several policies (consent wording, break-glass, retention,
> emergency exceptions) are not decided yet; the system must ship with them
> disabled rather than guessed.

---

## 1. Read first

- Roles and action matrix: [MASTERPLAN.md §4](../MASTERPLAN.md#4-roles-and-permissions).
- Open policy questions: MASTERPLAN §8.2 (Q-05, Q-07, Q-09, Q-13).
- Implementation hooks: [BACKEND.md](BACKEND.md) §6 (engine), §12 (audit);
  [FRONTEND.md](FRONTEND.md) §4 (browser auth), §9 (offline);
  [DEPLOYMENT.md](DEPLOYMENT.md) §4 (network), §5 (secrets).

---

## 2. Threat model (summary)

| Asset | Threat | Primary control |
|---|---|---|
| Patient records and reports | Clinician browsing records without a care relationship | Relationship check (§4.3), read audit, periodic access review |
| Patient records | Guessable IDs / IDOR | UUIDs, server-side scope on every query, 404 on denial |
| Reports in object storage | Public bucket or leaked URL | Private bucket, backend-mediated short-lived links (§6.2) |
| Accounts | Credential stuffing, password guessing | Rate limits, lockout, MFA for clinicians (§3) |
| Sessions | XSS stealing tokens, CSRF | HttpOnly cookies, CSP, CSRF tokens (§3.2) |
| Triage | Prompt injection making the assistant give unsafe advice | Backend-owned responses, output validator, red-flag rules first (§8) |
| AI drafting | Instructions hidden in uploaded reports | Reports are data, not instructions; schema validation; clinician approval (§8.3) |
| Voice vendor | Audio/transcripts processed abroad or retained | Data minimization, retention off, vendor review (§8.1, Q-05) |
| SMS | Clinical info exposed on shared phones | No clinical content in SMS (§7.3) |
| Offline device | Lost/stolen facility device | Minimal data, encryption, clear after sync (§6.3) |
| Audit log | Tampering to hide access | Insert-only DB role, hash chain, off-host copy (§5) |
| Workflow | Forged approval via SMS reply or replay | No inbound SMS actions; idempotency; transition engine checks (INV-6) |

---

## 3. Authentication

### 3.1 Methods

| User | Method |
|---|---|
| Patient | Email or username and password (min 12 chars, common-password check), self-registered at `/register`; 5 failed attempts per identifier or client, then a 15-minute lock |
| Clinician, facility staff, facility admin | Password (Argon2id, min 12 chars, breached-password check) + MFA (Q-13: TOTP preferred; SMS OTP only if approved) |
| Platform admin | Password + mandatory TOTP; access only from admin network (DEPLOYMENT §4) |

Clinician accounts are created by facility admins against a verified
practitioner registration number; no self-service clinician sign-up.

### 3.2 Sessions and browser

- Django server-side sessions. Cookie: `HttpOnly`, `Secure`,
  `SameSite=Lax`, `__Host-` prefix, no `Domain`.
- CSRF token required on all unsafe methods.
- Session rotated on login, MFA completion and facility switch.
- CSP: `default-src 'self'`; `script-src 'self' 'nonce-…'`; `connect-src
  'self'` plus the approved voice provider origins (Vapi: `api.vapi.ai`, `*.daily.co`, `wss://*.daily.co`); `frame-ancestors 'none'`;
  `object-src 'none'`. Next.js nonce support via middleware.
- Headers: HSTS (preload after pilot), `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: same-origin`, `Permissions-Policy: microphone=(self)`,
  camera and geolocation disabled.

### 3.3 Timeouts

| User | Idle | Absolute |
|---|---|---|
| Patient | 30 min | 7 days |
| Clinician / staff | 15 min (warning at 13) | 12 h |
| Platform admin | 10 min | 8 h |

Shared facility computers: "Sign out" is always visible; sign-out clears the
query cache and service-worker caches except the encrypted emergency queue.

### 3.4 Rate limits

Starting values, tuned from pilot measurements. Enforced in Django (per
account / phone / session) and at the edge (per IP).

| Endpoint | Limit |
|---|---|
| `POST /auth/login` | 5 per 15 min per account; 30 per 15 min per IP |
| `POST /auth/register` | 5 attempts per 15 min per client address |
| `POST /auth/login`, `/auth/admin/login`, `/auth/mfa/verify` | 5 failed attempts per identifier or client, then a 15-min lock |
| `POST /triage/sessions` | 5 per hour per patient or guest session; 20 per hour per IP |
| Public directory `GET` | 60 per min per IP |
| All other authenticated API | 300 per min per user |

---

## 4. Authorization model

Every API request that touches patient data must pass all three checks in
the service layer (BACKEND §6.2 step 5). Failure returns `404 not_found` for
object reads and `403 permission_denied` for list/action endpoints where
existence is already known to the caller.

### 4.1 Role

From MASTERPLAN §4.2. Implemented as permission strings on `Membership`.

### 4.2 Facility scope

The user acts for one active facility at a time. Queues and searches are
limited to that facility. Switching facility is audited.

### 4.3 Care relationship

A clinician or staff member may see a patient's record when at least one is
true:

1. The patient has an appointment (any non-terminal state, or completed in
   the last N days — N set by policy, Q-07) with that practitioner or at that
   facility.
2. There is an encounter for the patient at the active facility.
3. A referral for the patient was sent to the active facility and is in
   `SENT` or later, and an active consent covers that facility (or the
   emergency exception applies once approved, Q-07).
3a. An emergency referral (`emergency_mode=true`) was sent to the active
   facility: the receiver may read **only the five-field minimum dataset**
   of that referral, without consent (MASTERPLAN D-13, to be confirmed under
   Q-07). This is enough to acknowledge, treat, record an outcome and close.
   It does not open the chart.
4. Active break-glass grant (§4.5).

Patient search returns only patients satisfying one of these, plus exact-match
lookup by identifier for registering a walk-in (which returns minimal
demographics and creates relationship 2 only after an encounter is opened).

### 4.4 Consent enforcement

- A referral's shared content is readable by the receiver only if a `Consent`
  is `ACTIVE`, names the receiving facility (and practitioner if specified),
  covers the categories included, and its `content_hash` matches the sent
  content.
- Revocation stops future access to shared record content immediately; it
  does not erase what the receiver already viewed (record this in consent
  wording, Q-07). Referral state transitions on refusal and revocation are
  defined in MASTERPLAN §5.2. Revocation never hides an emergency referral's
  minimum dataset from its receiver (D-13).
- Consent to use triage is separate from consent to share records
  (Architecture §7.2). It is captured as an accepted disclosure version when
  creating a triage session (MASTERPLAN §6.3, `triage_consent` in §7).

### 4.5 Break-glass

Disabled (`FEATURE_BREAK_GLASS=false`) until Q-07 approves a policy. If
enabled: requires clinician role, typed reason, time-limited grant (default
policy-defined), scope limited to the one patient, `AuditEvent(action=
break_glass)`, immediate notification to facility admin, and a retrospective
review queue. No "admin sees everything" role exists.

### 4.6 Platform admin

Platform admins manage configuration and see audit metadata, not clinical
content. They have no break-glass right (MASTERPLAN §4.2; the source allows
break-glass only for an authorized clinician, Architecture §7.3). A support
case that needs record content is handled by a clinician at a facility with a
care relationship, not by platform staff.

---

## 5. Audit

- What is recorded: BACKEND §12 field list; Architecture §7.4.
- Reads of chart, document, referral content and downloads are audited.
- Insert-only table, DB trigger blocking update/delete, daily hash-chained
  export to separate storage with restricted credentials (DEPLOYMENT §6).
- Patients can see who accessed their record (metadata: facility, role, date)
  if policy approves (Q-07).
- Monthly access review: facility admins review break-glass uses and a sample
  of reads by users with no appointment that week.
- Retention: per approved policy (Q-07); until set, retain indefinitely and
  block deletion.

---

## 6. Data protection

### 6.1 In transit and at rest

- TLS 1.2+ (1.3 preferred) at the proxy; TLS or private network with mTLS
  between internal services where supported (DEPLOYMENT §4).
- Disk encryption on all hosts; PostgreSQL, HAPI DB and object storage backups
  encrypted with keys held outside the backup location.
- Object storage server-side encryption enabled.

### 6.2 Files

- Uploads validated by magic bytes, size-limited, virus-scanned (BACKEND §9).
- Stored under random keys; original filename kept only as metadata.
- Downloads: `POST /documents/{id}/download-link` checks access, audits, and
  returns a backend URL valid for 60 seconds and bound to the session. The
  object store is never reachable from the internet.
- Served with `Content-Disposition: attachment` unless rendered in the viewer;
  PDFs rendered with a sandboxed viewer (pdf.js), not the browser plugin.

### 6.3 Offline emergency data

- Only the five-field dataset is stored (FRONTEND §9).
- AES-GCM with a non-extractable WebCrypto key. Residual risk: an attacker
  with an unlocked, signed-in device can read queued items. Mitigations that
  apply now: auto-clear after sync, 72-hour warning, OS screen lock required
  by facility policy. **Proposed, pending Q-09** (device model not decided):
  device enrollment and remote "revoke device" so stale items cannot sync
  without staff review (`/devices/*`, MASTERPLAN §6.3).

### 6.4 Minimization

- Triage sessions store transcripts and summaries only as long as the
  retention policy allows (Q-07); audio is not stored by us.
- Analytics: no third-party analytics scripts on authenticated routes.
  Product metrics come from audited workflow events (Project Plan §9), with
  patient identifiers removed from metric tables.
- No patient data used for model training without explicit opt-in, ethics
  approval and de-identification (Architecture §7.5).

---

## 7. Logging, errors and messaging

### 7.1 Logs

- Structured logs carry `request_id`, user public ID, facility ID, route,
  status. Never names, phone numbers, transcript text, clinical values or
  file contents.
- A redaction filter drops known PHI keys and masks phone-like and NID-like
  patterns as a second line of defense.
- Error reporting (e.g. self-hosted Sentry) with `send_default_pii=False`,
  request bodies stripped.

### 7.2 Screen content

- Patient names in clinician queues are shown; in notification previews and
  browser tab titles they are not ("New referral" instead of a name).
- Print views include only what the slip format requires.

### 7.3 SMS

- Content: action prompt and link only, e.g. "Medi Waypoint: your
  appointment request has an update. Open the app to see it." No diagnosis,
  test result, doctor specialty or facility type that reveals a condition.
- No inbound SMS commands (INV-6).
- Messages sent by SMS (notifications only) include the domain for origin binding where the gateway
  supports it.

---

## 8. AI and vendor controls

### 8.1 Voice provider

- Receives audio and a random session reference only (BACKEND §8.4).
- Contract and configuration: retention off where possible, no training use,
  documented processing location and subprocessors before pilot (Q-05).
- Webhooks from the provider are signature-verified and replay-protected
  (timestamp ±5 min, event ID dedup).
- Browser credentials are single-session and short-lived; master keys only on
  the server.

### 8.2 Triage response safety

- The assistant's text is produced by the backend policy (BACKEND §8.2):
  question flow, grounded answer with passage IDs, decline, or approved
  emergency instruction.
- Output validator blocks dose patterns, drug recommendations and diagnostic
  statements; a block results in a decline, logged for clinical review.
- Patient utterances are treated as untrusted input; they cannot change
  system instructions, rule sets or retrieval scope.

### 8.3 Document and drafting inputs

- Text extracted from uploaded reports is wrapped and labelled as patient
  data in prompts; the drafting schema allows no free-form instructions to
  flow into actions.
- AI output cannot trigger any transition. Only a clinician action through
  the transition engine changes referral state (INV-7).
- Model endpoints are internal (DEPLOYMENT §3). If any external AI endpoint
  is ever approved, it requires a written data-processing review first.

---

## 9. Infrastructure security

Detailed in DEPLOYMENT §4–§6. Required controls:

- Only the reverse proxy is public. PostgreSQL, Redis, HAPI, MinIO, workers
  and inference services are on private networks.
- Separate DB credentials per service with least privilege (API, workers,
  HAPI, audit exporter, read-only reporting).
- Secrets from a secret manager or encrypted environment files, never in the
  repo or the frontend bundle; CI scans for secrets (gitleaks).
- Dependency and container scanning in CI (pip-audit, npm audit, Trivy).
- Host patching cadence: monthly, critical within 72 h.

---

## 10. Security testing and readiness gates

| Phase | Gate |
|---|---|
| 1 | CSP and cookie flags verified; gitleaks and dependency scans in CI |
| 2 | Authorization matrix test suite generated from MASTERPLAN §4.2 passes |
| 4 | IDOR tests on documents; malicious file upload tests (polyglot PDF, oversized, wrong type) |
| 5 | Consent enforcement tests: wrong facility, revoked, changed content hash |
| 7 | Prompt-injection test set for triage and drafting; vendor review document complete |
| 8 | External or peer penetration test; backup restore test; access-control review report (Project Plan Phase 8) |
| Pilot | No open critical/high findings; incident response contacts and process written; Q-05, Q-07, Q-09 answered or the related features disabled |

### 10.1 Incident response (minimum)

1. Detect (alerts, user report) → 2. contain (disable account, revoke
sessions, disable feature flag) → 3. assess scope from audit log → 4. notify
per applicable law and Ministry policy → 5. fix and review. Named contacts
and notification duties are confirmed before pilot.

### 10.2 Open findings from the UI redesign audit

Recorded in [redesign/PRODUCT_UX_AUDIT.md](redesign/PRODUCT_UX_AUDIT.md) §6; no rule in this document changes.

- **A-01 (high):** the voice provider key is copied into a `NEXT_PUBLIC_*` variable and shipped in the browser bundle, contrary to §8.1. Fix before any public deployment.
- **A-02 (high):** the OTP and MFA codes are fixed development values with no attempt limits or rate limits, contrary to §3.1 and §3.4. Nothing stops them running in production settings.


### Embedding provider (D-33, Q-12)

Knowledge-base search sends two kinds of text to the embedding provider (Gemini): the book's own text when a book is
ingested, and the patient's latest symptom answers (no name, phone or record id) when a question is searched. This sits
under the same open question as the other model endpoints (§8.3): a written data-processing review is still needed before
real patients. Gemini keys are sent in a request header, never in the URL, and only an 8-character fingerprint of a key is ever logged, so a key cannot leak into logs.
