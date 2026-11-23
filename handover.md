# Medi Waypoint redesign: handover

Branch `redesign/handover` (not merged, not pushed). Plan and design docs are in
`docs/redesign/` (start with `REDESIGN_IMPLEMENTATION_PLAN.md`; its §1 table is the status board).
Everything below was verified against the repo at the last commit.

## State at a glance

| Phase | Status |
|---|---|
| 0 Governance (D-14, D-15, Q-14 to Q-17, doc edits) | Done, **awaiting lead developer approval** |
| 1 Tokens, Tailwind v4, fonts | Done. Font checks in DESIGN_SYSTEM §3.1 still open (need a browser, a phone, a Bangla reader) |
| 2 Components, Storybook, data layer | Done. All legacy CSS modules deleted and components restyled |
| 3 Auth, RBAC, shells | Built and tested against mocked and real backend. Backend blockers A-04 and A-23 resolved |
| 4 Landing page | Built with static states and effects E1 to E4. Bangla is an unreviewed draft |
| 5 Patient app | Done. `/home`, `/doctors`, `/appointments`, `/appointments/[id]`, `/consents`, `/consents/[id]`, `/reports`, `/notifications` built and tested. Triage cleaned up per A-12 |
| 6 Clinical workspace | Done (see "Phase 6 leftovers") |
| 7 Administration | Done. Built read-only tables for `/facility`, `/schedules`, `/capacity`, `/staff` (A-05 resolved) |
| 8 Visual refinement | Done. Marketing effects E1 to E4 built with reduced-motion support and zero-motion enforcement on EmergencyScreen |
| 9 Responsive & CSS cleanup | Done. Deleted all legacy `*.module.css` files, removed compatibility aliases and stylelint |
| 10 Verification | Done. All 29 vitest suites (331 tests), 102 backend tests, token checks, content check, and Next.js production build pass within budgets |

Commit log is the record: `git log --oneline` (about 20 commits, newest first). The last commit may not
include this file and the trailing-slash fix; run `git status` first and commit them.

## How to run and verify

```
cd frontend
npm test                 # 331 tests across 29 test files, all passing
npx tsc --noEmit         # zero type errors
npm run lint:tokens && npm run tokens:check
npm run content:check    # landing copy parity; add `-- --launch` to see launch blockers
npx next build           # First Load JS well under budget on all routes (<170 kB patient, <200 kB public, <300 kB clinical)
npm run storybook

# Backend tests:
cd ../backend && pytest  # 102 tests, all passing
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

- **A-01 high (resolved):** Removed `NEXT_PUBLIC_ELEVENLABS_API_KEY` from `next.config.ts`; sanitized `sessionStorage` in `voice/controller.ts` so credentials are never stored.
- **A-02 high:** fixed OTP and MFA code (`123456`), no rate limits in demo mode.
- **A-04 high (resolved):** new patient signup via phone OTP now automatically creates `Patient` and `PatientAccount`, granting `patient` role immediately.
- **A-05 high (resolved):** `/admin/*` role check fixed to check active memberships and platform admin correctly (`_require_admin_role`).
- **A-16 high (resolved):** `POST /appointments` now treats `patient_id` as optional and infers it from the authenticated patient session.
- **A-17 high (resolved):** consent request endpoint enforces patient ownership and role checks.
- **A-23 (resolved):** `MeView` defaults `active_facility_id` to user's first active facility membership and returns `memberships` list.
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

1. Review and merge `redesign/handover` into `main` or `development`.
2. Content gates before production launch:
   - Bangla review by a native speaker.
   - Clinical review for landing `how` and `safety` sections.
   - Bengali font check on low-end mobile devices (DESIGN_SYSTEM §3.1).
3. Production hardening: rate limiting on phone OTP, real SMS gateway integration for OTP delivery.
