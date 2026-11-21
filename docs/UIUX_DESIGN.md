# Medi Waypoint — UI/UX Design Plan

> **BLUF:** The visual idea is wayfinding. Every journey in Medi Waypoint
> (triage, appointment, referral, outcome) is drawn as one continuous route
> line with stops, in turmeric yellow on a cool mist ground, set in Anek, a
> Bangla + Latin family whose width axis does the expressive work. That route
> line is the one bold element and the one orchestrated animation. Everything
> else stays quiet: left-aligned, list-based, no card grids, no gradients, no
> decorative motion. Emergency red is reserved for emergencies only.

---

## 1. Read first

- Shared states, roles and actions: [MASTERPLAN.md](../MASTERPLAN.md) §4–§5.
  Every status label and every button in this document maps to a state or an
  action defined there. Do not design a button for an action that is not in
  `allowed_actions`.
- Implementation of these tokens and components: [FRONTEND.md](FRONTEND.md) §10.
- Accessibility and privacy constraints on what appears on screen:
  [SECURITY.md](SECURITY.md) §7.

---

## 2. Brief

| Question | Answer |
|---|---|
| Subject | Patient navigation and closed-loop referral for Bangladesh public and private facilities |
| Patient audience | Adults on mid- and low-range Android phones, often on mobile data, often worried or unwell, reading Bangla first, varied literacy |
| Clinician audience | Doctors and coordinators at upazila complexes, district hospitals and private chambers; busy, interrupted, on shared desktops or their own phone |
| Patient's primary job | Describe the problem, get told plainly if it is an emergency, reach a suitable doctor, know what is happening next |
| Clinician's primary job | Clear a queue of decisions (appointment requests, referrals to approve, referrals to acknowledge, values to verify) quickly and without mistakes |
| What must feel premium | Calm precision: exact typography in both scripts, considered spacing, motion that explains what changed, zero clutter. Not luxury, not playful. |

---

## 3. Design system plan

### 3.1 Concept: the route

Bangladesh healthcare is a network of stops: community clinic, upazila
complex, district hospital, medical college. Patients get lost between them.
The product's promise is that someone always knows where the patient is on
that route. The interface makes that literal:

- A **route line** shows each journey as stops on a line. Completed stops are
  filled, the current stop has a ring, future stops are outlined.
- When a state advances (doctor accepts, receiver acknowledges, outcome
  returns), the line draws forward to the new stop. This is the only
  animation that plays without the user directly causing it, and it plays
  only when something really changed.
- The same line, live and responding to microphone level, is the listening
  indicator in voice triage. No glowing orb.

### 3.2 Color

| Token | Hex | Role |
|---|---|---|
| `mist` | `#EEF2F0` | App background (cool grey-green, not cream) |
| `paper` | `#FFFFFF` | Panels, inputs, reading surfaces |
| `ink` | `#16302A` | Primary text, icons (deep forest ink chosen to sit with `forest`, not a stand-in for black) |
| `ink-muted` | `#4E6660` | Secondary text (contrast 6.1:1 on `paper`) |
| `line` | `#CFD9D5` | Dividers, input borders |
| `forest` | `#0B5D4B` | Primary actions, selected state, links in patient UI |
| `turmeric` | `#D99A1E` | Route line, current-stop ring, focus halo. Never used for text on light backgrounds |
| `river` | `#1F5FA8` | Informational notices, links in clinician UI |
| `draft` | `#6B5AA6` | Anything not yet verified by a clinician: AI drafts, OCR candidates |
| `signal` | `#C42B1C` | Emergency pathway and destructive confirmation only |
| `signal-wash` | `#FBE9E7` | Emergency screen background |

Rules:

- `signal` appears nowhere except the emergency pathway, emergency referral
  mode, escalated referrals and destructive confirmation. If a user sees red,
  something urgent is happening.
- Unverified content always uses `draft` with a dashed 1.5px border and the
  word "Draft" (or "যাচাই হয়নি"). Verified content uses solid `line` borders.
  The difference must survive grayscale printing and color blindness, which
  is why the dash pattern carries the meaning, not the color alone.
