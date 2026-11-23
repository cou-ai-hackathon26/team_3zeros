# Medi Waypoint — Product & UX Audit

> **BLUF:** The product is well specified and the backend follows the spec.
> The frontend is a clickable mock: 18 of 22 routes render only hardcoded data, no
> screen authenticates, no screen reads the user's role, and one stylesheet
> serves every page. The visual weakness is a symptom. The root causes are
> (1) no data layer in use, (2) no session or role awareness, (3) no component
> layer between tokens and pages, and (4) a home page built as a sitemap for
> developers instead of an entry point for patients. This document records
> the evidence. The other six documents in this folder define the fix.

Audit date: 2026-11-23, at commit `034c0bd`. Paths are relative to the
repository root. Everything here was read from the repository; nothing was
run, because `frontend/node_modules` is not installed.

Related documents: [AUTH_RBAC_ARCHITECTURE.md](AUTH_RBAC_ARCHITECTURE.md),
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md),
[UI_COMPONENT_LIBRARY_STRATEGY.md](UI_COMPONENT_LIBRARY_STRATEGY.md),
[APPLICATION_DESIGN_ARCHITECTURE.md](APPLICATION_DESIGN_ARCHITECTURE.md),
[LANDING_PAGE_ARCHITECTURE.md](LANDING_PAGE_ARCHITECTURE.md),
[REDESIGN_IMPLEMENTATION_PLAN.md](REDESIGN_IMPLEMENTATION_PLAN.md).

---

## 1. What the product is

Source: `MASTERPLAN.md` §2.

Medi Waypoint is a web platform for Bangladesh that takes a patient from a
first symptom to a suitable doctor, carries the record between providers with
the patient's consent, and returns the referral outcome to the doctor who
referred them.

| Journey | Steps |
|---|---|
| Patient | Bangla or English voice (or text) triage in the browser → reviewable summary → find a doctor → request an appointment → doctor decides → status visible to the patient |
| Clinical | Record visit → upload reports → verify OCR values → review AI referral draft → patient consents → sender approves and sends → receiver acknowledges or declines → receiver records outcome → outcome returns → referral closes |
| Emergency | Upazila facility submits a five-field emergency referral (online or queued offline, with a printed slip) → district hospital acknowledges → outcome returns |

Rules that constrain every design decision (`MASTERPLAN.md` §2.1): AI never
diagnoses or sends (INV-7); buttons come only from server `allowed_actions`;
consent is separate from doctor approval (INV-10); nothing is shown as
complete before its FHIR write succeeds (INV-12); capacity is never shown as
live (INV-14); emergency transfer is never blocked (INV-16).

Stack: Next.js 15 App Router, React 19, TypeScript; Django + DRF with session
cookies and CSRF on the same origin.

---

## 2. Audiences and personas

Roles are the five codes in `MASTERPLAN.md` §4.1. No other role exists.

| Persona | Role code | Context | Goal | Main pain today |
|---|---|---|---|---|
| **Patient** (primary) | `patient` | Adult on a low- or mid-range Android phone, mobile data, often unwell or worried, Bangla first, varied literacy | Say what is wrong, be told plainly if it is an emergency, reach a suitable doctor, know what happens next | Home page shows staff tools and jargon; no real sign-in; no single place that says "this is your next step" |
| **Clinician** (primary) | `clinician` | Doctor at an upazila complex, district hospital or private chamber; interrupted; shared desktop or own phone | Clear a queue of decisions quickly and without mistakes | Eight flat nav items, several pointing at one hardcoded patient; queue tabs do not filter; no keyboard flow across panes |
| **Facility staff** (secondary) | `facility_staff` | Scheduler, coordinator or emergency desk | Manage slots, acknowledge referrals, create emergency referrals, depending on granted permissions | Sees the same UI as a doctor; nothing reflects their narrower permissions |
| **Facility admin** (secondary) | `facility_admin` | Maintains directory, slots, capacity reports and staff | Keep facility data current | Four stub pages in English only; staff and schedule endpoints return empty lists |
| **Platform admin** (secondary) | `platform_admin` | Operates the platform, no clinical data access | Configure facilities, read audit metadata | No dedicated UI; shares the facility-admin stubs |

