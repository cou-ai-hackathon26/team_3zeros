# Medi Waypoint — Frontend Plan

> **BLUF:** One Next.js (App Router) + TypeScript app serves the patient,
> clinician and facility-admin areas as route groups. It talks only to the
> Django API on the same origin, using session cookies and CSRF. API types are
> generated from the backend's OpenAPI schema, buttons come only from the
> server's `allowed_actions`, and state labels come from i18n keys, so the
> frontend cannot invent workflow rules. Voice triage, the offline emergency
> queue and the design system (see UIUX_DESIGN.md) are the three areas with
> their own client-side logic.

---

## 1. Read first

- Shared contracts: [MASTERPLAN.md](../MASTERPLAN.md) §4 (roles), §5 (states),
  §6 (API), §7 (shapes). If this file disagrees with MASTERPLAN, MASTERPLAN
  wins.
- Visual design, components, motion and copy: [UIUX_DESIGN.md](UIUX_DESIGN.md).
- What the backend guarantees: [BACKEND.md §16](BACKEND.md#16-what-the-frontend-relies-on-handoff).
- Browser security rules: [SECURITY.md](SECURITY.md) §3, §7.

---

## 2. Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | Next.js (App Router), React, TypeScript `strict` | D-02 |
| Server data | TanStack Query | Cache, refetch-on-focus, polling fallback for events |
| API types | `openapi-typescript` + `openapi-fetch` from `/api/v1/schema/` | D-12; compile error on contract drift |
| Forms | React Hook Form + Zod (schemas generated from OpenAPI where possible) | Client validation mirrors server; server remains authoritative |
| i18n | `next-intl`, locales `bn`, `en` | Server and client components, ICU plurals, Bangla numerals |
| Styling | Tailwind CSS v4 with a theme generated from `tokens.json` (default palette removed) | D-14. Tokens are the single source; a class that bypasses them does not exist. `lint:tokens` blocks arbitrary colour values |
| Motion | `motion` (Framer Motion) for component transitions, View Transitions API for route transitions | docs/redesign/DESIGN_SYSTEM.md §5 |
| Icons | `lucide-react` | docs/redesign/DESIGN_SYSTEM.md §7 |
| Offline | Service worker (Serwist) + IndexedDB (`idb`) + WebCrypto | Emergency queue only (§9) |
| Testing | Vitest + Testing Library, Playwright, `@axe-core/playwright`, Storybook | §12 |

Components are shadcn/ui source files (Radix primitives) copied into
`src/components/ui` and restyled with our tokens; no package component
library with its own visual language (MUI, Chakra). Effect components for the
public landing and auth pages are copied into `src/components/marketing` and
limited to the list in
[redesign/UI_COMPONENT_LIBRARY_STRATEGY.md](redesign/UI_COMPONENT_LIBRARY_STRATEGY.md) §4;
only `(public)` and `(auth)` may import them (enforced by lint).

---

## 3. Project structure

```text
frontend/
  app/
    [locale]/
      (public)/              # landing, about, emergency info
        page.tsx             # landing (redesign/LANDING_PAGE_ARCHITECTURE.md)
      (auth)/                # auth layout: login, login/staff (+MFA step),
                             # login/choose, signed-out, not-authorised, access;
                             # flagged: welcome, login/staff/reset, verify-email
      (patient)/
        home/                # signed-in patient home
        triage/              # start, session/[id], summary/[id]
        doctors/             # discovery
        appointments/        # list, [id]
        consents/            # list, [requestId]
        reports/
        notifications/
        layout.tsx           # PatientShell; requires patient session (Q-03 may allow guest on /triage)
      (clinician)/
        dashboard/           # queue + detail panes
        patients/            # search, [id] chart (results timeline, test ordering advisory, active lists, printable summary), [id]/reports/[docId]/verify
        referrals/           # index (Incoming / Outgoing tabs), new, [id], incoming, outgoing
        emergency/           # emergency referral mode (offline-capable)
        notifications/
        layout.tsx           # WorkspaceShell; requires clinician/staff membership
      (admin)/
        facility/            # directory, departments, services
        schedules/
        capacity/
        staff/               # staff accounts, access control (D-16), access requests (D-19)
      layout.tsx             # html lang, fonts, providers
  src/
    api/
      schema.d.ts            # GENERATED — do not edit
      client.ts              # openapi-fetch instance, CSRF, idempotency, error mapping
      queries/               # one file per resource: hooks + query keys
    auth/                    # me.ts (useMe), access.ts, nav.ts, RequireArea, IdleTimeout
    state/                   # state → i18n key + tracker stop/holder mapping
    voice/                   # provider adapters, mic preflight, session controller
    offline/                 # emergency queue, sync, slip
    components/
      ui/                    # shadcn/ui source restyled with tokens
      marketing/             # landing/auth effects only
      (product components: HandoverTracker, StatusBadge, ActionBar, …)
    tokens/                  # tokens.json → generated theme CSS
    i18n/messages/{bn,en}.json
  middleware.ts              # locale + coarse route-group guard (redirect only)
```
Route additions are specified in
[redesign/APPLICATION_DESIGN_ARCHITECTURE.md](redesign/APPLICATION_DESIGN_ARCHITECTURE.md) §1.1 and
[redesign/AUTH_RBAC_ARCHITECTURE.md](redesign/AUTH_RBAC_ARCHITECTURE.md) §3.1. All previously existing URLs are kept.

Server Components fetch read-only data where it helps first paint (directory,
static content). Anything user-specific and interactive (queues, workflow
detail, triage) uses Client Components with TanStack Query, because it must
refetch on events.

---

## 4. Authentication in the browser

- The reverse proxy serves both Next.js and `/api/*` on one origin
  (DEPLOYMENT §2), so cookies are first-party and no CORS is needed.
- Login, registration and MFA pages post to `/api/v1/auth/*`. Django sets the session
  cookie (`HttpOnly`). JavaScript never sees a token.
- CSRF: on app load, `GET /api/v1/auth/me` returns and sets the CSRF cookie;
  `api/client.ts` sends it as `X-CSRFToken` on every unsafe method.
- `middleware.ts` only redirects obviously unauthenticated users to sign-in
  based on cookie presence. It is not an authorization check; the API is
  (INV-9).
- `useMe()` (`src/auth/me.ts`, TanStack Query over `GET /auth/me`) exposes
  roles, the active facility and permissions; memberships are not returned
  today (MASTERPLAN §8.3 G-4). `src/auth/access.ts` is the only module that
  names role or permission strings and derives areas, navigation and home
  route. Facility switch calls `POST /auth/active-facility` and clears the
  query cache. Hiding navigation is convenience only; the API decides (INV-9).
  See [redesign/AUTH_RBAC_ARCHITECTURE.md](redesign/AUTH_RBAC_ARCHITECTURE.md) §5.
- On `401`, clear cache and redirect to sign-in with a return path. On
  `mfa_required`, route to MFA.
- Idle timeout warning for clinician sessions (SECURITY §3.3) with a visible
  countdown and "Stay signed in".

---

## 5. API client and type safety

```ts
// src/api/client.ts (shape, not final code)
const api = createClient<paths>({ baseUrl: "/api/v1", credentials: "same-origin" });
api.use({
  onRequest({ request }) {
    if (isUnsafe(request.method)) {
      request.headers.set("X-CSRFToken", readCsrfCookie());
      if (!request.headers.has("Idempotency-Key")) request.headers.set("Idempotency-Key", crypto.randomUUID());
    }
    request.headers.set("Accept-Language", currentLocale());
  },
  async onResponse({ response }) { if (!response.ok) throw await toApiError(response); },
});
```

- `npm run api:types` regenerates `schema.d.ts` from the backend schema
  artifact. CI runs it and fails on a diff, so a backend contract change
  without frontend update fails the build.
- Idempotency key is created **once per user intent** (when the user presses
  the button) and reused for retries of that intent. A double click must not
  create two keys: buttons are disabled while the mutation is pending, and
  the key is stored in the mutation's variables.
- Mutations on existing objects send `If-Match: <version>`. On
  `412 stale_version`, refetch and show "This was updated by someone else.
  Review the latest version." without re-submitting.
- `ApiError` carries `code`, `fieldErrors`, `requestId`. Field errors bind to
  form fields; other codes map to i18n messages `error.<code>`. Unknown codes
  show the generic message plus `requestId` for support.

---

## 6. Rendering state and actions

The frontend never decides workflow rules.

- **Buttons:** `ActionBar` renders exactly the actions in `allowed_actions`.
  A known action without a configured UI (missing from the action registry)
  is a test failure, not a hidden button.
- **Action registry** (`src/state/actions.ts`) maps each MASTERPLAN §5 action
  to: label key, whether a reason is required (from MASTERPLAN), confirmation
  style, and the endpoint `POST …/actions/{action}`.
- **Labels:** `state.<entity>.<STATE>` i18n keys. A test asserts every state
  in MASTERPLAN §5 has a key in both `bn.json` and `en.json`.
- **Route stops:** `src/state/routes.ts` defines which states appear as stops
  on each `HandoverTracker` and which render as exception branches
  (redesign/DESIGN_SYSTEM.md §6.1).
- **Sync:** any object with `pending_action` or `fhir_sync_status` of
  `PENDING` shows `SyncBadge` with the pending action ("Sending…");
  `FAILED`/`FAILED_TO_SYNC` shows "Needs attention" with `retry_sync` if
  present in `allowed_actions`. A `202` response is shown as pending, never as
  done (INV-12). `423 sync_pending` means wait; the UI refetches instead of
  retrying the action (MASTERPLAN §5.8).
- **Route animation memory:** the last seen `(object id, state)` is stored in
  `sessionStorage`; the route draws forward only if the server state is newer.

---

## 7. Internationalization

- Locale is the first path segment (`/bn/...`, `/en/...`). Default: `bn` for
  public and patient routes, user preference for clinician routes.
- Patient language preference saved to profile when signed in.
- Message keys are namespaced: `state.*`, `action.*`, `error.*`, `triage.*`,
  `consent.*`, `emergency.*`.
- Clinical text (emergency instructions, red-flag prompts, consent wording)
  is **not** in the frontend message files. It is served by the backend from
  the approved rule set / policy version so the approved version is the one
  shown (Q-06, Q-07).
- Numbers and dates: `Intl.NumberFormat('bn-BD')` and `Intl.DateTimeFormat`
  with `Asia/Dhaka`. Vitals and lab values keep Latin digits in clinician UI
  for unambiguous entry; patient UI shows Bangla digits.
- Bangla input: accept Bangla and Latin digits in numeric fields; normalize to
  Latin digits before sending.
- Fonts: `next/font/local` with Anek Bangla and Anek Latin variable files,
  `unicode-range` subsetting, `font-display: swap`, preloaded for the active
  locale only.

---

## 8. Voice triage client

### 8.1 Flow

```text
Start screen → explainer + language → user accepts triage disclosure and presses "Allow microphone"
  → getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })
  → preflight: input level check (3 s), device picker if > 1 input
  → POST /triage/sessions (with triage_disclosure_version) → POST /triage/sessions/{id}/voice-credentials
  → provider adapter connects (WebRTC preferred) → live session
```

### 8.2 Provider adapter (browser side)

```ts
interface VoiceClient {
  connect(creds: ProviderCredentials, stream: MediaStream): Promise<void>;
  on(event: "state" | "caption" | "level" | "error", cb: Handler): Unsubscribe;
  setLanguage(lang: "bn" | "en"): void;
  pause(): void; resume(): void; end(): Promise<void>;
}
```

- One implementation per vendor (Q-05, starting with `PlaceholderVoiceClient` in
  `src/voice/placeholderClient.ts` as the Vapi swap-in boundary) plus
  `TextClient`, which implements the same interface over `POST /turns` so the UI
  has one code path.
- The browser receives captions and audio. It never receives or sends
  instructions to the provider's model. What the assistant says comes from
  the backend (BACKEND §8).
- `triage.emergency` (WebSocket) or an emergency response from `/turns`
  immediately: stops audio, ends the provider session, renders
  `EmergencyScreen` (UIUX §6.3). This handler has priority over every other
  UI state.

**Phone-call experience (D-22).** With `VOICE_PROVIDER=vapi` the client is
`src/voice/vapiClient.ts` (SDK loaded lazily). States: `ringing` (tap until the call starts,
with a generated double-beep ringtone) → `connected` → `listening` ⇄ `speaking`.
`components/VoiceCall/CallScreen` is the full-height mobile view: status line, timer,
`CallBlob` (glows with the real audio level; a still ring and level bar under reduced
motion), `CallCaptions` (spoken language large, machine translation small and labelled,
fetched from `POST /triage/sessions/{id}/translate`; one language if it fails), and
mute / end / type-instead buttons. If the server ends the call (emergency), the
controller reloads the session and shows `EmergencyScreen`.

**Report on the summary page (D-25).** `components/triage/ConsultationReport` shows
`summary.structured_fields.report`: priority, overview, what to do now, warning signs, possible
explanations (always labelled "not a diagnosis"), specialist, follow-up, document and page references,
a clinician-review notice, and the fixed disclaimer. An emergency instruction renders as an alert.

### 8.3 Failure handling

| Condition | Behavior |
|---|---|
| `getUserMedia` unsupported | Skip voice; open text mode with a one-line reason |
| Permission denied | Show browser-specific steps to enable, plus "Type instead" |
| No input level detected in preflight | "We can't hear you. Check your microphone or type instead." |
| Connection drop | State `reconnecting` for up to 10 s with backoff; then switch to text mode in the same session (conversation kept) |
| Provider unavailable (`503 provider_unavailable`) | Text mode |
| Tab hidden > 60 s | Pause and release the microphone; resume requires a user action |
| End pressed | Stop all tracks (`track.stop()`), call `/end`, show summary review if available |

Microphone tracks are always stopped when leaving the route.

---

## 9. Offline emergency referral (clinician area only)

### 9.1 Scope

Only `/[locale]/emergency` works offline (INV-16, Architecture §5.6). The
service worker precaches that route's shell and assets. No other patient data
is cached offline. The full chart is never stored offline.

### 9.2 Queue

- On submit, the form creates an item `{ idempotency_key, created_at_device,
  facility_id, payload }` and stores it in IndexedDB, encrypted with AES-GCM.
- Key handling `[⏳ ACK]` (depends on Q-09): a non-extractable WebCrypto key
  stored in IndexedDB, created by a signed-in staff user (on device
  enrollment if Q-09 adopts the `/devices/*` endpoints). This protects against casual file access, not against a fully
  compromised device; SECURITY §6.3 lists the residual risk.
- Sync: on `online` event, on app focus, and every 30 s while items exist.
  Sends `POST /referrals/emergency` with the item's `Idempotency-Key`.
  - `201/200` → `SYNCED`, delete local copy, show reference code.
  - `409 idempotency_conflict` → `CONFLICT`, show both versions to staff.
  - network / `5xx` → keep, backoff, `FAILED` badge after 3 attempts with
    "Will keep trying".
- Background Sync API used where supported; not relied on (unsupported on
  some browsers).
- Queue items not synced after 72 h show a persistent banner on the device.

### 9.3 Printed slip

- Printable immediately after local save, via a print stylesheet (UIUX §6.13).
- Offline items show a provisional code, which the server accepts as
  `provisional_code` (BACKEND §13). Proposed format, pending Q-09: facility
  short code + device-local sequence + date (for example `UHC12-0045-1121`).
  After sync the server code is shown and can be reprinted.

---

## 10. Design system implementation

### 10.1 Tokens

`src/tokens/tokens.json` is the single source for values in
[redesign/DESIGN_SYSTEM.md](redesign/DESIGN_SYSTEM.md) (three layers:
primitive, semantic, component). `build-tokens.mjs` compiles it to a Tailwind
v4 `@theme` block with the default palette removed, plus the shadcn semantic
variables. Components use token-backed classes only, never raw colour values.
`npm run lint:tokens` fails the build on colour literals and arbitrary
colour values outside the token file; the stylelint hex rule is retired when
the last CSS Module is removed.

### 10.2 Components

Built per redesign/DESIGN_SYSTEM.md §6 in Storybook with every state from that list, in both
locales. Key implementation notes:

- `HandoverTracker` (replaces `RouteLine`): segments and the holder line are
  derived from `src/state/routes.ts`; stops are `<li>` elements inside an
  `<ol>` for screen readers; decorative SVG is `aria-hidden`. Advance
  animation only when `shouldAnimateRouteAdvance` says the state is newer.
- `VoicePanel` live segment: `AnalyserNode` RMS level, smoothed, drawn on
  `requestAnimationFrame` capped at 30 fps; stops when hidden.
- `QueueList`: `AnimatePresence` for row exit; virtualization above 200 rows.
- `DraftBlock` → verified: border-style transition implemented as an SVG
  border overlay because CSS cannot animate `dashed` → `solid`.
- Route transitions: `document.startViewTransition` where supported,
  otherwise instant.

### 10.3 Checks

- Contrast checker script runs over the token pairs in redesign/DESIGN_SYSTEM.md §2.2 in CI.
- Visual regression on Storybook stories (Playwright screenshots) for both
  locales.
- `prefers-reduced-motion` stories for every animated component.

---

## 11. Performance budget (patient routes)

Target device: low-end Android on 3G-like conditions.

| Metric | Budget |
|---|---|
| JS on first load (patient home) | ≤ 170 KB gzipped |
| LCP on patient home | ≤ 2.5 s on throttled "Slow 4G" in Lighthouse |
| Fonts | Bangla subset preloaded; Latin loaded on demand in `bn` locale |
| Voice code | Loaded only on the triage route (dynamic import) |
| Images | None required on the critical path |
| JS on first load (public landing) | ≤ 200 KB gzipped (proposed; see redesign/LANDING_PAGE_ARCHITECTURE.md §8), effects loaded when their sections approach |

These are build checks, not claims about real-world speed (Architecture §10).

---

## 12. Testing

| Level | Covers |
|---|---|
| Unit (Vitest) | API error mapping, action registry, state→label completeness, offline queue state machine, digit normalization |
| Component (Testing Library + Storybook) | All UIUX §5 states, keyboard use, both locales |
| E2E (Playwright, against staging API with synthetic data) | Project Plan §8.3 list: registration/consent, mic granted/denied/unsupported/interrupted, appointment request + doctor decision, referral sender/receiver/outcome, report upload and access denial, mobile layout, Bangla rendering |
| Accessibility | axe on every E2E page; manual TalkBack + keyboard passes per release |
| Offline | Playwright `context.setOffline(true)` during emergency submit; replay twice; assert one server referral |

Microphone in E2E: Chromium `--use-fake-device-for-media-stream` with
recorded Bangla and English sample files (synthetic speakers only).

---

## 13. Phase checklist

| Phase | Frontend deliverables | Exit proof |
|---|---|---|
| 1 | App shell, locales, fonts, tokens, API client + type generation, sign-in, `me` | Authenticated call to `/auth/me` from staging |
| 2 | Patient sign-in and registration, discovery, admin directory screens | Discovery E2E by area and specialty |
| 3 | Appointment request, patient status route, clinician queue + decision | Concurrent request shows `slot_unavailable` message |
| 4 | Chart, report upload, verification split view | Guessed document URL shows not found |
| 5 | Referral workspace, consent sheet, incoming queue, outcome | Full lifecycle E2E, two browsers (sender, receiver) |
| 6 | Draft blocks with source chips, draft vs final diff view | Approve disabled until draft saved |
| 7 | Voice client, text client, emergency screen | Emergency case E2E stops session immediately |
| 8 | Offline emergency queue, slip printing | Offline replay test; slip print snapshot |
