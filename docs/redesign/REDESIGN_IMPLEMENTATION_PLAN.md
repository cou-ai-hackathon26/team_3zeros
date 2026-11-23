# Medi Waypoint — Redesign Implementation Plan

> **BLUF:** Eleven phases. Phase 0 changes the governing documents first,
> because the repository's own rules forbid most of this redesign until they
> are amended. Phases 1–3 build tokens, components, and authentication with
> role-aware shells. Phases 4–7 rebuild the landing page, then patient,
> clinical and admin screens, wiring each to the real API as it is restyled.
> Phases 8–10 add the four permitted effects, finish responsive work and run
> accessibility, security and regression checks. Five backend defects block
> specific phases and are listed with the phase they block. Nothing in this
> plan changes an API contract or a workflow rule.

Design references: [PRODUCT_UX_AUDIT.md](PRODUCT_UX_AUDIT.md),
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md),
[UI_COMPONENT_LIBRARY_STRATEGY.md](UI_COMPONENT_LIBRARY_STRATEGY.md),
[AUTH_RBAC_ARCHITECTURE.md](AUTH_RBAC_ARCHITECTURE.md),
[APPLICATION_DESIGN_ARCHITECTURE.md](APPLICATION_DESIGN_ARCHITECTURE.md),
[LANDING_PAGE_ARCHITECTURE.md](LANDING_PAGE_ARCHITECTURE.md).

No time estimates are given. Phases are ordered by dependency.

---

## 1. Current state

Progress on branch `redesign/handover`:

| Phase | Status |
|---|---|
| 0 Governance | Done. Edits to MASTERPLAN, FRONTEND, UIUX_DESIGN, SECURITY and CLAUDE.md are committed; awaiting lead developer approval |
| 1 Tokens | Done. Font checks in DESIGN_SYSTEM §3.1 (tabular figures, conjuncts on a low-end phone, Bangla reader sign-off) are still open |
| 2 Components | Done except where noted in the Phase 2 rulings (see git log). Old `RouteLine`, `StatusLabel` and `SiteNav` remain until the pages using them migrate in Phases 3, 5 and 6 |
| 3 Auth and RBAC | Built and tested against mocked APIs. Exit proof with seeded users is blocked by backend A-02 and A-04. Flagged flows use the "unavailable" adapter until Q-14 to Q-17 have contracts |
| 4 Landing page | Built with final static states; effects E1–E4 wait for Phase 8. Bangla copy is an unreviewed draft, gated by `npm run content:check -- --launch`. Open content items in LANDING_PAGE §9 are omitted, not filled |
| 5–10 | Not started |

---

## 2. Decisions this plan rests on

Made by the product owner on 2026-11-23.

| # | Decision | Alternative that was recommended | Consequence accepted |
|---|---|---|---|
| 1 | Replace the "wayfinding" identity entirely | Keep and deepen it | All 14 components restyled; `docs/UIUX_DESIGN.md` §3–§6 rewritten; token names change |
| 2 | Expressive motion on landing and auth pages only | Same | `docs/UIUX_DESIGN.md` §4.3 and `CLAUDE.md` rule 4 amended with a scoped exception |
| 3 | Adopt Tailwind v4 + shadcn/ui | Keep CSS Modules + Radix | Reverses `docs/FRONTEND.md` §2; stylelint hex rule replaced; all styling rewritten |
| 4 | Build all requested auth and onboarding screens now, behind flags, before backend support exists | Design to the existing backend only | Four flows cannot be tested end to end; proposed questions Q-14 to Q-17; possible rework when contracts are decided |

Kept regardless of the above, because they are safety, accessibility or
contract rules: emergency red reserved; no motion on the emergency screen;
draft marked by pattern and word; status never by colour alone; WCAG 2.2
AA; the 170 KB patient-route budget; `allowed_actions` as the only source
of case buttons; no invented clinical content, statistics or claims.

---

## 3. Phase 0 — Governance (must merge before any code)

