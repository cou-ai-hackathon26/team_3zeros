# Medi Waypoint redesign: handover

Branch `redesign/handover` (not merged, not pushed). Plan and design docs are in
`docs/redesign/` (start with `REDESIGN_IMPLEMENTATION_PLAN.md`; its §1 table is the status board).
Everything below was verified against the repo at the last commit.

## State at a glance

| Phase | Status |
|---|---|
| 0 Governance (D-14, D-15, Q-14 to Q-17, doc edits) | Done, **awaiting lead developer approval** |
| 1 Tokens, Tailwind v4, fonts | Done. Font checks in DESIGN_SYSTEM §3.1 still open (need a browser, a phone, a Bangla reader) |
| 2 Components, Storybook, data layer | Done |
| 3 Auth, RBAC, shells | Built. Exit proof blocked by backend A-02, A-04 |
| 4 Landing page | Built with static final states. Effects E1 to E4 wait for Phase 8. Bangla is an unreviewed draft |
| 5 Patient app | Home, doctors, appointments, consents done. **Not done:** triage (blocked by A-01), reports and notifications (G-2), open-triage-session next step (G-6) |
| 6 Clinical workspace | Done (see "Phase 6 leftovers") |
| 7 Administration, 8 Effects, 9 Responsive pass, 10 Accessibility/security/regression | Not started |

Commit log is the record: `git log --oneline` (about 20 commits, newest first). The last commit may not
include this file and the trailing-slash fix; run `git status` first and commit them.

## How to run and verify

```
cd frontend
npm test                 # about 313 tests, all passing at last run
npx tsc --noEmit         # ignore stale `.next/types` errors; `rm -rf .next` clears them
npm run lint:tokens && npm run tokens:check
npm run content:check    # landing copy parity; add `-- --launch` to see launch blockers
npx next build           # read First Load JS per route
npm run storybook
```

Real-backend run (what found most backend defects). Never use the user's own server on port 8000 or
their `backend/db.sqlite3`:

1. Create a scratch settings module outside the repo: `from config.settings.local import *`, point
   `DATABASES` at a scratch sqlite file, and extend `CSRF_TRUSTED_ORIGINS` with `http://localhost:3100`
   and `http://127.0.0.1:3100`.
2. `PYTHONPATH=<scratch>:backend DJANGO_SETTINGS_MODULE=e2e_settings .venv/bin/python manage.py migrate`,
   then `seed_demo_data.py` (patient `+8801700000001`, OTP `123456`; clinician `doctor@demo.com`,
   `Password123!`), then `runserver 127.0.0.1:8001 --noreload`.
3. Build the frontend with `BACKEND_INTERNAL_URL=http://127.0.0.1:8001` (rewrites are read at build time),
   `npx next start -p 3100`.
4. Two sessions: use `localhost:3100` and `127.0.0.1:3100` (separate cookies). Chrome caches 301s, so
   after changing a redirect behaviour use a fresh URL or `cache: "reload"`.
5. `next build` shares `frontend/.next` with the user's `next dev`; tell them to restart it.

## Rules that are easy to break

- **No hex or rgb in `src/` outside `src/tokens/`** (`lint:tokens`). Tokens come from `tokens.json`.
- **`tailwind-merge` does not know our type scale by itself.** Always use `cn()` from `src/lib/cn.ts`.
- **On-demand message namespaces.** `auth.*` and `landing.*` copy lives in `messages/auth.*.json` and
  `landing.*.json`, registered by `src/i18n/auth.ts` and `landing.ts`. A file that uses those keys without
  importing them shows raw keys in production. A guard test in `i18n.test.ts` enforces which files may use them.
  Put shared strings in the base `en.json` and `bn.json` (for example `common.fieldRequired`).
- **Patient routes: 170 KB gzipped first load.** Dialogs (`ConfirmDialog`, `ActionDialogs`), the
  workspace shell, the account menu and the phone menu are loaded with `next/dynamic` for this reason.
  Clinical routes are 175 to 197 KB (no stated budget). Landing budget is 200 KB.
- **Base CSS lives in `@layer base`** (in generated `tokens.css`). Unlayered rules would beat Tailwind
  utilities. There is no Tailwind preflight yet; `button, input, select, textarea` inherit font and colour via the base layer.
- **Buttons come only from the server's `allowed_actions`** (`ActionBar` + `state/actions.ts`). Never decide
  workflow in the browser. A 202 means pending, never done (INV-12).
- **Trailing slashes.** Collection roots must be called as `/referrals/`, `/patients/`, `/consents/`,
  `/documents/`, `/notifications/`. `next.config.ts` keeps slashes and has an explicit slash rewrite.