- Status is never shown by color alone. Each status has a text label and a
  route-stop shape.
- All text pairs meet WCAG 2.2 AA (4.5:1 body, 3:1 large text and UI
  boundaries). Verify with the token checker in FRONTEND §10.3.

### 3.3 Typography

One family in two scripts: **Anek Bangla** and **Anek Latin** (Ek Type, open
font license, variable weight 100–800 and width 75–125). Using one family for
both scripts keeps Bangla and English the same visual weight on bilingual
screens, which most Bangla/Latin pairings fail at.

The width axis is the expressive tool:

| Use | Width | Weight | Size (mobile / desktop) | Line height |
|---|---|---|---|---|
| Patient screen title | 112 (semi-expanded) | 600 | 28 / 36 px | 1.25 |
| Section heading | 100 | 600 | 20 / 22 px | 1.3 |
| Body (Bangla) | 100 | 400 | 17 / 17 px | 1.65 |
| Body (English) | 100 | 400 | 16 / 16 px | 1.5 |
| Clinician table and queue text | 88 (semi-condensed) | 450 | 14 / 14 px | 1.4 |
| Numbers: vitals, results, times | 88 | 500, tabular figures | context size | — |
| Voice captions | 106 | 500 | 24 / 28 px | 1.45 |

- Bangla needs more size and line height than Latin because of conjuncts and
  vowel signs above and below the line. Never set Bangla below 15px.
- Patient UI is wide and open; clinician UI is condensed and dense. Same
  family, different width: that is how the two products look related without
  looking identical.
- Line length: 34–38 characters for Bangla body on mobile, ≤ 72 for English
  body on desktop.
- No all-caps labels, no letter-spaced eyebrows, no single-word color or
  italic accents in headings. Headings are sentence case.
- Tabular figures for any number that is compared in a column.
  `[⚠️ UNVERIFIED]` Anek's `tnum` support must be checked in Phase 1; if
  missing, use `font-variant-numeric` fallback to **Noto Sans** for numerals
  only.

### 3.4 Space, shape, elevation

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 72. Patient UI spaces sections
  at 32–48; clinician UI at 16–24.
- Radius by hierarchy, not one value for everything: 4px for inputs, chips and
  table rows; 12px for panels and sheets; full pill only for the voice control
  and the language switch.
- Elevation only for things that float above the page (sheets, menus,
  toasts): `0 8px 24px rgba(22,48,42,.14)`. Panels on the page use a 1px
  `line` border, not a shadow.
- No gradients, no glassmorphism, no illustrated blobs.

### 3.5 Iconography

Lucide icon set at 1.75px stroke, sized 20px (patient) / 18px (clinician),
always paired with a text label on primary actions. Route stops are drawn in
SVG, not icons.

### 3.6 Review against generic defaults

Checked against the common generated-design defaults before building:

| Default I was drifting toward | Change made and why |
|---|---|
| Teal + white "health app" palette | Moved to `forest` + `turmeric`. Forest relates to Bangladesh's green and the Sundarbans; turmeric reads as wayfinding signage and is distinct from every major health app in the region. |
| Dashboard as a grid of rounded stat cards | Clinician home is a single prioritized queue list with dividers. Counts appear as plain numbers in the queue tabs, not as hero tiles. |
| Pulsing gradient orb for voice | Replaced with the live route line, which ties voice to the product's main idea. |
| Fade-up entrance on every section | Removed. One orchestrated motion (route advance). Everything else animates only in response to the user. |
| Separate "nice" display serif for headings | Rejected: a Latin-only serif breaks on Bangla screens. Single family with width variation instead. |

---

## 4. Motion

### 4.1 Tokens

