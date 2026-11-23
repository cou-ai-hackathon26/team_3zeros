# Plan: Vapi voice agent with a phone-call experience (mobile-first, Siri-style)

## Context
Voice triage runs on placeholders: `frontend/src/voice/placeholderClient.ts` (browser) and `backend/apps/triage/providers/placeholder.py` (server). The owner has Vapi keys and wants a real call:
- the call goes ringing → connected → listening → speaking, like a phone call;
- full-screen mobile UI with a glowing blob that pulses when the agent speaks;
- live captions in the spoken language, with a translated line underneath (Bangla ↔ English).

Decisions made:
- Captions show the spoken language plus a backend translation labelled "machine translation".
- The blob is built with the existing `motion` library in React Bits style, driven by real audio levels. It adds no new dependency.
- Keys live only in env vars and are never committed.

Rules: Q-05 (the vendor choice) stays open behind a flag. INV-2: the microphone only starts after the patient taps, and text mode stays available. INV-16: an emergency ends the call at once. D-08: the triage orchestrator stays on the backend, so the browser never sends a system prompt or patient details.

## 1. Contract (MASTERPLAN first, then BACKEND/FRONTEND, plus a §10 ledger row)
- `VoiceSessionState` gains `ringing` and `connected` (FRONTEND §8; `src/voice/types.ts`).
- `TriageCaptionEvent` gains an optional `translation: {text, lang, machine: true}`.
- `POST /triage/sessions/{id}/voice-credentials` now returns `{provider:"vapi", token, assistant_id, session_ref, expires_at}`. It returns the public key only, never the private one.
- `POST /triage/provider-events` verifies the Vapi signature, records transcripts as triage turns and returns translations to the client over the existing WebSocket (`apps/common/consumers.py` `broadcast_event`). If the WebSocket is down, captions fall back to the spoken language only.
- Feature flag `VOICE_PROVIDER=vapi|placeholder`, tagged Q-05.
- UI strategy doc §4 amendment: the "call blob" is allowed as the patient-app voice level indicator. It reacts only to real audio, with no decorative loop, and `prefers-reduced-motion` turns it into a static ring with a level bar.

## 2. Backend
- New `apps/triage/providers/vapi.py` with `VapiVoiceProvider` implementing the `base.py` interface:
  - `create_session`: returns the public key, assistant ID and `session_ref` as metadata only. No personal data goes to Vapi.
  - `verify_webhook`: checks the `x-vapi-secret` header against `VAPI_WEBHOOK_SECRET`.
  - `speak`: sends text from our orchestrator to the call through Vapi's server control.
  - `end_session`: ends the call through Vapi's API.
- `get_voice_provider()` in `placeholder.py` (or `providers/__init__.py`) picks the provider from settings.
- Translation goes through the existing `apps/ai/adapters.py` LLM adapter with a translate-only prompt, run as a Celery task so it never blocks the call. Output is marked `machine: true`.
- Settings: `VAPI_PUBLIC_KEY`, `VAPI_PRIVATE_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_WEBHOOK_SECRET`, read from env and added to `.env.example` without values.
- Tests: provider unit tests with mocked HTTP, a webhook test with a bad signature returning 401/403, the URL contract test, and a check that emergency calls `end_session`.

## 3. Frontend: client
- Add the `@vapi-ai/web` dependency. It is lazy-loaded with `import()` only when a call starts, which keeps the patient first load under 170 KB.
- New `src/voice/vapiClient.ts` implementing `VoiceClient` (pattern from `placeholderClient.ts`). Vapi SDK events map to our states:
  - `call-start` → `connected`, then `listening`
  - `speech-start` → `speaking`
  - `speech-end` → `listening`
  - `volume-level` → `level`
  - `message` (transcript, final only) → `caption`
  - `call-end` → `ended`
  - `error` → `connection_lost`
  - `end()` stops all tracks at once.
- `controller.ts` lines 64/78: pick the client through a small factory based on the flag, instead of the hard-coded `PlaceholderVoiceClient`.
- Ringing: emit `ringing` from tap until `call-start`. The ringtone is a short Web Audio double-beep generated in code, so there's no audio file. It is muted when the device is silent or the user turns sound off.
- Add `CSP connect-src` entries for Vapi's hosts (`next.config`, SECURITY §3.2).

## 4. Frontend: call screen (mobile-first)
- New `components/VoiceCall/`:
  - `CallScreen`: full-height sheet with a status line (Ringing… / Connected / Listening / Speaking), timer, mute and end-call buttons, and a "switch to text" button.
  - `CallBlob`: layered radial gradients plus blur in `motion`. Scale and glow follow a smoothed `level` while `speaking`, a soft breath follows mic level while `listening`, and a gentle pulse plays while `ringing`. Colours come only from tokens (add `voice.glow.*` to `tokens.json` and run `tokens:check`).
  - `CallCaptions`: an `aria-live="polite"` region showing the last two lines, the spoken-language line in large type and the translation in small muted type with a "machine translation" tag. Words are never split by letter, because that breaks Bangla conjuncts.
- `VoicePanel.tsx` / `TriageView.tsx` render `CallScreen` when voice mode is on. The existing text fallback, pause/resume and emergency handling stay.
- i18n strings go in `bn`/`en` messages, with no hard-coded text.

## 5. Verification
- Backend: `pytest -q` covering the new provider and webhook tests.
- Frontend:
  - `npm test`, including `voice.test.tsx`, with a mocked Vapi SDK. It covers the ringing→connected→listening→speaking order, captions with translation, emergency ending the call, and reduced motion.
  - `tsc`, `lint:tokens`, `tokens:check`.
  - Build from a copy of the frontend and run `budgets:check`.
- Manual: a real call on a phone-sized viewport (Chrome, 390×844) with your keys in `.env.local`. Check the state sequence, the blob glowing while the agent speaks, captions in both languages, mute, hang-up, and that an emergency phrase ends the call.