`CLAUDE.md` rule 2 requires contract-level changes to be made in
`MASTERPLAN.md` first, with the workstream documents updated in the same
change. `CLAUDE.md` rule 4 binds UI work to `docs/UIUX_DESIGN.md`. Until
these edits merge, the current rules prohibit Tailwind utilities, card
layouts, scroll reveals and any new auth screen.

| File | Edit |
|---|---|
| `MASTERPLAN.md` §8.1 | Add **D-14**: styling is Tailwind CSS v4 with shadcn/ui components generated from `tokens.json`; supersedes the CSS Modules choice in FRONTEND §2. Add **D-15**: visual identity is "Handover" as defined in UIUX_DESIGN |
| `MASTERPLAN.md` §8.2 | Add open questions, owner and blocked items: **Q-14** staff password reset (self-service or admin-only); **Q-15** patient profile fields and creation of the patient account after first OTP sign-in; **Q-16** clinician access request and approval workflow; **Q-17** whether and how email is verified |
| `MASTERPLAN.md` §8.2 or a new "Known contract gaps" list | Record G-1 to G-6 (APPLICATION_DESIGN §1.2) and audit items A-03, A-06, A-11 as questions for the lead developer |
| `MASTERPLAN.md` §10 | One ledger row: date, "UI redesign governance: D-14, D-15, Q-14–Q-17; frontend route map additions; no change to §4–§7 contracts" |
| `docs/UIUX_DESIGN.md` | Replace §3 (design system), §4 (motion), §5 (components) and the wireframes in §6 with the content of DESIGN_SYSTEM and APPLICATION_DESIGN, or reduce them to links to `docs/redesign/`. Keep §2 (brief), §7 (writing) and §8 (accessibility) unchanged. Replace the "no card grids / no scroll-triggered reveals" lines with the bento rule (DESIGN_SYSTEM §4.1) and the two motion tiers (§5) |
| `docs/FRONTEND.md` | §2: styling row → Tailwind v4 + tokens; "no component library" paragraph → shadcn/ui source restyled, effect allow-list by reference. §3: route map per APPLICATION_DESIGN §1.1 and AUTH_RBAC §3.1. §4: `useMe()` and `access.ts`. §10: token pipeline output, `lint:tokens`, removal of stylelint. §11: add the landing budget |
| `CLAUDE.md` rule 4 | "UI work follows UIUX_DESIGN.md tokens and motion rules; no raw colour values; expressive motion only on the public landing and auth pages, limited to the components listed in docs/redesign/UI_COMPONENT_LIBRARY_STRATEGY.md §4." |
| `docs/SECURITY.md` | No rule changes. Add a note under §10 that audit items A-01 and A-02 are open findings |

Exit proof: the edits are reviewed by the lead developer and merged in one
change; the masterplan URL test (`backend/tests/test_masterplan_urls.py`
and the frontend state tests) still passes.

### 3.1 Backend prerequisites (not part of this redesign; owners needed)

| Audit ID | Defect | Blocks |
|---|---|---|
| A-01 | ElevenLabs key exposed to the browser | Any public deployment; Phase 5 triage |
| A-02 | Fixed OTP and MFA code, no rate limits | Phase 3 exit; landing claim in §4.5 |
| A-04 | New patients get no `patient` role | Phase 5 (patient shell guard) |
| A-05 | `/admin/*` role check references a missing field and attribute | Phase 7 |
| A-03 / G-4 | `me` lacks memberships; facility-switch response shape | Facility switcher in Phase 6 |
| A-13 | No server idle timeout | Idle warning is cosmetic until fixed |

---

## 4. Phases

Priority: **P0** blocks everything after it; **P1** core product;
**P2** important; **P3** refinement.

### Phase 1 — Design tokens and core design system (P0)

