# Plan: fix the empty summary and frozen hang-up after a voice call

Status: steps 2 to 4 built with option A (recommended). Step 1 still needs the webhook secret, a tunnel and the Vapi server URL (§3 A). Step 5 is a manual retest.

## 1. Symptoms (2026-11-24, session `eba0a3ce-a196-4c31-93ab-b3f587f4e828`)

- After a Vapi call the summary page shows five blank fields.
- It shows "The AI assessment is not available right now."
- Hanging up appeared to do nothing for over a minute.
- The first "Confirm and find a doctor" click showed "Could not confirm your summary right now. Try again."; the second worked.

## 2. Causes

### 2.1 The backend never receives what the patient says (proven)

- Both voice sessions of the day (`eba0a3ce…`, `111e9c54…`) hold one turn: the greeting. No patient turns.
- Voice answers arrive only through the Vapi webhook, `POST /triage/provider-events` (MASTERPLAN D-22).
- `VAPI_WEBHOOK_SECRET` is empty in `.env`, so `verify_webhook` rejects every event (`backend/apps/triage/providers/vapi.py`, lines 50-54).
- Vapi cannot reach `localhost:8000` without a tunnel.
- Captions on the call screen come from the Vapi SDK in the browser (`frontend/src/voice/vapiClient.ts`), so the UI counts answers the backend never stored and opens a summary of nothing.
- The report is skipped when fewer than two patient answers exist (`backend/apps/triage/dialogue.py`, lines 129-132), which sets `report_status: unavailable`.

### 2.2 Hang-up blocked for 81 seconds (proven)

- Locally `CELERY_TASK_ALWAYS_EAGER` is true, so the `finish` request runs the outbox dispatcher inline (`backend/apps/triage/services.py`, `request_report`).
- The dispatcher (`backend/apps/workflow/tasks.py`) does not claim events. It picked up outbox event 6 (`knowledge.document_uploaded`, the Davidson's upload at 05:12:06), which another request was already ingesting, and ingested it again.
- Timestamps: finish at 05:13:39; its own events 7 and 8 handled at 05:15:00.
- The same double dispatch can happen in production when the 2-second beat and an on-commit kick overlap.

### 2.3 First confirm click failed (not explained)

- The server recorded one confirm, successful, at 05:15:55.
- The generic message means the browser request failed with no API error body.
- It happened while the server was busy with the ingestion (05:12 to 05:18). That is suggestive, not proven.

## 3. Open decision: how voice answers reach the backend

| | A. Keep D-22 (recommended) | B. Browser relays the transcript |
|---|---|---|
| How | Set `VAPI_WEBHOOK_SECRET`; run a tunnel to port 8000 in dev; set the Vapi assistant's server URL and `monitorPlan.controlEnabled` | Browser posts each final patient line to `POST /triage/sessions/{id}/turns` and speaks the reply with the Vapi SDK |
| Contract change | None | D-22 changes: MASTERPLAN first, then BACKEND, FRONTEND and a §10 ledger row |
| Code | Step 4.2 only | `vapiClient.ts`, `callSetup.ts`, controller; webhook transcript handling switched off to avoid double turns |
| Cost | A tunnel every dev session; dashboard setup that cannot be verified from the repo | A settled decision is reopened |

In both options the backend orchestrator still writes every sentence (D-08) and the red-flag check runs first (INV-8).

## 4. Steps

1. **Voice answers reach the backend**: option A or B from §3.
2. **Fail closed when the webhook is not configured.** With `VOICE_PROVIDER=vapi` and an empty `VAPI_WEBHOOK_SECRET`, `voice-credentials` returns the existing `503 provider_unavailable`. The patient is offered text mode instead of a call that records nothing. Applies to option A; under B the check is dropped.
3. **Dispatcher claims each event.** In `apps/workflow/tasks.py`, take each event with `select_for_update(skip_locked=True)` inside a transaction, so an event is handled once and a patient request never waits on another request's job.
4. **No empty summary to confirm.** When a session has no patient answers, the summary page shows a "we didn't capture your answers" state with start-again and text-mode actions, instead of blank fields and the confirm button. Needs two new strings in `bn` and `en`. Today a blank confirmed summary can be attached to an appointment.
5. **Retest the confirm error** after steps 1 to 3. If it recurs, capture the failing request and the server log.

Not included: running a real Celery worker in local dev. Without it, hang-up still waits a few seconds for the report model call.

## 5. Verification

- Backend tests:
  - two overlapping dispatchers handle one event once (step 3);
  - `voice-credentials` returns 503 with Vapi selected and no secret (step 2);
  - option A: a signed webhook transcript creates a patient turn, an unsigned one is rejected;
  - option B: no duplicate turn when a webhook transcript also arrives.
- Frontend tests: the summary page with zero patient answers shows the new state and no confirm button (`triage-pages.test.tsx`).
- `pytest -q`, `npm test`, `tsc`, `lint:tokens`.
- Manual: a real call of at least two answers. Check that patient turns are stored, hang-up returns promptly, `report_status` becomes `ready`, the fields are filled, and confirm works on the first click.