---

## 3. Interaction priorities

| Class | Interactions | Design consequence |
|---|---|---|
| Trust-sensitive | Microphone permission and triage disclosure; consent to share records; sign-in; the emergency screen; AI draft vs clinician-verified content | State plainly what will happen before the action; equal-weight "share / don't share"; draft content visibly different from verified |
| Minimal friction | Starting triage; emergency referral (five fields, works offline); accepting or declining a queue item; OTP entry | One primary action per screen; no optional fields in the way; keyboard paths for clinicians |
| Must never mislead | "Sent" before FHIR sync; capacity shown as live; AI text shown as a doctor's words | `SyncBadge` states, dated capacity text, "automated guide" wording stay mandatory |

---

## 4. Route inventory

All 22 `page.tsx` files under `frontend/src/app/[locale]/`.
"Data" column: **mock** = hardcoded constants only; **partial** = some real API
calls.

### 4.1 Public

| Route | Intended purpose | Primary action | Data | Defects |
|---|---|---|---|---|
| `/` | Entry point | Start triage | mock | Not a landing page. Mixes a patient home with a developer sitemap: links titled "Clinician 3-Pane Queue Workspace", "Report OCR Verification Split View", and hardcoded IDs (`appt-101`, `req-1`, `ref-0104`, `pat-1`, `doc-1`). Fake counts ("2", "4", "1 pending"). Does not explain the product, who it is for, or why to trust it |
| `/login` | Sign in | Send OTP / Sign in | mock | Never calls `/auth/*`. Submitting only reveals the next field. No errors, no loading, no redirect, no resend, no lockout message. Tabs are filter chips with `role="tab"` but no tab panel. Shows "(Q-13)" to users |

### 4.2 Patient

| Route | Intended purpose | Primary action | Data | Defects |
|---|---|---|---|---|
| `/triage` | Voice or text triage | Allow microphone / type | partial | Works against the API through `voice/controller.ts`. Shows a clinician-style "Live Clinical Intake Draft" to patients. Two competing CTAs below the panel. Hardcoded emergency placeholder text in the page |
| `/triage/session/[id]` | Resume a session | — | partial | Re-exports `/triage`; the `id` param is ignored |
| `/triage/summary/[id]` | Review and confirm summary | Confirm summary | partial | Reads `sessionStorage` first, then the API; raw `fetch` bypasses the API client (no CSRF header, no idempotency key) |
| `/doctors` | Find a doctor | Request appointment | mock | Four hardcoded doctors. Fetches `/directory/practitioners` only to copy IDs onto the mock rows. "Request appointment" is a link to `/appointments/appt-101`; no `POST /appointments`. Area filter is a static label. Shows an appointment tracker before any appointment exists |
| `/appointments` | List own appointments | Open one | mock | Two hardcoded rows; counts hardcoded in filter labels |
| `/appointments/[id]` | Track one appointment | Cancel (if allowed) | mock | Ignores `id`; local state fakes the transition |
| `/consents/[requestId]` | Decide on sharing | Share / Don't share | mock | Ignores `requestId`; shows "(INV-10)" to patients. No consent list page exists although `GET /consents` does, so the nav links to `/consents/req-1` |
| `/reports` | View own reports | Open a report | mock | Shows "(Q-11)" to patients |

### 4.3 Clinician and staff