| Deliverable | Detail |
|---|---|
| Tailwind v4 | Install pinned versions (Library Strategy §9); PostCSS config; one global stylesheet importing the generated theme |
| Tokens | Rewrite `tokens.json` to the three-layer structure with DESIGN_SYSTEM values; update `build-tokens.mjs` to emit the `@theme` block (default palette removed) and shadcn semantic variables |
| Compatibility aliases | A clearly marked temporary block maps the old variable names (`--color-forest`, `--color-mist`, …) to new values so unmigrated CSS Modules keep rendering. Deleted in Phase 9 |
| Fonts | Replace Anek with Hind Siliguri (400/500/600) and Tiro Bangla (400) through `next/font`; run the three font checks in DESIGN_SYSTEM §3.1 |
| Checks | `check-contrast.mjs` pair list from DESIGN_SYSTEM §2.2; new `lint:tokens` script; update `tokens.test.ts` |

Depends on: Phase 0. Exit proof: `npm run tokens:build && npm run
tokens:check && npm test` pass; existing pages still render (with the new
palette through aliases); a type specimen page shows both scripts at every
scale step.

### Phase 2 — Shared UI component architecture (P0)

| Deliverable | Detail |
|---|---|
| shadcn setup | `components.json` (Radix variant, `src/components/ui`), `cn` helper |
| Primitives | The components in Library Strategy §3, restyled to DESIGN_SYSTEM §6 with every listed variant and state |
| Product components | `HandoverTracker` (new; holder map added to `src/state/routes.ts` with tests), `StatusBadge`, `Panel`, `Tile`, `ListRow`, `PageHeader`, `EmptyState`, `ErrorState`, `Field` family, `Table` |
| Restyle existing | `ActionBar`, `DraftBlock`, `SourceChip`, `SyncBadge`, `Toast`, `QueueList`, `ReportViewer`, `ConsentSheet`, `EmergencyScreen`, `LanguageSwitch`, `VoicePanel` |
| Component catalogue | Storybook is required by `docs/FRONTEND.md` §10.2 and §12 but is not installed. Install it here, with stories for every state in both locales and reduced motion |
| Data layer | `QueryClientProvider` in the root layout; query hooks per resource in `api/queries/` built on the existing client and keys |
| i18n | Move page copy into `messages/{bn,en}.json` as pages are rebuilt; adopt `next-intl` (already installed) or keep the existing `t()` helper. Decide once, here, and remove the other |

Depends on: Phase 1. Exit proof: component tests pass in both locales;
axe reports no violations on the catalogue; no component file contains a
colour literal.

### Phase 3 — Authentication and RBAC (P0)

| Deliverable | Detail |
|---|---|
| Session | `auth/me.ts` (`useMe`, sign-in, sign-out, facility switch); remove `SessionProvider` state |
| Authorization | `auth/access.ts`, `auth/nav.ts`, `RequireArea`, not-authorised and not-found screens; test that role codes match `MASTERPLAN.md` §4.1 |
| Middleware | Guard active in all environments, with the documented test switch |
| Auth screens | `(auth)` layout; `/login`, `/login/staff` (with MFA step), `/login/choose`, `/signed-out`, `/access` |
| Flagged screens | `/welcome`, `/login/staff/reset`, access request, `/verify-email`, each behind its flag with a typed adapter and mock used only in tests and the catalogue |
| Session UX | Global `401` handling, idle-timeout dialog, sign-out cache clearing |
| Shells | `PublicHeader`, `PatientShell`, `WorkspaceShell` with role-filtered navigation; delete `SiteNav` |

Depends on: Phase 2. Blocked for exit by A-02 and A-04. Exit proof: with
seeded users, a patient, a clinician, a staff member with limited
permissions and a facility admin each sign in and see only their shell and
navigation; opening another area's URL shows the not-authorised screen;
the API still returns `403`/`404` for the same requests made directly.

### Phase 4 — Public landing page (P1)

Build LANDING_PAGE §4 with static final states for all effects (effects
themselves come in Phase 8). Depends on: Phases 2–3 (header shows session
state). Exit proof: Lighthouse on throttled Slow 4G meets the proposed
budget; both locales render; no claim on the page lacks a row in
LANDING_PAGE §4.5 or §9; content items still open are listed for the
product owner.

