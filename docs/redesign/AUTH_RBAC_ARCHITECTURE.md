# Medi Waypoint — Authentication & RBAC Architecture

> **BLUF:** The backend supports two sign-in methods (patient phone OTP;
> staff password with optional MFA), five roles, and permission strings per
> facility membership. It has no registration, password reset, email
> verification or approval workflow. This document designs (1) the real flows
> against existing endpoints, (2) the missing flows as screens behind
> default-off feature flags, each tied to a proposed open question, and
> (3) one frontend authorization module that reads `me.roles` and
> `me.permissions`. The browser decides what to show. The API decides what is
> allowed.

Read first: [PRODUCT_UX_AUDIT.md](PRODUCT_UX_AUDIT.md) §6 (discrepancies
A-01 to A-14), `MASTERPLAN.md` §4 and §6, `docs/SECURITY.md` §3–§4.
Visual specification of the components used here:
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

---

## 1. Audit of the existing implementation

### 1.1 Backend (`backend/apps/accounts`)

| Item | What exists |
|---|---|
| Mechanism | Django server-side session cookie + CSRF header (`MASTERPLAN.md` D-11). No tokens |
| Endpoints | `POST /auth/login`, `POST /auth/mfa/verify`, `POST /auth/otp/request`, `POST /auth/otp/verify`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/active-facility` |
| `GET /auth/me` | `id`, `email`, `phone`, `display_name`, `preferred_language`, `roles[]`, `active_facility{id,name,name_bn,role} | null`, `permissions[]`, `is_platform_admin` |
| Roles | Derived, not stored on the user: `patient` if a `PatientAccount` exists; `clinician`, `facility_staff`, `facility_admin` from `Membership.role`; `platform_admin` if a `PlatformAdmin` row exists |
| Permissions | `Membership.permissions` (JSON list of strings), scoped to the active facility when one is set |
| Login errors | `401 not_authenticated` (bad credentials), `401 mfa_required`, `403 permission_denied` (inactive account), `400 validation_error` (bad OTP or MFA code) |
| Audit | `login` and `login_failed` events are recorded |

Known permission strings and where each is evidenced:

| String | Evidence | Meaning (`MASTERPLAN.md` §4.2) |
|---|---|---|
| `schedule.manage` | `scheduling/transitions.py`, tests | Staff may decide appointment requests |
| `referral.acknowledge` | `referrals/transitions.py` | Staff may acknowledge or decline incoming referrals |
| `referral.create` | `tests/test_accounts.py` only | Not enforced anywhere found |
| `emergency.create` | `MASTERPLAN.md` §4.2 only | Staff may create emergency referrals; no enforcing code found |

There is no canonical list (audit A-11). The frontend must not invent one;
§5.3 below uses only the first, second and fourth strings, and only for
navigation.

### 1.2 Frontend

| Item | State |
|---|---|
| `auth/session.tsx` | Context with `me`, `switchFacility`, `signOut`. `me` is never loaded |
| `(public)/login/page.tsx` | Visual only; no request is sent |
| `middleware.ts` | Locale redirect; cookie-presence redirect in production only |
| Role or permission checks | None |
| `api/client.ts` | Sends CSRF header and idempotency key; detects `401` |

### 1.3 Gaps that block a working auth experience

From the audit: A-02 (fixed OTP and MFA code), A-03 (`me` lacks memberships;
facility-switch response shape), A-04 (new patients get no `patient` role),
A-05 (`/admin/*` role check), A-13 (no server idle timeout). These are
backend work. The screens below are specified so that they are correct once
those are fixed, and show an honest error until then.

---

## 2. Roles and what each one gets

Roles are exactly `MASTERPLAN.md` §4.1. A user can hold more than one (a
clinician with memberships at two facilities; a clinician who is also a
patient).

| Role | Area (shell) | Home after sign-in | Sign-in method |
|---|---|---|---|
| `patient` | Patient | `/home` | Phone OTP |
| `clinician` | Clinical workspace | `/dashboard` | Password + MFA |
| `facility_staff` | Clinical workspace, reduced by permissions | `/dashboard` | Password + MFA |
| `facility_admin` | Administration | `/facility` | Password + MFA |
| `platform_admin` | Administration | `/facility` | Password + mandatory MFA |

Area access is a fixed mapping from roles:

| Area | Roles that may enter |
|---|---|
| `patient` | `patient` |
| `clinical` | `clinician`, `facility_staff` |
| `admin` | `facility_admin`, `platform_admin` |

A user with access to more than one area lands in the area they used last
(stored as a non-sensitive preference), or sees a short "Continue as" chooser
the first time. An area switcher appears in the account menu only for those
users. Nobody else ever sees another area's name. This replaces the
Patient / Clinician / Admin switcher that `SiteNav` shows to everyone today.

---

## 3. Authentication layout

One layout for every auth screen: route group `(auth)` with its own
`layout.tsx`. No application navigation.

```text
Desktop ≥ 1024px                               Mobile
┌───────────────────────┬─────────────────┐    ┌───────────────────┐
│ Brand panel (5/12)    │ Form (7/12)     │    │ Mark   বাংলা | EN  │
│ deep indigo           │ paper           │    │                   │
│                       │      বাংলা | EN  │    │ Title             │
│ Mark + wordmark       │                 │    │ One line of help  │
│                       │ Title           │    │ [ field        ]  │
│ One sentence:         │ One line of help│    │ [ Primary      ]  │
│ what this is          │                 │    │ secondary link    │
│                       │ [ field       ] │    │                   │
│ Handover tracker,     │ [ Primary     ] │    │ ── other entry ── │
│ static, 3 segments    │ secondary link  │    │                   │
│                       │                 │    │ Privacy note      │
│ Privacy note (real    │ ── other entry ─│    └───────────────────┘
│ controls only)        │                 │
└───────────────────────┴─────────────────┘
```

- **Brand panel** (desktop only): mark, one sentence describing the product,
  a static handover tracker showing "You → Doctor → Hospital", and one
  privacy line limited to implemented facts: "Your record is shared only when
  you agree." It changes by entry: the staff panel shows "Sender → Receiver →
  Outcome returned" and "Every record access is logged."
- **Form column**: max width 400px, left-aligned, one primary button, full
  width. Language switch top right. The alternative entry ("Staff sign in" /
  "Patient sign in") sits below a divider as a secondary link, never as tabs:
  the two forms have different fields and different audiences.
- **Mobile**: the brand panel collapses to the mark and language switch. The
  form is the page. The primary button is in the flow, not fixed, so the
  on-screen keyboard cannot cover it.
- **Motion**: one fade between steps of the same flow (phone → code), 220 ms.
  Nothing moves while the user types. See
  [UI_COMPONENT_LIBRARY_STRATEGY.md](UI_COMPONENT_LIBRARY_STRATEGY.md) §5.

### 3.1 Routes

| Route | Screen | Backend |
|---|---|---|
| `/login` | Patient sign-in (default entry, Bangla default) | exists |
| `/login/staff` | Staff sign-in, with MFA as a second step on the same route | exists |
| `/login/choose` | "Continue as" chooser for multi-area users | exists (`me.roles`) |
| `/signed-out` | Confirmation after sign-out or expiry | exists |
| `/not-authorised` | Signed in but the area is not theirs | exists |
| `/welcome` | Patient profile completion | flag, §6.2 |
| `/login/staff/reset` | Password reset request and completion | flag, §6.1 |
| `/access` | "How staff get access" (information) + access request | information: exists; request: flag, §6.3 |
| `/verify-email` | Email verification result | flag, §6.4 |

`/login/staff` is used instead of `/staff/login` because `/staff` is the
existing staff-management route.

---

## 4. Flows that exist

### 4.1 Patient sign-in (phone OTP)

First sign-in and returning sign-in are the same flow: the backend creates
the user on first successful verification. There is no separate
"registration" for patients, and the UI must not present one.

```text
/login
  Step 1  Title: "Sign in with your mobile number"
          Help:  "We will send a 6-digit code by SMS."
          Field: Mobile number (tel; accepts Bangla or Latin digits,
                 normalised with the existing normalizeDigits())
          Primary: "Send code"
            → POST /auth/otp/request {phone}
  Step 2  Title: "Enter the code"
          Help:  "Sent to 01•••••1234."  [Change number]
          Field: one input, inputmode="numeric",
                 autocomplete="one-time-code", maxlength 6, large tabular digits
          Primary: "Sign in"
            → POST /auth/otp/verify {phone, code}
          Secondary: "Send a new code" (disabled with a visible countdown
                     after each request)
  Success → GET /auth/me → redirect (§4.4)
```

| Condition | What the user sees | Recovery |
|---|---|---|
| Request pending | Button shows a spinner and "Sending…"; field read-only | — |
| `400 validation_error` on verify | Inline under the code field: "That code is not right or has expired." | Field cleared and focused; "Send a new code" |
| `429 rate_limited` | Inline: "Too many attempts. Try again in a few minutes." | Buttons disabled; exact duration shown only if the API returns one |
| Network failure | Alert above the form: "No connection. Check your internet and try again." | Primary becomes "Try again"; input kept |
| `403 csrf_failed` | Silent single refetch of `/auth/me` to refresh the CSRF cookie, then retry once | If it fails again: generic error with request ID |
| Signed in but `roles` lacks `patient` (audit A-04) | If the profile flag is on: `/welcome`. If off: "Your account is not set up yet. Please ask the facility desk." plus Sign out | Never drop the user on an empty home |

A single code field is used instead of six boxes: it works with SMS
autofill, screen readers and Bangla digit entry, and needs no extra
dependency.

### 4.2 Staff sign-in (password, then MFA)

```text
/login/staff
  Step 1  Title: "Staff sign in"
          Fields: Email or phone; Password (show/hide toggle button with
                  aria-pressed; autocomplete="current-password")
          Primary: "Sign in" → POST /auth/login {email|phone, password}
          Links: "Forgot password?" (only if the reset flag is on; otherwise
                 the text "Forgot your password? Ask your facility admin.")
                 "How do I get access?" → /access
  Step 2 (only on 401 mfa_required)
          Title: "Enter your verification code"
          Help:  wording depends on Q-13 (TOTP app or SMS); until decided,
                 "Enter the 6-digit code from your verification method."
          Field: one code input, as in §4.1
          Primary: "Verify" → POST /auth/mfa/verify {code}
          Secondary: "Back to sign in"
  Success → GET /auth/me → redirect (§4.4)
```

| Condition | What the user sees |
|---|---|
| `401 not_authenticated` | One alert above the form: "Email, phone or password is not right." Never says which. Password field cleared and focused |
| `403 permission_denied` | "This account is not active. Contact your facility admin." |
| `400` on MFA | Inline: "That code is not right." |
| MFA session lost (`400` "No pending MFA session") | Return to step 1 with "Please sign in again." |
| `429` | As §4.1 |
| Signed in, no clinical or admin role | `/not-authorised` with "Your account has no facility access yet." |

The password field has no minimum-length validation on sign-in (that rule
belongs to setting a password, not entering one). Internal IDs such as
"(Q-13)" never appear in the UI.

### 4.3 Session lifecycle

| Event | Behaviour |
|---|---|
| App load | `useMe()` runs `GET /auth/me` once (TanStack Query key `queryKeys.me`). `200` → signed in. `401` → signed out; public pages render normally |
| Any API `401 not_authenticated` while signed in | Clear the query cache, go to `/signed-out?reason=expired&next=<path>`. The screen says "You were signed out to keep your information private. Sign in to continue." and returns to `next` after sign-in |
| Sign out (user) | `POST /auth/logout` → clear query cache → clear service-worker caches except the encrypted emergency queue (`SECURITY.md` §3.3) → `/signed-out` |
| Idle warning (clinical and admin areas) | Dialog at 13 minutes idle with a visible countdown, "Stay signed in" (primary, performs a `GET /auth/me`) and "Sign out". Rebuilt on the system AlertDialog; replaces the inline-styled `IdleTimeoutWarning`. Depends on the server enforcing the timeout (audit A-13) |
| Facility switch | `POST /auth/active-facility` → clear the query cache → refetch `me`. The response is not stored as `me` (audit A-03) |
| Role or permission change by an admin | Picked up on the next `me` refetch: window focus, facility switch, or any `403 permission_denied`. No client-side caching of roles beyond the query |
| Sign-out always visible | In clinical and admin shells the account menu and a visible "Sign out" control are in the sidebar footer (shared computers) |

### 4.4 Redirect after sign-in

1. If `next` is present, same-origin, and inside an area the user may enter:
   go there. Otherwise ignore it (prevents open redirects and role
   confusion).
2. One accessible area → its home (§2).
3. Several → last used area, else `/login/choose`.
4. None → the "not set up" states in §4.1 and §4.2.

---

## 5. Frontend authorization architecture

### 5.1 Two mechanisms, with a strict split

| Question | Answered by | Never by |
|---|---|---|
| Which shell and which navigation items does this user see? Which entry points (for example "Emergency referral") are offered? | `me.roles` and `me.permissions`, through `src/auth/access.ts` | Hardcoded checks in pages |
| Which buttons appear on **this** appointment, referral or document? | The object's server-computed `allowed_actions`, rendered by `ActionBar` through the action registry | Roles or permissions in the browser |

This keeps `FRONTEND.md` §6 intact: the frontend does not decide workflow
rules. Role checks choose navigation only.

### 5.2 Module layout

```text
src/auth/
  me.ts            useMe(): TanStack Query over GET /auth/me; signIn/signOut/
                   switchFacility mutations. Replaces SessionProvider state.
  access.ts        Pure functions, no React:
                     hasRole(me, role)
                     can(me, permission)
                     canEnter(me, area)      // table in §2
                     homeFor(me)             // §4.4
                     visibleNav(me, area)    // filters the nav config
  nav.ts           One declarative config per area: items with
                   { id, labelKey, href, icon, requires? }
  RequireArea.tsx  Layout guard (below)
  IdleTimeout.tsx  §4.3
```

`access.ts` is the only file that names role or permission strings. Roles
and areas are typed as unions of the `MASTERPLAN.md` §4.1 codes; a test
asserts the union matches the list in the masterplan, in the same style as
the existing state-label test.

### 5.3 Navigation rules that use permissions

| Nav item (clinical area) | Shown when |
|---|---|
| Queue | always (`clinician` or `facility_staff`) |
| Appointment decisions inside the queue | `clinician`, or `facility_staff` with `schedule.manage` |
| Incoming referrals | `clinician`, or `facility_staff` with `referral.acknowledge` |
| Outgoing referrals, New referral, Patients | `clinician` |
| Emergency referral | `clinician`, or `facility_staff` with `emergency.create` |

These follow the action matrix in `MASTERPLAN.md` §4.2 row by row. Hiding an
item is a convenience. If a hidden route is opened by URL, the API still
returns `403` or `404` and the page shows the not-found or not-authorised
state.

### 5.4 Route protection, in three layers

| Layer | Does | Is it security? |
|---|---|---|
| `middleware.ts` | Locale prefix. Redirects to `/login?next=` when no session cookie is present on protected prefixes. Runs in every environment; a `NEXT_PUBLIC_AUTH_GUARD=off` switch exists for component tests only | No. Cookie presence only |
| `RequireArea` in each area `layout.tsx` | While `me` loads: shell skeleton (no content flash). `401`: redirect to sign-in. Signed in but `!canEnter(me, area)`: render `/not-authorised` content in place | No. User experience |
| Django API | Role, facility scope and care relationship on every request (`SECURITY.md` §4); `404` for objects the user may not see | **Yes. The only enforcement layer** |

### 5.5 Unauthorised and not-found screens

- **Not authorised** (signed in, wrong area): title "This area is not part of
  your account", one sentence, primary button "Go to my home" (`homeFor(me)`),
  secondary "Sign out". No mention of what the area contains.
- **Not found** (object `404`): "We could not find that, or you do not have
  access to it." Same wording for both cases, matching the API's deliberate
  ambiguity. Primary: back to the relevant list.

---

## 6. Flows with no backend yet

Decision by the product owner (2026-11-23): design and build these screens
now, behind flags, before the backend exists.

Rules for all four:

- Each has a `NEXT_PUBLIC_FEATURE_*` flag, **default off**, following the
  existing `NEXT_PUBLIC_FEATURE_PATIENT_REPORT_UPLOAD` convention.
- Each is tied to a **proposed** open question to be added to
  `MASTERPLAN.md` §8.2 in Phase 0. The IDs below are proposals; the next free
  ID today is Q-14.
- No endpoint is added to `MASTERPLAN.md` §6.3 by this document. Request and
  response shapes below are **proposals for discussion**, marked
  `PROPOSED — NOT IN CONTRACT`. Screens are built against a typed adapter
  interface with a mock implementation used in Storybook and tests only.
- With the flag off, the entry link is absent and the route returns the
  not-found page.

### 6.1 Staff password reset — flag `PASSWORD_RESET`, proposed Q-14

Open question: may staff reset their own password (by email link or phone
OTP), or does only a facility admin reset it? `SECURITY.md` is silent.

| Step | Screen |
|---|---|
| Request | Field: email or phone. Primary: "Send reset instructions". Result is always the same neutral message ("If an account matches, we have sent instructions."), so the form cannot be used to discover accounts |
| Set new password | New password with show/hide; rules from `SECURITY.md` §3.1 listed as plain text before typing (at least 12 characters; not a known breached password) and checked on submit by the server. No strength meter (it would imply rules the server does not have) |
| Done | "Password changed. Sign in with your new password." All other sessions should be ended by the server |
| Invalid or expired link | "This link has expired. Request a new one." |

Until Q-14 is answered, the sign-in screen shows the text "Forgot your
password? Ask your facility admin."

### 6.2 Patient profile completion — flag `PATIENT_PROFILE`, proposed Q-15

Open question: which fields are required to create the `Patient` record and
`PatientAccount` after first OTP sign-in, and which endpoint does it
(audit A-04)? Depends on Q-02 (identity matching) and Q-03 (guest triage).

Screen `/welcome`, one page, shown once:

- Title: "Tell us who you are". Help: "Doctors see this with your requests."
- Fields limited to columns that exist on `identity.Patient`: name
  (`given_name`, optional `family_name`), Bangla name (`name_bn`, optional),
  date of birth **or** age (`birth_date` | `estimated_age`), sex (`sex`
  choices as radio buttons), area (`area`, division → district → upazila
  from `GET /directory/areas`). No national ID (Q-10 is open).
- Language preference (`preferred_language`).
- Primary: "Continue". No "skip" until Q-15 decides whether a profile is
  mandatory before requesting an appointment.
- If the server answers `409 duplicate_candidate`, show "We may already have
  a record for you. The facility desk will confirm." and continue; never
  merge or choose in the browser (INV-13).

### 6.3 Clinician access request — flag `ACCESS_REQUEST`, proposed Q-16

Constraint that is already decided: `SECURITY.md` §3.1 forbids self-service
clinician sign-up. Accounts are created by facility admins against a
verified practitioner registration number. This design does not change that.

**Always available (no flag): `/access`, "How staff get access".** Plain
explanation in three steps: your facility admin creates your account using
your BMDC registration number → you receive sign-in details → you sign in
and set up verification. Links: "Staff sign in".

**Behind the flag: an access *request*, which grants nothing.**

| Step | Screen |
|---|---|
| Request form | Name, BMDC registration number, facility (search from `GET /directory/facilities`), work phone or email. Statement above the button: "This sends a request to the facility's admin. It does not create an account." |
| Submitted | "Request sent to {facility}. You will be contacted when it is reviewed." A reference is shown if the server returns one. No account, no session, no password is created |
| Status check | Not designed until Q-16 defines whether a requester can see status without an account |
| Admin side | A "Requests" tab in Administration → Staff: list with Approve (creates the account through the normal admin flow) and Decline (reason required). Specified in [APPLICATION_DESIGN_ARCHITECTURE.md](APPLICATION_DESIGN_ARCHITECTURE.md) §6.1 |

A user is never shown clinical navigation because of a pending request.
Access exists only when `me.roles` contains a clinical role.

### 6.4 Email verification — flag `EMAIL_VERIFICATION`, proposed Q-17

Open question: is email verified at all? Patients have no email in the
current flow, and staff accounts are created by an admin. The only screen
designed is the landing state of a verification link: success ("Email
confirmed. You can sign in."), expired, and already used. No "resend"
screen is designed until Q-17 states who triggers verification.

### 6.5 Not designed, with reasons

| Requested item | Why it is absent |
|---|---|
| Patient "registration" form with password | Patients have no password; OTP sign-in creates the account. A password form would contradict `SECURITY.md` §3.1 |
| Account activation screen | Covered by first staff sign-in plus MFA; no separate activation concept exists in the backend |
| Social sign-in, "remember this device" | Not in any project document |

---

## 7. Security requirements carried by the frontend

| Requirement | How the design meets it |
|---|---|
| No credentials in browser storage | Session is an `HttpOnly` cookie. The app stores only: last used area, UI language, last seen tracker state. The ElevenLabs key in the bundle and in `sessionStorage` (audit A-01, A-14) must be removed before release |
| UI visibility is not authorization | §5.1 and §5.4. Every hidden route still depends on the API's answer |
| No account enumeration | Identical messages for unknown account and wrong password (§4.2), and for reset requests (§6.1) |
| Shared computers | Visible sign-out; cache cleared on sign-out and on expiry; patient names never in tab titles (`SECURITY.md` §7.2) |
| Open redirect | `next` accepted only if same-origin and inside an allowed area (§4.4) |
| Accessible authentication (WCAG 2.2 §3.3.8) | No puzzles; paste and password managers allowed; SMS code autofill supported; errors announced with `role="alert"` and linked to fields with `aria-describedby` |
| Honest states | A pending request never looks like success. Buttons disable while a request is in flight, with the idempotency key created once per press (`FRONTEND.md` §5) |

---

## 8. State checklist for every auth screen

Each screen is built and reviewed in these states, in both languages:
default, focused, filled, submitting, field error, form error, rate limited,
offline, success, and reduced motion. Step changes move focus to the new
step's heading.