| Route | Intended purpose | Primary action | Data | Defects |
|---|---|---|---|---|
| `/dashboard` | Decision queue | Accept / decline / propose | mock | Two hardcoded items; four tabs change a state variable that nothing reads; tab counts hardcoded; patient context pane is static text; `allowedActions` hardcoded, which defeats the contract in `FRONTEND.md` §6 |
| `/referrals/incoming` | Receiver queue | Open referral | mock | Separate page duplicating a dashboard tab |
| `/referrals/outgoing` | Sender queue | Open referral | mock | Same |
| `/referrals/new` | Create draft | Save draft | mock | Patient is hardcoded; no patient or encounter selection; no `POST /referrals` |
| `/referrals/[id]` | Referral workspace | Next allowed action | mock | Ignores `id`; local state machine imitates the server |
| `/patients/[id]` | Chart | — | mock | Ignores `id`; shows "(INV-13)" in a heading |
| `/patients/[id]/reports/[docId]/verify` | Verify OCR values | Confirm values | mock | Hardcoded fields; document URL points to an endpoint that does not exist (`/documents/doc-1/content`) |
| `/emergency` | Emergency referral, offline-capable | Save and send | partial | Real IndexedDB queue (`offline/queue.ts`). The most complete screen. Reachable by any visitor in development because the guard is off |

### 4.4 Admin

| Route | Intended purpose | Primary action | Data | Defects |
|---|---|---|---|---|
| `/facility` | Directory data | Save | mock | English only; one text field; "saved" is local state |
| `/schedules` | Slots | — | mock | Static stub |
| `/capacity` | Capacity reports | Submit report | mock | Static stub |
| `/staff` | Staff accounts | — | mock | Two hardcoded people; lists a permission (`referral.approve`) that appears nowhere in the backend |

### 4.5 Screens the product needs that do not exist

Landing page; patient home (signed in); consent list (`GET /consents`);
notifications (`GET /notifications`); MFA step as its own state; signed-out,
session-expired and not-authorised screens; `not-found` and `error`
boundaries; clinician patient search (`GET /patients?q=`); profile and
language preference.

---

## 5. Root causes

| # | Root cause | Evidence | Effect the user sees |
|---|---|---|---|
| R1 | **No data layer in use.** Six installed dependencies are imported nowhere in `frontend/src`: `@tanstack/react-query`, `next-intl`, `react-hook-form`, `zod`, `@radix-ui/*`, `motion` | `grep` for each import returns no files. `api/client.ts`, `api/queries/index.ts` (query keys only) and `api/ws.ts` exist but pages do not use them | Every screen is a static picture. No loading, empty or error state exists because nothing can load, be empty or fail |
| R2 | **No session or role awareness.** | `SessionProvider` is mounted with no `initialMe` and never calls `GET /auth/me` (`auth/session.tsx`). Only `(clinician)/layout.tsx` calls `useSession()`, and only for the facility label. `me.roles` and `me.permissions` are read nowhere. `middleware.ts` applies its redirect only when `NODE_ENV === "production"` | Everyone sees a Patient / Clinician / Admin switcher. "Sign in" is always shown. The facility switcher lists two hardcoded facilities |
| R3 | **No component layer.** | `app/[locale]/screens.module.css` is 716 lines shared by all 22 pages. `.filterChip` is used as tab, filter, link button, `<select>` skin and sign-out button. There is no Button, Input, Field, Tabs, Table, Dialog, EmptyState or Skeleton component. `auth/session.tsx` uses inline styles and a raw `rgba()` | Controls with different jobs look identical; hierarchy is flat; every page looks like the same list |
| R4 | **Home page built for developers.** | `(public)/page.tsx` lines 279–381 link to internal workspaces by implementation name | A patient's first screen offers "Offline Emergency Referral Mode & Transfer Slip" |
| R5 | **Navigation mirrors the file tree, not the work.** | `SiteNav.tsx` `CLINICIAN_LINKS` has eight items, three of them deep links to `pat-1` / `ref-0104`. No mobile pattern: the sub-nav scrolls horizontally | Clinicians cannot tell lists from single records; patients on phones get a scrolling strip |
| R6 | **Copy is inline and leaks internals.** | Roughly all page copy is `locale === "bn" ? … : …` in JSX; only shared labels are in `i18n/messages`. Question and invariant IDs ("Q-11", "Q-13", "INV-10", "INV-13") appear in user-facing text | Text cannot be reviewed by a Bangla writer or clinician as `UIUX_DESIGN.md` §7 requires; users see project jargon |
| R7 | **Identity applied as decoration.** | The route line appears on doctor discovery (no appointment exists yet), and as a nav bullet for every menu item (`StopNodeSvg`) | The one signature element stops meaning "progress of this case" |