### Phase 5 — Patient application (P1)

Order in §6. Each page is restyled **and** wired to its endpoint in the
same change, so no restyled mock ships. Blocked by A-01 (triage) and A-04.
Exit proof: end-to-end run against seeded data: sign in → triage (text
mode) → confirm summary → choose doctor → request slot → see tracker →
clinician accepts in another browser → patient tracker advances; consent
request granted and refused; every page shows correct loading, empty and
error states.

### Phase 6 — Clinical workspace (P1)

Order in §6. Exit proof: full referral lifecycle in two browsers (sender
and receiver) as `docs/FRONTEND.md` §13 Phase 5 already requires; queue
tabs filter; keyboard-only decision on a queue item; verification shows
"Saving…" until FHIR sync; emergency referral submitted offline, replayed
twice, one server referral.

### Phase 7 — Administration (P2)

Read-only tables first (G-5). Write flows when endpoints exist. Blocked by
A-05. Exit proof: a facility admin sees only their facility; a platform
admin sees the facility picker; empty endpoints show designed empty
states.

### Phase 8 — Animation and visual refinement (P3)

The four effects (Library Strategy §4) on landing and auth; tracker
advance; queue row exit; draft-to-verified border; view transitions.
Exit proof: every animated component has a reduced-motion state; no
animation runs on the emergency screen; import-boundary lint shows
`components/marketing` used only by `(public)` and `(auth)`.

### Phase 9 — Responsive optimisation (P2)

Pass over every route at 360, 768, 1024 and 1440 px in both locales
(APPLICATION_DESIGN §8). Delete the compatibility aliases,
`screens.module.css`, all `*.module.css`, stylelint and its config.
Exit proof: no horizontal overflow at 360px on any route; visual snapshots
approved; `rg "module.css" src` returns nothing.

### Phase 10 — Accessibility, security and regression (P0 for release)

Section 8 below. Exit proof: all checks green; open findings listed with
owners.

---

## 5. Existing code: retain, refactor, replace

### 5.1 Components (`frontend/src/components`)

| Component | Decision | Work |
|---|---|---|
| `ActionBar` | Refactor | Keep registry logic and reason handling; rebuild markup on `Button`, `Dialog`/`Sheet`, `DropdownMenu` |
| `ConsentSheet` | Refactor | Keep props and equal-weight buttons; restyle with `DescriptionList`, `Button` |
| `DraftBlock` | Refactor | Keep behaviour; new draft tokens; verified transition |
| `EmergencyScreen` | Refactor (style only) | Tokens only; no structural or behavioural change |
| `LanguageSwitch` | Refactor | Becomes a `SegmentedControl` instance; keep locale logic |
| `QueueList` | Refactor | Keep sorting and keyboard navigation; restyle rows |
| `ReportViewer` | Refactor | Keep field–bounding-box logic; restyle; add tabbed layout below `lg` |
| `RouteLine` | **Replace** with `HandoverTracker` | Reuses `computeRouteView` and `shouldAnimateRouteAdvance` from `state/routes.ts` |
| `SiteNav` | **Replace** with `PublicHeader`, `PatientShell`, `WorkspaceShell` | Hardcoded links and area switcher removed |
| `SourceChip` | Refactor (style only) | — |
| `StatusLabel` | **Replace** with `StatusBadge` | Same i18n keys |
| `SyncBadge` | Refactor (style only) | State logic unchanged |
| `Toast` | Refactor | Move onto the installed Radix toast; one `Toaster` in the root layout instead of per-page state |
| `VoicePanel` | Refactor | Keep phases; remove provider settings from the patient view (audit A-12); restyle the level indicator as a tracker segment |

### 5.2 Other frontend modules

