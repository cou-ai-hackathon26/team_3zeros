# Plan: Bring Medi Waypoint in line with the product concept (private practice + hospital emergency + record continuity)

## Context

The owner's concept: (1) doctors (private chambers and hospitals) hold full patient records and reports, refer patients with an AI-summarised, formatted package, and the receiving doctor sees everything on arrival; (2) hospital emergency departments capture every arrival and its reports so a returning patient's history is already there and doctors can skip unnecessary tests; (3) the data later supports research.

Assessment against the repo (branch `development`, HEAD `d60ba72`):
- **Strong already:** referral lifecycle with consent, approve, send, acknowledge, outcome returned (`backend/apps/referrals`, `frontend/src/app/[locale]/(clinician)/referrals`); chart, reports upload, OCR verification with prior results (INV-15); admin RBAC; offline 5-field emergency *transfer*.
- **Gaps:** no private-chamber model (doctors must belong to a facility); no emergency-department *intake* (only transfer-out); no results timeline / duplicate-test advisory; no problem list / medicines / allergies reconciliation; AI and OCR are mocks; identity continuity depends on unresolved Q-02/Q-10; no research layer; production infrastructure (Redis, object storage, deployment, backups) missing.

Rules that bind every phase (CLAUDE.md): contract first in `MASTERPLAN.md` (§4–§7, §8 decisions/questions, §10 ledger) and update `docs/BACKEND.md` + `docs/FRONTEND.md` in the same change; no invented clinical content (clinical fields/thresholds come from an approved source or stay open questions behind flags); AI never diagnoses or sends (INV-7); never auto-cancel tests (INV-15); emergency never blocked (INV-16); design system tokens only.

## Phase A — Decisions (owner, before code)

Record as MASTERPLAN §8 entries. Recommended defaults in brackets.
1. Patient identity: [phone + optional NID as identifiers; human-reviewed duplicate matching (existing `identity` DuplicateCandidate); Health ID later behind flag Q-10].
2. ED intake minimum dataset — must be signed off by an emergency clinician (new Q-18). Until then build with the existing five-field set (`EmergencyReferral`) plus arrival/disposition.
3. Private chambers: [doctor applies with BMDC number; platform admin approves; becomes facility_admin of a one-person facility].
4. Research: [deferred until after pilot; requires BMRC ethics approval + secondary-use consent] (new Q-19).
5. Real AI/OCR providers and hosting (existing Q-05, Q-12).

## Phase B — Private chamber support

- Backend: `Facility.type` gains `private_chamber` (organizations model + migration). Reuse `apps/accounts/admin_services.create_staff` to create the doctor as `facility_admin` + `clinician` membership + `Practitioner` (`registration_number` required, already enforced).
- Onboarding: reuse flagged access-request screen (`frontend/src/components/auth/AccessRequestForm.tsx`, adapter in `features/adapters.tsx`) → real endpoint `POST /access-requests` (contract row, answers Q-16); platform admin approves from `/staff` "Requests" tab (`APPLICATION_DESIGN_ARCHITECTURE.md §6.1`).
- A solo doctor with both roles uses the existing area switcher (`components/shell/AccountMenu.tsx`).
- Directory: chambers appear in `/doctors` with type label.

## Phase C — Emergency department intake (largest piece)

- Contract: new entity `EDVisit` with states `ARRIVED → TRIAGED → UNDER_CARE → {ADMITTED, DISCHARGED, TRANSFERRED, LEFT, DIED}` in MASTERPLAN §5 (one table, actors, audit). Transfer reuses `POST /referrals/emergency`.
- Backend: new app `apps/emergency_dept` using the workflow engine (`apps/workflow/engine.py`, pattern from `apps/scheduling/transitions.py`); endpoints `POST /ed-visits`, `GET /ed-visits?state=`, `GET /ed-visits/{id}`, `POST /ed-visits/{id}/actions/{action}`; unknown-identity patient created like `create_emergency_referral` (`apps/referrals/services.py`) and linked later via DuplicateCandidate; vitals/observations stored as `records.ClinicalObservation` on an `Encounter` (reuse); reports via existing `POST /documents/`.
- Frontend: `(clinician)/ed` board (queue pattern from `features/clinical/queue.ts` + `QueueList`), fast intake form (reuse emergency form + offline queue `src/offline/queue.ts`/`store.ts`), visit page with `HandoverTracker` (add ED holder map in `src/state/routes.ts`), `ActionBar` from `allowed_actions`.
- Discharge summary: AI-drafted via existing `ai` adapter, shown as `DraftBlock`, approved by doctor, saved to encounter.
- Permission: new catalogue code `ed.manage` in `apps/accounts/catalogue.py` (D-16 amendment).

## Phase D — Record continuity and test duplication

- Results timeline: extend `GET /patients/{id}/results` (`apps/documents/views.PatientPriorResultsView`) with grouping by test; chart tab "Results" with per-test history (date, lab, verified/unverified).
- Recent-results advisory: when a doctor records an order/requests a test (new `POST /encounters/{id}/orders`, contract row), response includes recent verified results of the same test; UI shows "done N days ago at X" — advisory only (INV-15).
- Problem list, medicines, allergies: use existing encounter allergy/medication endpoints (`config/urls.py` canonical-encounter-*), add patient-level current lists and a reconciliation step on referral draft (`referrals/[id]` page).
- Patient-held summary: printable one-page record (reuse `EmergencySlip` print pattern).

## Phase E — Real AI and OCR

- Implement `LLMAdapter`/`OCRAdapter` (`apps/ai/adapters.py`) for the chosen providers; keep `MockLLMAdapter` for tests; Celery tasks in `config/celery.py` for OCR queue and draft generation (currently none exist).
- Keep source-ref validation in `adapters.py`; evaluation set of consented, de-identified cases before enabling (flag per Q-12).

## Phase F — Production readiness

- Redis cache (sign-in limits in `apps/accounts/security.py` require shared cache), private object storage (documents upload currently computes `storage_key` without persisting), WebSocket events (`config/asgi.py` stub), SMS for notifications only.
- Deployment per `docs/DEPLOYMENT.md`: Dockerfiles, compose/staging, CI (tests, `lint:tokens`, build budgets), backups and restore test, monitoring; penetration test.
- Pilot: one upazila complex + one district hospital; metrics: record available on arrival, tests not repeated, ED intake time, outcomes returned.

## Phase G — Research (after pilot, gated on Q-19)

- Secondary-use consent flag on patient; de-identification pipeline and aggregated dataset export for platform admin; access logged in audit; nothing identifiable leaves.

## Verification (each phase)

- Backend: `cd backend && ../.venv/bin/python -m pytest -q` incl. contract URL test (`tests/test_masterplan_urls.py`) updated per new rows; state-machine and permission tests per entity.
- Frontend: `cd frontend && npm test && npx tsc --noEmit && npm run lint:tokens && npm run tokens:check`; build from a copy of `frontend/` to avoid clashing with `next dev`.
- Browser: extend `frontend/e2e/` (pattern `admin-access.mjs`, system Chrome via Playwright) against a scratch backend: private-chamber onboarding; ED arrival → triage → discharge with summary; returning patient shows prior results and advisory; referral with reconciled medicines.
- Budgets: patient routes ≤170 KB first load.