The existing design document (`docs/UIUX_DESIGN.md`) is coherent. The
implementation did not follow it in the areas above. The decision to replace
the identity anyway was made by the product owner on 2026-11-23 and is
recorded in [REDESIGN_IMPLEMENTATION_PLAN.md](REDESIGN_IMPLEMENTATION_PLAN.md) §2.

---

## 6. Discrepancies between documents and code

Recorded, not resolved. Each needs an owner decision; IDs are local to this
audit.

| ID | Documents say | Code does | Severity |
|---|---|---|---|
| A-01 | `SECURITY.md` §8.1: provider master keys only on the server; browser gets short-lived single-session credentials | `frontend/next.config.ts` copies `ELEVENLABS_API_KEY` into `NEXT_PUBLIC_ELEVENLABS_API_KEY`; `voice/webrtcClient.ts` sends it as `xi-api-key` from the browser | **High.** The key ships in the JS bundle. Fix before any public deployment |
| A-02 | `SECURITY.md` §3.1, §3.4: real OTP, 5 attempts, lockout, rate limits; TOTP MFA | `accounts/services.py`: OTP is always `123456` (and is accepted for a phone that never requested one); MFA accepts `123456`; no throttling | **High** outside local development. Comments mark it as a development stub; nothing prevents it running in production settings |
| A-03 | `FRONTEND.md` §4: `useSession()` exposes memberships; a facility switcher is shown for users with several | `GET /auth/me` returns `roles`, one `active_facility`, `permissions`. No membership list. `POST /auth/active-facility` returns `{message, active_facility_id}`, but `session.tsx` stores that response as the whole `me` object | Medium. The switcher cannot be built, and switching corrupts client state |
| A-04 | `MASTERPLAN.md` §4.1: patients have role `patient` | `verify_phone_otp_and_login` creates a `User` only. `PatientAccount` is created nowhere in `backend/apps`, and `get_user_roles` adds `patient` only when it exists | **High** for the patient flow: a new patient signs in with `roles: []` |
| A-05 | `/admin/*` is for `facility_admin` (own facility) and `platform_admin` | `organizations/views.py` `_require_admin_role` filters `memberships` on `active=True` (no such field on `Membership`) and reads `user.is_platform_admin` (no such attribute; the relation is `platform_admin`) | **High.** As written, every non-superuser call raises a field error; platform admins who are not superusers are not recognised. To be confirmed by running the backend tests |
| A-06 | `MASTERPLAN.md` §6.3 lists `/admin/facilities/*`, `/admin/staff/*`, etc. as management endpoints | Only `GET` list views exist; schedules and staff return empty lists | Medium. Admin screens can be designed but not completed |
| A-07 | `SECURITY.md` §3.1: no self-service clinician sign-up; clinicians are created by facility admins | No registration, password reset, email verification or profile endpoints exist for any role | Design input. See [AUTH_RBAC_ARCHITECTURE.md](AUTH_RBAC_ARCHITECTURE.md) §6 |
| A-08 | `FRONTEND.md` §4: middleware redirects unauthenticated users | Redirect is skipped unless `NODE_ENV === "production"`; `/triage` and `/doctors` are not in the protected list (consistent with open question Q-03) | Low, but hides auth bugs during development |
| A-09 | `FRONTEND.md` §5: all unsafe requests go through `api/client.ts` (CSRF, idempotency key) | `voice/controller.ts` and `triage/summary/[id]/page.tsx` use raw `fetch` | Medium. Those posts will fail CSRF once real sessions are used |
| A-10 | `FRONTEND.md` §2: styling reads tokens only; lint blocks hex colours | Inline styles and `rgba(22, 48, 42, 0.45)` in `auth/session.tsx` | Low |
| A-11 | Permission strings on `Membership` (`SECURITY.md` §4.1) | Strings found in backend code and tests: `schedule.manage`, `referral.acknowledge`, `referral.create`. `emergency.create` is named in `MASTERPLAN.md` §4.2 only. `referral.approve` appears only in the mock staff page | Medium. There is no canonical permission list |
| A-12 | `VoicePanel` should offer language, captions, End and "Type instead" (`UIUX_DESIGN.md` §5) | `VoicePanel` also exposes provider configuration (`providerConfig`, `onUpdateProvider`) | Low. Developer control in a patient screen |
| A-13 | `SECURITY.md` §3.3: idle and absolute session timeouts per role | No idle-timeout middleware or session-age setting exists in `backend/config/settings` or `backend/apps` | Medium. The frontend countdown would be cosmetic until the server enforces it |
| A-14 | `SECURITY.md` §6.4: minimise stored triage data; `MASTERPLAN.md` §6.1: no credentials in browser storage | `voice/controller.ts` writes the triage draft (symptom text) to `sessionStorage` (`mw_triage_draft`) and the voice provider configuration, which can include an ElevenLabs API key, to `sessionStorage` (`mw_voice_provider_cfg`) | Medium. Health text and a credential persist in tab storage on shared devices |