| Module | Decision | Notes |
|---|---|---|
| `state/actions.ts`, `state/routes.ts` | Retain | Add the holder map and its tests to `routes.ts` |
| `api/client.ts`, `schema.d.ts`, `queries/`, `ws.ts` | Retain | Add query hooks; route all calls through the client (audit A-09) |
| `offline/*` | Retain | `EmergencySlip` print styles moved to the new stylesheet; black-only slip unchanged |
| `voice/controller.ts`, `textClient.ts`, `types.ts` | Retain | Stop writing the draft and provider config to `sessionStorage` when A-14 is addressed |
| `voice/webrtcClient.ts` | Retain logic, **security fix required** (A-01) | Not a design task |
| `auth/session.tsx` | **Replace** with `auth/me.ts`, `access.ts`, `IdleTimeout` | Inline styles removed |
| `i18n/*` | Retain; extend messages | Decide `next-intl` vs current helper in Phase 2 |
| `tokens/*`, `scripts/*` | Refactor | New values and output format |
| `app/[locale]/screens.module.css` | **Delete** in Phase 9 | — |
| `middleware.ts` | Refactor | Guard in all environments; new route prefixes |
| `next.config.ts` | Refactor | Remove `NEXT_PUBLIC_ELEVENLABS_*` exposure with the A-01 fix |

### 5.3 Tests

| Test file | Decision |
|---|---|
| `state/state.test.ts`, `i18n/i18n.test.ts`, `api/client.test.ts`, `offline/offline.test.tsx`, `voice/voice.test.tsx` | Retain unchanged; they test logic, not presentation |
| `tokens/tokens.test.ts` | Update to new token names and pairs |
| `components/core-components.test.tsx`, `clinical-components.test.tsx` | Update queries where markup changes; keep every behavioural assertion (allowed actions only, reason required, draft label, sync states) |
| `auth/session.test.tsx` | Replace with tests for `useMe`, `access.ts`, `RequireArea` |
| `app/screens.test.tsx` | Rewrite: it asserts the old home page and mock data. New tests mock the API client and assert each page's loading, empty, error and loaded states |

---

## 6. Page implementation order

Ordered so each page's dependencies exist and the first project milestone
("patient-to-doctor appointment request decided in the dashboard",
`MASTERPLAN.md` §9) is reachable earliest.

| # | Page | Phase | Needs |
|---|---|---|---|
| 1 | `/login`, `/login/staff`, `/signed-out`, not-authorised | 3 | Phase 2 |
| 2 | `/` landing | 4 | Shell, tracker |
| 3 | `/home` | 5 | Appointments and consents queries |
| 4 | `/doctors` | 5 | Directory and slots queries |
| 5 | `/appointments`, `/appointments/[id]` | 5 | Tracker, `ActionBar` |
| 6 | `/dashboard` | 6 | Queue, detail pane (completes milestone 1) |
| 7 | `/triage`, `/triage/session/[id]`, `/triage/summary/[id]` | 5 | A-01 fixed |
| 8 | `/consents`, `/consents/[requestId]` | 5 | — |
| 9 | `/reports`, `/notifications` | 5 | G-2 decision |
| 10 | `/patients`, `/patients/[id]` | 6 | — |
| 11 | `/patients/[id]/reports/[docId]/verify` | 6 | — |
| 12 | `/referrals`, `/referrals/new`, `/referrals/[id]` | 6 | Completes milestone 2 |
| 13 | `/emergency` | 6 | Restyle only; logic exists |
| 14 | `/facility`, `/capacity`, `/schedules`, `/staff` | 7 | A-05 fixed |
| 15 | Flagged auth screens | 3 (built), enabled when Q-14–Q-17 are answered | Backend |

---

## 7. Risks

