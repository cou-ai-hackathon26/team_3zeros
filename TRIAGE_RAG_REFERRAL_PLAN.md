# Voice triage, RAG knowledge base, report, severity routing and referral completion

Finish the triage call (bounded 3-4 minute interview), move the knowledge base to a real hybrid pgvector RAG pipeline with a platform-admin book manager, generate the end-of-call summary and report asynchronously, route the patient by triage level, and fix the verified defects in the clinician referral flow.

## 1. What exists today (verified in code, 246 backend tests pass)

| Area | Built | Gap found |
|---|---|---|
| Triage session | State machine (§5.3), text turns, Vapi webhook, red-flag engine, LLM dialogue (`apps/triage/dialogue.py`), INV-7 output validator | No interview length control (prompt only says "after about three or four answers"); the system never fires `finish_questions`; hanging up the call runs `end`, which discards the summary; turns are not serialised per session; emergency speech is cut off (`speak` then immediate `end_session` in `triage/views.py`) |
| Summary | `TriageSummary` filled by heuristics in `triage/services.py` (complaint = first answer, duration = second answer, severity defaults to "Moderate") | Not derived from the conversation; specialty from a 5-rule keyword list (`policy.py`) |
| Report (D-25) | `generate_consultation_report` with code-enforced safety | Runs inside the `finish` HTTP request (45 s timeout); no status; triage level is not used for anything after display |
| Knowledge base | `KnowledgeDocument`/`KnowledgeChunk`, `ingest_knowledge` command, Davidson's loaded (9,796 passages) | In-memory TF-IDF rebuilt per process; one LLM translation call per turn (`context.py::_english`); no embeddings (D-07 unmet); no upload API or UI; no file, rights, reviewer or status fields; `Turn.passage_ids`, `kb_version` never written |
| Severity routing | Emergency screen; "browse doctors" link with specialty | Same next step for LOW, MODERATE and HIGH; doctor's queue cannot see the level without opening the request |
| Referrals | Full §5.2 machine, consent, FHIR gate, events (D-26), UI pages | `PATCH /referrals/{id}` has **no permission check**; draft creation uses the first clinician membership (ignores expiry and active facility), does no care-relationship check, ignores `encounter_id`, and invents a `Practitioner` with a fake registration number; emergency creation has no §4.2 permission check; `generate-draft` can be queued by any reader; with `LLM_PROVIDER=cerebras` (current `.env`) `get_llm_adapter()` silently returns the **mock**, so "AI drafts" are canned text; the draft prompt sends the patient's name and only document filenames |
| Infra | Compose uses `pgvector/pgvector:pg16` | Local and tests use SQLite; `psycopg` is not a dependency; API and workers share no media volume, so a worker cannot read an uploaded file; nginx body limit is 25 MB (Davidson's is 238 MB) |

## 2. End-to-end flow after this work

```text
Patient taps "Start call" (disclosure accepted, mic permission)          INV-1, INV-2
  -> POST /triage/sessions -> fixed Bangla greeting that states the length ("about 3 minutes, around 7 questions")
  -> each answer (Vapi final transcript -> webhook | text -> POST /turns), under a per-session row lock:
       1. normalise, store Turn
       2. red-flag rules on all answers           -> hit: fixed emergency instruction, call ends after it is spoken
       3. hybrid retrieval (pgvector + full text) -> passages, ids stored on the Turn
       4. model picks ONE next question from the ordered checklist, inside the answer budget
            [EMERGENCY] -> fixed instruction      [DONE] -> fixed closing line + system `finish_questions`
       5. INV-7 output validator -> speak / return
  -> SUMMARY_PENDING_REVIEW: report task queued (outbox), summary page shows "preparing" and polls
  -> report task: transcript-only model call -> conversation summary + assessment + triage level + specialty code,
     all safety rules of D-25 enforced in code; fills the editable summary fields
  -> patient reviews, edits, confirms
  -> next step by triage level:
       EMERGENCY  emergency screen, 999, emergency hospitals with phone links; no booking
       HIGH       "be seen today": emergency/urgent facilities first, then doctors of the specialty; request is flagged
       MODERATE   doctors of the suggested specialty
       LOW        what to watch for + optional general doctor
  -> POST /appointments (triage_session_id) stores a snapshot of the level -> doctor queue shows and sorts by it
  -> doctor sees the summary and report as a labelled AI draft (D-26), records the visit,
     and may create a referral: AI draft now cites the triage report, encounters and verified results
  -> consent -> approve -> send -> acknowledge -> outcome returned -> close (§5.2, unchanged)
```

No new states, roles or state-machine actions. AI still never diagnoses, prescribes, approves or sends (INV-7); the level is an AI draft and never blocks care (INV-16).

## 3. Health-assistant call design (target 3-4 minutes)

Policy constants in `apps/triage/dialogue.py` (replacing `MAX_TURNS = 24` for the question budget): minimum 4 answers, target 7, hard stop at 10.

- **Ordered checklist**, taken from the history fields already in `prompt.md` §3, asked in priority order and skipped when already answered: (1) main problem, (2) when it began and whether it is changing, (3) how bad, where, what kind, (4) other symptoms relevant to that problem, (5) age, and pregnancy only when relevant, (6) existing conditions, (7) regular medicines and allergies. Marked `PLACEHOLDER — NOT CLINICALLY APPROVED` until reviewers sign it off (Q-06).
- **Budget directive** appended to the system prompt each turn by the backend, from the answer count: answers 1-5 "ask the next missing item"; 6-7 "ask only if a required item is still missing, otherwise reply `[DONE]`"; 8-9 "reply `[DONE]`"; at 10 the backend closes without calling the model. `[DONE]` before 4 answers is ignored (one more question is asked). Same marker pattern as the existing `[EMERGENCY]`.
- **Per-turn wording rules** added to `prompt.md` §0: one question, at most about 20 words, a two-or-three-word acknowledgement, never read the answer back, rephrase an unclear answer once then move on. The scripted fallback's "I heard: …" echo is removed.
- **Closing** is fixed bilingual text (not model text): the summary is ready to review on screen. Voice: `speak(..., end_after=True)` (Vapi `endCallAfterSpoken`), also used for the emergency instruction so it is no longer cut off.
- **Finishing early**: the call screen gets a "Finish and see summary" button; hanging up after at least one answer finishes to the summary instead of discarding it (zero answers still ends the session).
- **Progress**: "Question 3 of about 7" on the call screen and text panel (text only, no animation), from a new `interview {target, max}` object on the session and the local answer count.
- **Latency per voice turn**: the translation LLM call is removed (multilingual embeddings match Bangla to English passages), leaving one embedding call, one indexed query and one short model call.
- **Reliability**: `process_patient_turn` locks the session row (`select_for_update`) so two transcript fragments cannot produce two replies.
- When the provider reports the call ended, the browser refetches the session and goes to the summary if it is `SUMMARY_PENDING_REVIEW`; the text `/turns` response gains `session_state` for the same purpose.

## 4. RAG pipeline

**Storage (extend `apps/knowledge`, same two models)**
- `KnowledgeDocument` gains: `public_id`, `status` (`PROCESSING | READY | FAILED`), `error`, `storage_key`, `sha256` (unique, rejects duplicates), `size`, `page_count`, `chunk_count`, `embedded_count`, `language`, `rights_statement`, `embedding_model`, `uploaded_by`, `approved_by` (user), `reviewer_name` (the clinical reviewer, anti-drift rule 5), `approved_at`. `approved` stays the single search gate.
- `KnowledgeChunk` gains: `embedding vector(768)` with an HNSW cosine index, `search_vector` (tsvector, GIN index), `ordinal`.
- `kb_version` = short hash of the approved set (document id + version), written to `TriageSession.kb_version` at creation. No extra table.

**Ingestion** (`apps/knowledge/ingest.py`, one service used by both the upload task and the existing `ingest_knowledge` command)
1. Stream the PDF to `default_storage` under `knowledge/<uuid>.pdf` while hashing; check PDF magic bytes and the size limit.
2. Outbox event `knowledge.document_uploaded` -> Celery task `ingest_knowledge_document`.
3. `pypdf` page text -> chunks of about 1,200 characters with 150 overlap on sentence boundaries (existing `chunk_text`, extended); pages with no text are counted and reported; a PDF with no text fails with "scanned PDF, OCR it first".
4. Bulk insert chunks with `search_vector`.
5. Embed chunks that have no embedding in batches of 100 (`apps/ai/embeddings.py`, Gemini `batchEmbedContents`, `RETRIEVAL_DOCUMENT`, 768 dimensions, retry with backoff on 429/5xx), updating `embedded_count`. Resumable: `retry` continues where it stopped.
6. `READY`. Not searchable until approved.

**Retrieval** (`apps/knowledge/search.py`, same `search()` signature, plus passage ids)
- Query = the last three patient answers (dialogue) or all of them (report), embedded with `RETRIEVAL_QUERY`, cached by hash.
- Top 20 by cosine distance and top 20 by full-text rank over approved, `READY` documents, merged by reciprocal rank fusion; a passage counts as evidence only above `KNOWLEDGE_MIN_SIMILARITY` (a setting, placeholder until clinicians set it, BACKEND §10.2).
- Embedding call fails -> full-text only; nothing found -> the existing "REFERENCES: none found" path.
- The in-memory index and `context.py::_english` are deleted. Citations still come only from stored document title and page (D-24, D-25).

**Admin (platform admin only)** — API under `/admin/knowledge/`, page `(admin)/knowledge`
- `GET /admin/knowledge/documents`, `POST` (multipart: file, title, publisher, version, language, rights_statement), `GET …/{id}` (status and progress), `POST …/{id}/approve` (`reviewer_name`, `rights_confirmed`), `POST …/{id}/retire`, `POST …/{id}/retry`, `DELETE …/{id}` (only while not approved), `GET /admin/knowledge/search?q=&document=` (try a question against a book before approving it).
- Every change writes an audit event. Facility admins get 403.
- UI: table (title, version, pages, passages, status with embedded/total, approved by and when), upload dialog with byte progress, approve dialog (reviewer name + rights checkbox), retire, retry, delete confirmation, test-search box. Tokens only, no decorative motion, strings in `en.json`/`bn.json`. Nav item shown to platform admins only.

## 5. Summary and report

- `finish` (patient or system) only moves the state and writes outbox event `triage.report_requested`; `apps/triage/tasks.py::generate_triage_report` does the model call. `structured_fields.report_status` is `pending | ready | unavailable`; the summary page polls while pending (no new WebSocket event).
- `report_prompt.md` gains `severity` (the patient's own description) and `recommended_specialty_code`, chosen from the real `Specialty` codes passed in the input; the code is validated against the table and falls back to `infer_specialty`.
- The task fills `chief_complaint`, `duration`, `severity`, `additional_notes`, the specialty fields and `structured_fields.triage_level` from the report. With no model configured the current heuristics remain and the level is `null` ("not assessed", routed as MODERATE: see a doctor).
- `guidance_sources` becomes the retrieved documents (title, publisher, version) instead of the hard-coded placeholder source.
- `model_version` is written from settings; `Turn.passage_ids` (already in BACKEND §4.5) is added.

## 6. Severity routing and referral fixes

**Routing**
- `features/patient/triageRoute.ts`: one pure function, level -> block, used by the summary page (pattern of `features/patient/nextStep.ts`). Blocks reuse `EmergencyScreen`, `useEmergencyFacilities` and the `/doctors` list.
- `Appointment.triage_level` (nullable snapshot written in `create_appointment_request`), exposed read-only; `features/clinical/queue.ts` sorts HIGH first and shows a text badge. Emergency is never routed to booking.

**Referral fixes (`apps/referrals`, `apps/ai`)**
1. `update_referral_draft`: load through the selector, require a sending-facility clinician, lock the row, honour `If-Match`.
2. `create_referral_draft`: active membership at the active facility; care-relationship check per SECURITY §4.3 (appointment or encounter at the facility); `encounter_id` linked and validated; receiver must differ from sender; 403 when the user has no `Practitioner` (no invented record).
3. `create_emergency_referral`: clinician, or staff with `emergency.create`, at an active membership; `sender_practitioner` becomes nullable for staff-created emergency referrals instead of inventing one.
4. `generate-draft`: sending-facility clinician only.
5. One model path: `get_llm_adapter()` uses `apps/ai/chat.generate_text` for `gemini` and `cerebras`; the mock is returned only when `LLM_PROVIDER=mock`.
6. Draft context: no patient name; reason, urgency, the patient's latest confirmed triage report, encounters with observations, active problems/medicines/allergies and verified results, each with a `source_ref` (`triage:<session id>` added to BACKEND §10.3). `summary_origin` is `ai_draft` until a clinician edits it.

## 7. Contract and document changes (first, per CLAUDE.md rule 2)

`MASTERPLAN.md`: §4.2 row "Manage knowledge base: platform_admin"; §6.3 the knowledge endpoints and `session_state` on the turn response; §7 `TriageSession.interview`, `structured_fields.triage_level` and `report_status`, `Appointment.triage_level`, `KnowledgeDocument` shape; §8.1 D-27 (interview policy), D-28 (hybrid pgvector retrieval, Gemini embeddings behind `EMBEDDING_PROVIDER`, tagged Q-12), D-29 (knowledge admin and approval record), D-30 (severity routing), D-31 (referral permission and draft fixes), D-32 (Postgres for local and tests); §10 ledger rows. Then `docs/BACKEND.md` §4.5, §8, §10.2, §10.3, `docs/FRONTEND.md` §3, §8, `docs/SECURITY.md` §8 (embedding provider receives book text and de-identified symptom text), `docs/DEPLOYMENT.md` (local Postgres, media volume, upload limit), `.env.example`, regenerate `frontend/src/api/openapi.json` and `schema.d.ts`.

## 8. Implementation order

1. Contract and docs (section 7).
2. Postgres everywhere: `psycopg[binary]` and `pgvector` via `uv add`; `local.py` reads `DATABASE_URL`; a dev compose file exposing the pgvector service; remove `--nomigrations` so the `VectorExtension` migration runs in tests; Postgres service in `.github/workflows/ci.yml`; shared `media_data` volume for api and workers; nginx `client_max_body_size` raised for `/api/v1/admin/knowledge/`.
3. Knowledge backend: migration, `apps/ai/embeddings.py`, `ingest.py`, task and dispatcher route, `search.py` rewrite, `context.py` cleanup, command refactor; re-ingest Davidson's from the PDF in the repo root.
4. Knowledge admin API (`apps/knowledge/views.py`, `urls.py`, `serializers.py`) and the admin page, hooks, nav, i18n.
5. Interview: `dialogue.py`, `prompt.md`, `services.py` (lock, `[DONE]`, closing, forced stop), `providers/*` (`end_after`), `views.py` webhook, serializers; frontend controller, `CallScreen`, `VoicePanel`, i18n.
6. Async report: `triage/tasks.py`, `report_prompt.md`, `workflow/tasks.py` route, summary page polling.
7. Routing: `Appointment.triage_level` migration and serializer, `triageRoute.ts`, summary page blocks, queue badge and sort.
8. Referral fixes (section 6) with migration for nullable `sender_practitioner`.

## 9. Verification

- Backend: `cd backend && ../.venv/bin/python -m pytest -q` against Postgres. New tests: retrieval (vector, full-text fallback, unapproved and non-READY excluded, threshold) with the embedding call mocked; ingestion (resume, duplicate hash, scanned PDF, failure state); knowledge admin permissions and audit; interview budget (`[DONE]` ignored before 4, forced close at 10, emergency still wins, concurrent turns serialised); async report status and level never downgraded; appointment level snapshot; referral PATCH, create, emergency and generate-draft permissions; no patient name in the draft prompt; `test_masterplan_urls.py` and `test_contract.py` updated.
- Frontend: `cd frontend && npm test && npx tsc --noEmit && npm run lint:tokens && npm run tokens:check && npm run budgets:check`; tests for `triageRoute`, call-screen finish and progress, summary polling, knowledge page states.
- Manual: upload a small PDF as platform admin, watch it reach READY, test-search, approve; run one Bangla text session and one Vapi call to completion, confirm the call ends itself within the budget and the summary appears; say a red-flag phrase and confirm the instruction is fully spoken before the call ends; request an appointment from a HIGH session and confirm the queue order.

## 10. Risks and things not included

- Local SQLite data is not migrated: re-run the seed and re-ingest the book (`db.sqlite3` is left untouched).
- Embedding 9,796 passages is about 100 batch calls; a free-tier key may hit rate limits, which is why ingestion is resumable. `GEMINI_API_KEY` becomes required even when chat runs on Cerebras.
- Sending text to Google and Cerebras conflicts with SECURITY §8.3 ("model endpoints are internal") until the written data-processing review exists; recorded under Q-12, not resolved here.
- A 238 MB upload through the Next.js dev proxy may fail; nginx serves `/api` directly in deployment, and the management command remains for very large files.
- Clinical content stays placeholder: red-flag rules, question checklist, level thresholds, similarity threshold, emergency wording (Q-06). The pilot-readiness check keeps failing on them by design.
- Not included: webhook replay protection (SECURITY §8.1), MinIO storage backend (D-06), OCR of scanned books, guest-triage policy (Q-03), self-care or medicine advice (Q-06).