A-01, A-02, A-04 and A-05 are defects outside the scope of a visual redesign.
They are listed because the redesigned auth and admin screens cannot work
until they are fixed.

---

## 7. What is sound and should be kept

| Asset | Why keep it |
|---|---|
| `src/state/actions.ts` (action registry) and `src/state/routes.ts` (state → stop mapping) | Encode `MASTERPLAN.md` §5 correctly and are tested. The new tracker reuses the mapping |
| `src/api/client.ts`, `api/schema.d.ts`, `api/queries/index.ts`, `api/ws.ts` | Correct contract plumbing; simply unused |
| `src/offline/*` (encrypted queue, slip, provisional code) | Works and is tested |
| `src/voice/controller.ts`, `textClient.ts` | Session control logic; presentation is separate. (`webrtcClient.ts` needs the A-01 fix) |
| `src/i18n/*` and the state-label completeness test | Guarantees every state has a label in both languages |
| Token pipeline: `tokens.json` → `build-tokens.mjs` → CSS, plus `check-contrast.mjs` | Right mechanism; values and output format change |
| Behavioural rules in `docs/UIUX_DESIGN.md` | Emergency red reserved; emergency screen without motion; draft marked by pattern and word, not colour; status never by colour alone; copy rules in §7; accessibility in §8 |

---

## 8. Recommendations

1. Separate the **public landing page** from the **signed-in patient home**.
   Remove every staff link and hardcoded ID from public and patient screens.
2. Load the session once (`GET /auth/me`), and derive shell, navigation and
   action visibility from `me.roles` and `me.permissions` through one module.
3. Give each audience its own shell: patient (phone first, bottom navigation),
   clinical workspace (sidebar, queue and detail), administration (sidebar,
   tables).
4. Replace `screens.module.css` with a component library built on tokens:
   one Button, one Field, one Tabs, and so on, each with defined variants.
5. Wire screens to the API with TanStack Query so loading, empty, error and
   pending-sync states exist and can be designed.
6. Move all copy to message files; remove project IDs from user-facing text.
7. Use the progress tracker only where a case exists and its state is real.
8. Resolve A-01 to A-05 with the backend owner before the auth, patient and
   admin phases start.