- **Unauthenticated means error code `not_authenticated`, not HTTP 401** (DRF returns 403). `useMe` and the client go by the code.
- Old `RouteLine`, `StatusLabel`, `screens.module.css` and other CSS Modules remain for unmigrated pages
  (reports, triage, admin, flagged pages). They are deleted in Phase 9.
- Tests mock the API with a small `mount()` helper (see `src/app/patient-pages.test.tsx`,
  `clinical-pages.test.tsx`). jsdom needs the `ResizeObserver` stub in `src/test-setup.ts`.
  Radix menus open with `keyDown Enter`, not pointer events.
- BSD `sed -i` needs `-i ''`; prefer Python for edits.

## Backend findings (all in `docs/redesign/PRODUCT_UX_AUDIT.md` §6, A-01 to A-23)

Need an owner; the frontend works around the ones marked (handled).

- **A-01 high:** ElevenLabs key shipped in the browser bundle and `sessionStorage` (also A-14). Blocks triage and any public deploy.
- **A-02 high:** fixed OTP and MFA code (`123456`), no rate limits. **A-04 high:** new patients get no `patient` role.
- **A-05 high:** `/admin/*` role check references a missing field. Blocks Phase 7.
- **A-16 high:** `POST /appointments` requires `patient_id`, which patient clients cannot learn and the contract omits. "Request this time" fails with a 400.
- **A-17 high:** any signed-in user can read any consent request by id.
- **A-23:** `active_facility` is null after login (no membership list either, A-03). Sidebar says "No facility selected"; the emergency form cannot name its sending facility.
- **A-21 (handled):** collection routes only exist with a trailing slash; POST cannot be redirected.
- **A-20, A-22 (handled):** unauthenticated is 403 with the right code; CSRF failure uses `permission_denied`.
- **A-15, A-18, A-19 (handled):** list and object shapes differ from MASTERPLAN §6.1 and §7 (bare arrays, flat names, consents object).
- Also seen: the emergency endpoint's `facility_id` is the **receiving** facility; `Referral.patient_name` is the given name only; `ExtractedField.bbox` defaults to `{}`; consent `purpose` and `categories` arrive as codes (frontend humanises them until Q-07 wording exists).

## Decisions made on the user's behalf (rulings)

- Keep the existing `t()` helper, removed `next-intl`.
- Old `RouteLine` and `StatusLabel` kept until their pages migrate.
- Flagged flows (password reset, patient profile, access request, email verification) have typed adapters and **no real implementation**; the default binding rejects every call. Flags default off (`NEXT_PUBLIC_FEATURE_*`).
- `LanguageSwitch` is plain buttons, not Radix, for bundle size.
- Landing claims that need approvals (rules Q-06, consent wording Q-07, real OTP) are gated off by `CLAIMS` in `features/flags.ts`.
- Footer privacy, terms, contact, operator and service-area items are omitted, not placeholders.
- `record_outcome` sends `{ outcome: { summary } }`; the outcome shape is not in the contract (should become a MASTERPLAN §8.3 gap, "G-8", not yet written there).
- "To verify" queue tab is empty by design (no list endpoint, G-1). Referral "Needs you" is derived from the holder map in `state/routes.ts`.
- All Bangla copy written in this work (shells, auth, landing, patient and clinical pages) is a draft and needs a fluent writer. Landing has a launch gate (`src/content/landing-review.json`).

## Phase 6 leftovers (small)

- Not run in a browser: start, record outcome, return, close; OCR verify with the "Sending…" badge; emergency replay twice (unit-tested). Seed fixtures for these were created only in a scratch DB.
- Not built: "Register patient" (`POST /patients/`), "Same person / Different person" flow is built but untested in a browser, source viewer beside DraftBlock sources is a one-line placeholder, original-document viewer in `ReportViewer` still draws only the highlight box (no PDF).
- The right-hand patient pane shows visits only (no allergies or medicines endpoints).
- `usePatientNames` fetches one patient per queue row (N+1); a name field on appointment and referral lists would remove it.
- Referral lists load the first 100 only (no "show more").

## Next steps, in order

1. Commit this file and the slash fix; run the full checks above.
2. Ask the lead developer to approve Phase 0 and assign owners for A-01, A-02, A-04, A-05, A-16, A-17, A-23.
3. Phase 7 (administration) needs A-05 fixed first; build read-only tables (G-5).
4. Phase 5 remainder once A-01 is fixed: triage (strip clinical-style draft and provider settings), `/reports`, `/notifications`.
5. Phase 8 effects (`components/marketing/`, E1 to E4 only), Phase 9 responsive pass at 360/768/1024/1440 and CSS Module deletion, Phase 10 a11y, security and content checks (TalkBack, bundle `rg` for keys, `EmergencyScreen` still prints "(Q-06)").
6. Content gates before launch: Bangla review, clinical review for landing `how` and `safety`, font checks, Open Graph image.
