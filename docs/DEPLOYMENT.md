# Medi Waypoint — Deployment and Operations Plan

> **BLUF:** The pilot runs as Docker containers on Bangladesh-hosted servers,
> managed with Docker Compose (no Kubernetes needed yet). Only the reverse
> proxy is public; it serves the Next.js app and the Django API on one origin.
> Everything else (PostgreSQL, HAPI FHIR, Redis, MinIO, workers, AI/OCR) sits
> on private networks. CI builds, tests and scans every change; staging must
> pass end-to-end tests before production. Backups are only trusted after a
> restore test succeeds.

---

## 1. Read first

- Settled hosting decisions: [MASTERPLAN.md §8.1](../MASTERPLAN.md#81-settled-technology-decisions)
  (D-01, D-04–D-07, D-09).
- Security requirements this deployment must satisfy:
  [SECURITY.md §9](SECURITY.md#9-infrastructure-security).
- Process model per service: [BACKEND.md §7](BACKEND.md#7-background-work).

---

## 2. Topology

```text
Internet
  │ 443 only
  ▼
[ edge: Nginx (TLS, WAF rules, rate limits, security headers) ]
  │   /            → web (Next.js, node server)
  │   /api/, /ws/  → api (Django ASGI, uvicorn workers)
  │
──┼──────────── app-net (private) ────────────────────────────
  │  api      worker-default  worker-fhir  worker-notify
  │  worker-ocr  worker-ai  beat (scheduler, exactly one)
  │
──┼──────────── data-net (private, no internet egress) ───────
     postgres (app DB + pgvector)   hapi + hapi-postgres
     redis    minio
     (clamav runs on app-net with egress allow-listed to its signature mirror)
──────────── ai-net (private) ────────────────────────────────
     inference (LLM, OCR)      # only api + worker-ai + worker-ocr can reach it
──────────── egress (allow-list via proxy) ───────────────────
     SMS gateway, voice provider (Q-05), OS/package mirrors
```

- `web` reaches `api` over app-net for server-side fetches; browsers reach
  `api` only through the edge on the same origin.
- `hapi` is never exposed through the edge. External FHIR access (future)
  goes through Django's `/api/v1/integrations/fhir/*` (Architecture §8).
- Outbound internet is denied by default; egress allow-list per service.

---

## 3. Services

| Service | Image | Replicas (pilot) | Notes |
|---|---|---|---|
| edge | nginx (pinned) | 1 (+ standby) | TLS certs, `client_max_body_size 25m`, WebSocket upgrade on `/ws/` |
| web | `medi-web` (Next.js standalone build) | 2 | No secrets except public config |
| api | `medi-api` | 2 | `uvicorn config.asgi:application`, health `/api/v1/health/` |
| worker-default / fhir / notify | `medi-api` | 1 each | `celery -A config worker -Q <queue>` |
| worker-ocr / worker-ai | `medi-api` | 1 each | Concurrency 1–2; long timeouts |
| beat | `medi-api` | exactly 1 | Celery beat; a second instance would duplicate jobs |
| postgres | postgres 16 + pgvector | 1 primary (+ streaming replica when hardware allows) | Separate DB users per service |
| hapi | hapiproject/hapi (pinned R4 release) | 1 | Validation on write; own PostgreSQL |
| hapi-postgres | postgres 16 | 1 | Separate from app DB |
| redis | redis 7 | 1 | Broker + cache; AOF on; `requirepass` |
| minio | minio (pinned) | 1 (erasure-coded set when disks allow) | Private buckets, SSE on, versioning on `documents` |
| clamav | clamav | 1 | Scans uploads; on app-net; `freshclam` egress allow-listed to signature mirror |
| inference | per Q-12 (e.g. vLLM / llama.cpp server; OCR engine) | 1 | GPU optional for pilot; size after model choice |

Images are built once in CI, tagged with the git SHA, and promoted unchanged
from staging to production.

---

## 4. Network and access

- Firewall: only 443 (and 80 → 301) on the edge host. SSH via bastion or VPN
  with key auth, no passwords, from named admin IPs.
- Docker networks as in §2; `internal: true` on data-net and ai-net.
- Admin interfaces (Django admin if enabled, MinIO console, HAPI UI,
  monitoring) bound to the admin VPN only.
- Inter-service auth: API → HAPI uses a service credential; HAPI rejects
  requests without it.
- TLS certificates: Let's Encrypt or the data center's CA; auto-renew with
  alert 14 days before expiry.

---

## 5. Configuration and secrets

- Twelve-factor config via environment variables.
- `local`: `.env` from `.env.example` (no real secrets).
- `staging` / `production`: secrets injected from an encrypted store (SOPS
  with age keys, or the hosting provider's secret manager if available).
  Decryption keys held by two named people.
- Required secrets: `DJANGO_SECRET_KEY`, DB passwords per service, Redis
  password, MinIO keys, HAPI service credential, SMS gateway key, voice
  provider key, audit export credential.
- Rotation: on staff departure and at least every 6 months.
- CI fails if a secret pattern appears in the repo (gitleaks) or in the
  frontend bundle (build output scan for known secret names).

---

## 6. Data, backups and restore

| Data | Backup | Frequency | Retention | Restore test |
|---|---|---|---|---|
| App PostgreSQL | `pg_basebackup` + WAL archiving (PITR) | Continuous + nightly base | 30 days (pilot; Q-07) | Monthly |
| HAPI PostgreSQL | Same | Same | Same | Monthly, together with app DB |
| MinIO documents | Bucket replication / versioned sync to second disk set or site | Hourly | 30 days of versions | Monthly |
| Audit export | Hash-chained daily file to separate bucket with write-once policy | Daily | Per policy | Quarterly verify chain |
| Redis | Not backed up (rebuildable); outbox lives in PostgreSQL | — | — | — |

- Backups encrypted (restic or pgBackRest encryption); keys stored separately.
- A copy is kept off the primary host, still inside Bangladesh.
- Restore drill restores app DB, HAPI DB and MinIO to the **same point in
  time** in an isolated environment and runs a consistency check: every
  `fhir_id` in the app DB resolves in HAPI, every `Document.storage_key`
  exists in MinIO. Results go in the pilot readiness report.

---

## 7. Observability

| Signal | Tool (self-hosted) |
|---|---|
| Metrics | Prometheus + Grafana (django-prometheus, celery exporter, postgres exporter, nginx exporter) |
| Logs | Loki (JSON logs, PHI-redacted at source, SECURITY §7) |
| Traces | OpenTelemetry → Tempo (sample 10%) |
| Errors | Self-hosted Sentry, PII off |
| Uptime | Blackbox exporter on `/api/v1/health/` and `/` |

Alerts (initial):

| Alert | Condition |
|---|---|
| API errors | 5xx rate > 2% for 5 min |
| FHIR sync backlog | `fhir_sync_status=PENDING` older than 10 min > 0, or any `FAILED` |
| Outbox lag | Oldest undispatched event > 2 min |
| Emergency referral unacknowledged | Any `ESCALATED` referral (also shown in-app) |
| Queue depth | `ocr`/`ai` > 50 for 15 min |
| Voice failures | Session connect failure rate > 10% for 15 min |
| Backups | Last successful base backup > 26 h |
| Disk | > 80% on any data volume |
| Certificates | Expiry < 14 days |

Dashboards show counts and latencies, not patient-level data
(Architecture §9.3).

---

## 8. Environments

| Env | Purpose | Data | Deploy trigger |
|---|---|---|---|
| local | Development | Synthetic seed (`make seed`) | Developer |
| ci | Ephemeral test stack | Synthetic fixtures | Every PR |
| staging | Integration, E2E, clinical review, demos | Synthetic only | Merge to `main` |
| production (pilot) | Pilot facilities | Real data only after Phase 9 rehearsals pass | Manual promotion of a staging-verified SHA |

Local stack: `docker compose -f compose.yml -f compose.local.yml up` starts
everything except inference (mock adapter by default). A developer must be
able to start the stack from the README (Project Plan Phase 1 exit).

---

## 9. CI/CD pipeline

Runs on every pull request; deploy jobs on `main` and tags.

1. Lint and format: ruff, black, mypy (backend); eslint, prettier, tsc, stylelint (frontend).
2. Secret scan (gitleaks).
3. Backend unit + contract tests (BACKEND §14), including transition tables vs MASTERPLAN.
4. Migration check: `makemigrations --check`, and migrate a copy of the previous release's schema forward.
5. OpenAPI schema generation → frontend `api:types` → fail on diff (MASTERPLAN D-12).
6. Frontend unit/component tests; Storybook build; visual regression.
7. Integration tests with PostgreSQL, Redis, MinIO, HAPI containers; FHIR profile validation.
8. Production builds of both images.
9. Dependency and image scans (pip-audit, npm audit, Trivy); fail on critical.
10. Deploy to staging (on `main`), run Playwright E2E + axe, run smoke tests.
11. Production: manual approval, deploy the same image SHA.

Branching: trunk-based with short-lived branches; PRs require one review and
green CI.

---

## 10. Release procedure

Order matters because the API depends on schema and HAPI:

1. Announce window to pilot facilities if downtime > 5 min is possible.
2. Confirm last backup is recent; take a manual snapshot.
3. Run **expand** migrations (additive only) with the old API still running.
4. Deploy HAPI changes (if any) and verify `metadata` endpoint.
5. Deploy `api`, workers, then `beat` (stop old beat before starting new).
6. Deploy `web`.
7. Smoke test: sign-in, directory, create test appointment on a test
   facility, FHIR write round-trip, WebSocket event.
8. Run **contract** migrations (removing old columns) only in a later release,
   once no running code uses them.

Rollback: redeploy the previous image SHA. Because migrations are
expand-then-contract, the previous release runs against the expanded schema.
A migration that cannot be rolled back this way requires a written plan and
a fresh backup before running.

---

## 11. Capacity and load testing

- Pilot sizing starts from assumptions agreed with facilities (number of
  doctors, daily requests, concurrent voice sessions). Record them in the
  load test plan; do not publish response-time promises before measuring
  (Architecture §10).
- k6 scenarios: patient discovery and request burst, clinician queue polling
  with WebSocket, referral lifecycle, document uploads, concurrent voice
  session creation (with a mock provider).
- Starting hardware for pilot (to validate with load tests): 2 app hosts
  (8 vCPU, 16 GB), 1 data host (8 vCPU, 32 GB, SSD RAID1), inference host per
  Q-12.

---

## 12. Pilot operations

- Runbooks: restart a stuck worker, replay outbox, retry FAILED_TO_SYNC,
  revoke a device (once Q-09 enables device enrollment), disable voice (`FEATURE_VOICE_TRIAGE=false`), rotate a
  secret, restore from backup.
- On-call rota for pilot hours with escalation contacts per facility.
- Status page or SMS broadcast for planned downtime.
- Weekly review of alerts, sync failures, escalations and user feedback with
  clinicians (Project Plan Phase 9).

---

## 13. Phase checklist

| Phase | Deployment deliverables | Exit proof |
|---|---|---|
| 1 | Compose files, local stack, staging host, edge with TLS, CI steps 1–8 | Stack starts from README; staging reachable over HTTPS |
| 4 | MinIO with SSE + versioning, ClamAV | Upload scanned and stored privately |
| 6 | Inference service on ai-net | Only api, worker-ai and worker-ocr reach inference |
| 7 | Egress allow-list for voice provider | Provider reachable only from api |
| 8 | Backups, PITR, restore drill, monitoring + alerts, load test, runbooks | Restore drill report; alert test fired |
| 9 | Production environment, on-call, pilot ops | Go/no-go checklist signed |
