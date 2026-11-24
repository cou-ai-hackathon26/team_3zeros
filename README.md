# Medi Waypoint

**A Bangla voice triage agent and FHIR referral service that carries one patient thread from first symptom to outcome.**

Medi Waypoint assists Community Health Workers (CHWs), clinicians, and receiving hospitals across Bangladesh — designed specifically for patients with limited digital access, literacy, connectivity, or personal device ownership.

---

## Key Capabilities (MVP)

### 1. Referral for Patients Without a Personal Phone
- **Phone-less Patient Registration (`/patients/new`):** CHWs can register patients without requiring a phone number, email, NID, birth registration, or patient account.
- **Server-Generated System Patient ID (`MWP-XXXXXXXX`):** Every patient receives a human-readable, collision-resistant system identifier (`PatientIdentifier(system="system_id")`) searchable across authorized facilities.
- **Assisted In-Person Consent:** CHWs holding `consent.record_assisted` can record `assisted_verbal` or `assisted_paper` consent with witness verification for account-less patients, advancing referrals only to `READY_FOR_SENDER_APPROVAL` (never bypassing clinician approval).
- **Printable Standard Referral Slip & Zero-PII QR:** Generates an A6/A5 portrait printable slip distinguishing provisional offline codes from server-confirmed references, with a QR code encoding **strictly** the opaque token `MW-REF:<code>` (zero PHI).

### 2. Referral Continuity During Network Failure
- **Unified Encrypted Offline Queue (`frontend/src/offline/`):** IndexedDB + non-extractable Web Crypto AES-GCM 256-bit encryption (unique 96-bit IV per record) supporting `patient_create`, `standard_referral`, `emergency_referral`, and ordered `referral_action` updates.
- **Reliability & Security Hardening:** Per-referral FIFO action ordering, patient-to-referral dependency resolution (`local-pat-*` → server UUID + `MWP-*`), single-flight sync lock, exponential backoff, CSRF cookie refresh recovery, `AUTH_REQUIRED` pause/resume, F-3 uncertain-outcome reconciliation, fail-closed key persistence, and strict multi-user isolation on shared devices.
- **Receiving-Facility Partial Intake & Deterministic Reconciliation:** Receiving facilities can look up slips/QR tokens (`GET /api/v1/referrals/by-reference/{code}`), immediately accept partial referrals (`POST /api/v1/referrals/partial-intake`) when the sender is still offline, track explicit `missing_fields`, acknowledge/start care/record outcomes without waiting, and automatically reconcile when the sender's full referral syncs (zero duplicates, zero status regression).

### 3. Bangla Voice Triage & Clinical Continuity
- Bilingual English (`en`) and Bangla (`bn`) UI throughout all journeys using Handover design tokens.
- Voice/written triage integration (`VAPI_*` / `LLM_PROVIDER` adapter boundary with safe written fallback when external voice credentials are not configured).
- Closed-loop referral workflow: `DRAFT → CONSENT_REQUESTED → READY_FOR_SENDER_APPROVAL → SENT → ACKNOWLEDGED_BY_RECEIVER → IN_PROGRESS → OUTCOME_RETURNED → CLOSED`.

---

## Local Development Setup

### Backend (Django + DRF)
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
copy ..\.env.example .env
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

### Frontend (Next.js 15 + React 19)
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000`.

### Running Tests & Checks
```powershell
# Backend
cd backend
.\.venv\Scripts\python.exe manage.py check
.\.venv\Scripts\pytest.exe tests/test_mvp_e2e_journey.py tests/test_phase3a_foundation.py tests/test_phase3b_partial_intake.py tests/test_phase3c2_idempotency_hardening.py -v

# Frontend
cd frontend
npm test
npx tsc --noEmit
npm run lint:tokens
```

---

## Architecture & Specifications
- [`MASTERPLAN.md`](MASTERPLAN.md) — Canonical product, RBAC, workflow state machine, and API contract ledger.
- [`MEDI_WAYPOINT_WORKFLOW_DESIGN.md`](MEDI_WAYPOINT_WORKFLOW_DESIGN.md) — UX and interoperability design for phone-less referrals and offline continuity.
- [`MEDI_WAYPOINT_FINAL_DELIVERY_REPORT.md`](MEDI_WAYPOINT_FINAL_DELIVERY_REPORT.md) — End-to-end MVP delivery summary and verification results.