| Token | Duration | Easing | Use |
|---|---|---|---|
| `motion.feedback` | 120 ms | `cubic-bezier(.2,0,0,1)` | Press, toggle, checkbox |
| `motion.state` | 220 ms | `cubic-bezier(.2,.8,.2,1)` | Panel open/close, row leaving a queue, sheet |
| `motion.route` | 520 ms | `cubic-bezier(.65,0,.35,1)` | Route line drawing to a new stop |
| `motion.page` | 280 ms | `cubic-bezier(.2,.8,.2,1)` | Route-level transition (View Transitions API) |

### 4.2 Where motion is used

| Moment | Motion | Why it exists |
|---|---|---|
| State advances on a journey | Route stroke draws to the next stop; stop fills; label crossfades | Shows exactly what changed. Only plays when the state is newer than the last one the user saw (stored per object) |
| Clinician accepts or declines a queue item | Row collapses height over `motion.state`; next row moves up; toast confirms with the same verb ("Accepted") | Confirms the action and keeps the eye on the queue |
| Opening a queue item | Detail panel slides 16px and fades in, list stays put | Keeps spatial memory in a three-pane layout |
| Voice listening | Route line's live segment bends with microphone amplitude (smoothed, 30 fps cap) | Proves the mic is hearing them |
| Voice speaking | Caption text appears word by word in sync with TTS where timing data exists, otherwise whole sentence | Lets users read along; helps when audio is unclear |
| Draft becomes verified | Dashed border animates to solid over `motion.state` | Makes verification visible |
| Page navigation | Shared-element transition of the page title (View Transitions) | Continuity between list and detail |

### 4.3 Where motion is forbidden

- The emergency screen. It appears instantly, without transition, and nothing
  on it moves.
- Loading skeleton shimmer. Use a static skeleton; show a progress label after
  1 second ("Loading your appointments").
- Scroll-triggered reveals, parallax, hover lift on rows, animated counters.

### 4.4 Reduced motion

With `prefers-reduced-motion: reduce`, route advances render the final state
immediately with a 2px `turmeric` outline flash on the new stop (no movement),
the voice indicator becomes a static "Listening" label with a level bar that
updates without easing, and page transitions are instant.

---

## 5. Components

Each component lists its states. Built in FRONTEND §10.

| Component | Notes |
|---|---|
| `RouteLine` | Stops and exception branches come from MASTERPLAN §5 via the mapping in FRONTEND §6 (`src/state/routes.ts`); do not list states here. Variants: patient (vertical, large), clinician (horizontal, compact); terminal side states render as a branch off the line with a labeled end cap |
| `StatusLabel` | Text + stop shape; never color alone |
| `ActionBar` | Renders only `allowed_actions`; primary action right-aligned on desktop, bottom-fixed full-width on mobile; destructive actions require a reason sheet where MASTERPLAN requires a reason |
| `QueueList` | Row: patient name (Bangla + English if both), reason, age of item ("Waiting 2 h 10 min"), urgency; sorted by urgency then age; keyboard navigable (J/K, Enter) |
| `DraftBlock` | Dashed `draft` border, "Draft" tag, source chips; editable |
| `SourceChip` | Links a statement to its report page or record entry; opens the source beside the text |
| `ReportViewer` | Original file left, extracted fields right; clicking a field highlights its bounding box |
| `ConsentSheet` | Recipient, purpose, data categories as a plain list, expiry; buttons "Share with Dr. …" / "Don't share" |
| `VoicePanel` | Language switch, live route indicator, captions, End button, "Type instead" link |
| `EmergencyScreen` | Full-screen `signal-wash`, instruction text, call action if approved numbers exist (Q-06) |
| `SyncBadge` | `fhir_sync_status` and offline queue states: "Saved", "Saving…", "Not saved yet — will retry", "Needs attention" |
| `Toast` | Same verb as the action; no apologies; errors say what to do |
| `LanguageSwitch` | বাংলা / English pill; persists to profile |

---

## 6. Screens

ASCII wireframes show structure, not final proportions. All layouts are
left-aligned.

### 6.1 Patient home (mobile)

