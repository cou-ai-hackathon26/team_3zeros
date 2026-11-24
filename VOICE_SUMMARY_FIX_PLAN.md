# Plan: fix the empty summary and frozen hang-up after a voice call

Status: steps 2 to 4 built with option A (recommended). Step 1 is not working yet: the retest at 11:43 still stored no answers; causes and remaining work are in §6. Step 5 is a manual retest after §6.

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

## 6. Retest with the webhook and tunnel (2026-11-24 11:43, session `63e1a9c1-3718-4e07-a66c-64ac4d549573`)

Result: the summary page showed "We didn't capture your answers" (the step 4 state, working as intended). The session again holds only the greeting.

Evidence: the last 125 requests in the ngrok inspector (`http://127.0.0.1:4040`), including the `end-of-call-report` payload, which carries the assistant's configuration.

### 6.1 Causes

| # | Cause | Where | Evidence |
|---|---|---|---|
| 1 | Vapi sends no secret | Vapi dashboard | Every webhook during the call (11:43 to 11:47) had an empty `x-vapi-secret` and got `401`. The assistant's `server` has a URL and timeout only. A test request with the `.env` secret at 11:42 got `200`, so the backend side is correct |
| 2 | Vapi sends no transcripts | Vapi dashboard | `serverMessages` is unset. Only `speech-update`, `conversation-update`, `status-update`, `assistant.started` and `end-of-call-report` arrived. The webhook acts only on `transcript` |
| 3 | The webhook reads `session_ref` from the wrong place | Our code, `backend/apps/triage/providers/vapi.py` `verify_webhook` | The browser passes it as an assistant override (`vapiClient.ts`: `vapi.start(id, { metadata })`), so Vapi delivers it at `call.assistantOverrides.metadata`. `call.metadata` is absent. With 1 and 2 fixed, no event would match a session and no control URL would be cached |
| 4 | The assistant runs its own interview | Vapi dashboard | Model `openai / gpt-4.1`, a 4,022-character system prompt and a first message; the call transcript shows seven bot questions. D-22 and D-08 require every sentence to come from our orchestrator. Once the webhook works, both would speak |
| 5 | Transcriber is English only | Vapi dashboard | `soniox`, `language: en`. Bangla answers (INV-3) will be transcribed poorly |

Confirmed working: the tunnel reaches Django, and `call.monitor.controlUrl` is present, so `speak` and `end_session` can work once `session_ref` is read correctly.

### 6.2 Steps

Code:

1. **Read `session_ref` where Vapi puts it.** In `verify_webhook`, take it from `call.assistantOverrides.metadata`. No contract change: the browser already sends it this way and D-22 only says a random `session_ref` reaches Vapi.
2. **Test with the real payload shape.** A signed `transcript` event carrying `call.assistantOverrides.metadata.session_ref` and `call.monitor.controlUrl` creates a patient turn and caches the control URL. A request with an empty secret is rejected.
3. **Correct the setup note** in the `vapi.py` module docstring and DEPLOYMENT: the assistant needs the server secret, `transcript` in `serverMessages`, and no replies of its own.

Vapi dashboard (owner; cannot be done or verified from the repo):

4. Set the server secret to the value of `VAPI_WEBHOOK_SECRET`.
5. Add `transcript` to the server messages.
6. Stop the assistant producing its own replies and first message. The exact setting has to be confirmed in Vapi; the backend greeting is already stored as the first turn but is not spoken on the call today (open point below).
7. Set the transcriber to one that handles Bangla and English.

Open points:

- **Spoken greeting.** The greeting is created with the session, before the call and its control URL exist, so nothing speaks it. Either the assistant's first message is set to the same fixed text in the dashboard, or the backend speaks it on the first webhook of the call. To be decided when step 6 is done.
- **Unwanted event volume.** About 120 webhooks arrived in a four-minute call, none of them needed. Restricting `serverMessages` to `transcript` plus what `speak` needs removes them.

### 6.3 Verification

- `pytest -q` including the new webhook test.
- Manual call with the ngrok inspector open: `transcript` events return `200`; each patient answer appears as a turn; the backend's question is the only voice heard; the closing line ends the call; the summary fields are filled and `report_status` becomes `ready`.
- One Bangla call and one English call.