| Risk | Likelihood | Effect | Mitigation |
|---|---|---|---|
| Restyle regresses a safety behaviour (emergency interrupt, allowed-actions-only, draft marking, sync honesty) | Medium | High | Behavioural tests retained and run on every change (§5.3); these components are "style only" where possible |
| Patient routes exceed 170 KB after adding Radix and Motion | Medium | High on low-end phones | Per-route budget in CI from Phase 2; Radix-heavy components kept off home, triage and status routes; effects import-restricted |
| Tiro Bangla or Hind Siliguri fail the Bangla rendering or tabular-figure checks | Low–medium | Medium | Checks run in Phase 1 before components are built; fallbacks defined in DESIGN_SYSTEM §3.1 |
| Flagged auth screens diverge from the eventual backend contracts | High | Rework of four screens | Typed adapter per flow; flags default off; nothing ships enabled before its question is answered |
| Wiring pages to the API exposes backend defects (A-02 to A-05, G-1 to G-6) | High | Phases stall | Prerequisites listed in §3.1 with the phase each blocks; designed fallbacks per gap |
| Mixed CSS Modules and Tailwind during migration | Certain, temporary | Visual inconsistency between migrated and unmigrated pages | Compatibility aliases; migrate by shell, not by scattered page; delete aliases in Phase 9 |
| Tailwind arbitrary values bypass tokens | Medium | Erodes the system | Default palette removed; `lint:tokens` in CI |
| Bangla copy not ready | Medium | `/bn` landing cannot launch | Copy list delivered to the writer at Phase 0; existing reviewed strings reused where they fit |
| Identity replaced without usability evidence | Medium | Patients find the tracker less clear than the route line | Test the tracker's holder line with five Bangla-speaking users on phones before Phase 5 completes; the stop mapping is unchanged, so presentation can be adjusted without touching logic |
| Dependency supply chain | Low | High | Exact pins, versions at least 7 days old, `npm audit` in CI (already required by `docs/SECURITY.md` §9) |

---

## 8. Testing and validation

| Level | What | When |
|---|---|---|
| Tokens | Contrast pairs; `lint:tokens`; token build is reproducible | Every commit from Phase 1 |
| Unit | `access.ts` against the role and area tables; holder map covers every state in `MASTERPLAN.md` §5; redirect rules (`next` validation) | Phases 2–3 |
| Component | Every variant and state in both locales; keyboard operation; reduced motion; axe | Phase 2 onward |
| Page | API client mocked: loading, empty, error, loaded, pending-sync, `412`, `423`, `404` for each page | With each page |
| End to end (Playwright, seeded backend) | The flows in §4 exit proofs; role matrix: each role × each area URL; offline emergency replay | Phases 3, 5, 6, 7 |
| Accessibility | axe on every page in both locales; manual keyboard pass on the clinical workspace; TalkBack with Bangla voice on a low-end Android phone for the patient flow | Phase 10, and per page |
| Performance | First-load JS per route group; Lighthouse Slow 4G on `/`, `/home`, `/triage` | Phase 2 onward in CI |
| Visual regression | Snapshots at 360, 768, 1280 px, both locales, for the catalogue and key pages | Phase 2 onward |
| Security regression | No secret or `NEXT_PUBLIC_*` key in the built bundle (`rg` over `.next`); CSP unchanged and effective with the new stack; `HttpOnly` session cookie; no patient name in titles; hidden navigation routes still denied by the API; sign-out clears caches | Phase 10 |
| Content | No user-facing string contains a project ID; no statistic or testimonial on the landing page; every Bangla string reviewed | Phase 10 |

Commands that exist today: `npm test`, `npm run tokens:build`,
`npm run tokens:check`, `npm run api:types`. To add: `npm run lint:tokens`,
a bundle-budget check, Playwright scripts (the packages are already in
`devDependencies` but no script or config exists).

---

## 9. Out of scope for this redesign

- Fixing backend defects A-01 to A-05, A-13 and the contract gaps G-1 to
  G-6 (tracked, owners needed).
- New API endpoints, states, roles or permissions.
- An audit-log screen, break-glass UI, device enrolment (Q-07, Q-09).
- Dark theme; native apps; charts and analytics dashboards.
- Clinical content: red-flag rules, emergency instructions, consent
  wording (Q-06, Q-07).

---

## 10. Next action

Review these seven documents. If the direction is accepted, Phase 0 is a
single documentation change for the lead developer to approve; Phase 1 can
start the same day it merges.