```text
┌──────────────────────────────┐
│ Medi Waypoint     বাংলা|En   │
│                              │
│ আপনার কী সমস্যা হচ্ছে,         │  ← title, width 112
│ বলুন। আমরা সঠিক ডাক্তার       │
│ খুঁজে দেব।                    │
│                              │
│ ●───○───○───○                │  ← route preview: Tell us → Doctor → Visit → Follow-up
│                              │
│ This is an automated guide,  │
│ not a doctor. In an          │
│ emergency, call …(Q-06)      │
│                              │
│ My appointments (1)          │
│ My reports                   │
│                              │
├──────────────────────────────┤
│ [  Start talking  ]          │  ← bottom-fixed primary, forest
│  Type instead                │
└──────────────────────────────┘
```

### 6.2 Voice triage

```text
Before start (permission explainer)
┌──────────────────────────────┐
│ Before we start              │
│ • We use your microphone     │
│   only while this screen is  │
│   open.                      │
│ • What you say is turned     │
│   into text and saved as     │
│   described in …(Q-05/Q-07)  │
│ • This is not a doctor.      │
│ Language  (বাংলা) (English)   │
│ [ Allow microphone ]         │
│  Type instead                │
└──────────────────────────────┘

Live session
┌──────────────────────────────┐
│ ← End           বাংলা|En      │
│                              │
│ কতদিন ধরে জ্বর?               │  ← assistant caption, 24px
│                              │
│ "তিন দিন, রাতে বেশি"          │  ← patient caption, ink-muted
│                              │
│ ~~~~~~~●                     │  ← live route segment (mic level)
│ Listening                    │
├──────────────────────────────┤
│ [ Pause ]   Type instead     │
└──────────────────────────────┘
```

States to design: permission prompt, permission denied (show how to enable +
"Type instead"), unsupported browser, connecting, listening, thinking
(after 600 ms only), speaking, reconnecting, connection lost (switch to text
with conversation kept), ended.

### 6.3 Emergency pathway

```text
┌──────────────────────────────┐  signal-wash background, no motion
│ This may be an emergency.    │  ← ink on wash, 28px
│                              │
│ [approved instruction text,  │
│  Q-06 — placeholder until    │
│  clinicians approve]         │
│                              │
│ [ Call … ] (if approved)     │  ← signal button
│ Show nearest emergency       │
│ facilities                   │
└──────────────────────────────┘
```

No further questions, no doctor booking, no "continue anyway" link (Architecture §5.2).

### 6.4 Triage summary review

Patient's words first, then structured fields as an editable list, then
guidance given with its source titles, then "Find a doctor". Editing a field
marks it "Changed by you".

### 6.5 Doctor discovery

Filters as a single row of chips: area (division → district → upazila
picker), specialty, "Available this week". Results are a list, not cards:
doctor name (both scripts), specialty, facility, next available slot as text.
Capacity shows "Reported 3 days ago by …" (INV-14), never a live-looking
indicator.

### 6.6 Appointment status (patient)

```text
┌──────────────────────────────┐
│ Dr. Rahima Khatun            │
│ Medicine, Tangail Sadar …    │
│                              │
│ ●  Request sent  10:42       │
│ │                            │
│ ◉  Waiting for doctor        │  ← current stop, turmeric ring
│ │  Requests expire after …   │  ← Q-04
│ ○  Confirmed                 │
│ ○  Visit                     │
├──────────────────────────────┤
│ [ Cancel request ]           │  ← only if in allowed_actions
└──────────────────────────────┘
```

### 6.7 Consent request (patient)

Shows: who will receive (doctor and facility names), why, exactly which
categories (list), how long. Two buttons of equal size: "Share with Dr. …"
and "Don't share". Refusing explains what happens next.

### 6.8 Clinician workspace (desktop, three panes)

```text
┌────────────┬─────────────────────────────┬──────────────────┐
│ Queue      │ Appointment request          │ Patient          │
│            │                              │                  │
│ Needs you  │ Karim Uddin, 54              │ Allergies        │
│  (7)       │ Requested Thu 10:30          │ Medicines        │
│ Incoming   │ ●───◉───○───○ (compact)      │ Last visits      │
│  refs (2)  │                              │ Reports          │
│ Verify (4) │ Triage summary               │                  │
│ Outgoing   │ "…patient words…"            │                  │
│            │                              │                  │
│ ▸ Karim U. │                              │                  │
│   Fever 3d │                              │                  │
│   2 h      ├─────────────────────────────┤                  │
│ ▸ Nasima … │ [Decline] [Propose time] [Accept]               │
└────────────┴─────────────────────────────┴──────────────────┘
```

- Below 1024px: queue → detail as two screens; patient context becomes a tab.
- Facility switcher top-left when the user has multiple memberships; the
  active facility is always visible.

### 6.9 Report verification

Split view: original report (zoomable, page thumbnails) left; extracted fields
right as a table with confidence shown as "Check this" markers on low-
confidence rows (not percentages). Earlier results for the same test appear
under each row with date and lab (INV-15). Button: "Confirm values".

### 6.10 Referral workspace (sender)

Route line across the top (DRAFT → … → CLOSED). Draft summary in
`DraftBlock`s per section with `SourceChip`s. Right column: consent status,
destination, urgency. Actions from `allowed_actions` only: "Ask patient to
share", "Approve", "Send". After sending, the route draws to "Sent" and shows
"Waiting for Upazila … to acknowledge" with elapsed time.

### 6.11 Incoming referral (receiver)

Same layout, receiver actions: "Acknowledge", "Decline" (reason sheet),
later "Record outcome". Escalated items move to the top of the queue with a
`signal` left border and the escalation time.

### 6.12 Emergency referral mode

Full-width form with exactly five groups (identity or "Identity not
confirmed", reason, urgency as "Emergency" (default) or "Urgent", vitals,
treatment given). Large inputs, numeric
keypad for vitals, no optional fields visible until "Add more details". Sync
badge always visible; offline state reads "Saved on this device. Will send
when connected." Print slip action is available immediately after saving.

### 6.13 Printed slip

Proposed layout; final format is Q-09. A6 or A5 portrait, black only: reference code in large type, patient
identity, reason, urgency, vitals with times, treatment given, sending
facility and time, receiving facility. No QR unless Q-09 approves it.

---

## 7. Writing

- Patient UI defaults to Bangla; clinician UI defaults to English (common
  clinical practice), both switchable.
- Bangla copy is written in Bangla by a fluent writer and reviewed by the
  clinician for clinical text, not machine-translated from English.
- Buttons name the action, and the result uses the same verb: "Accept request"
  → toast "Request accepted"; "Send referral" → route stop "Sent".
- Errors say what happened and what to do, without apology: "Microphone is
  blocked. Turn it on in your browser settings, or type instead."
- Empty states invite the next action: "No requests waiting. New requests
  appear here."
- Never say "AI" to patients in a way that implies a doctor; say "automated
  guide". Never say "diagnosis".
- No middle-dot meta strings in final copy; use separate lines or commas.

---

## 8. Accessibility

- WCAG 2.2 AA. Touch targets ≥ 44×44 px. Visible focus: 2px `ink` outline +
  4px `turmeric` halo.
- Every voice feature has a text equivalent. Captions are always on.
- Screen-reader labels in the active language; set `lang="bn"` / `lang="en"`
  on mixed-language fragments.
- Route line has a text alternative: an ordered list of stops with states.
- Test with TalkBack (Bangla voice) on a low-end Android device and with
  keyboard-only navigation on the clinician dashboard.

---

## 9. Design deliverables by phase

| Phase | Deliverable |
|---|---|
| 0 | Token file, type specimen in both scripts, wireframes for §6.2, §6.6, §6.8, §6.10 |
| 1 | Primitive components (§5) in Storybook with all states |
| 2–3 | Discovery, appointment flow, clinician queue |
| 4–5 | Chart, report viewer, referral workspace, consent sheet |
| 6 | Draft/verified styling, source chips |
| 7 | Voice panel states, emergency screen |
| 8 | Emergency mode form, slip print layout |
| 9 | Usability test findings and revisions |
