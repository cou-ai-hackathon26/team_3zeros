# Medi Waypoint — UI/UX Design Plan

> **BLUF:** Sections 3–5 (design system, motion, components) are superseded
> by the "Handover" identity (MASTERPLAN D-15) and now live in
> [redesign/DESIGN_SYSTEM.md](redesign/DESIGN_SYSTEM.md),
> [redesign/UI_COMPONENT_LIBRARY_STRATEGY.md](redesign/UI_COMPONENT_LIBRARY_STRATEGY.md) and
> [redesign/APPLICATION_DESIGN_ARCHITECTURE.md](redesign/APPLICATION_DESIGN_ARCHITECTURE.md).
> The brief (§2), writing rules (§7) and accessibility rules (§8) are unchanged.
> Behaviour rules that survive the redesign: emergency red is reserved for
> emergencies; the emergency screen has no motion; drafts are marked by
> pattern and word, never colour alone; status is never colour alone.

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

## 3. Design system

Superseded. See [redesign/DESIGN_SYSTEM.md](redesign/DESIGN_SYSTEM.md) for
identity, colour, typography, space and the bento rule (§4.1), and for
iconography (§7). The "route line" concept and the `forest`/`turmeric`/Anek
values that used to be here no longer apply to new work.

## 4. Motion

Superseded. See [redesign/DESIGN_SYSTEM.md](redesign/DESIGN_SYSTEM.md) §5:
two tiers (functional everywhere; expressive on the public landing and auth
pages only, listed in UI_COMPONENT_LIBRARY_STRATEGY §4). Unchanged rules:

- The emergency screen appears instantly and nothing on it moves.
- No skeleton shimmer, parallax, hover lift on rows, animated counters, or
  looping and autoplaying animation.
- With `prefers-reduced-motion: reduce`, every animation renders its final
  state immediately.

## 5. Components

Superseded. See [redesign/DESIGN_SYSTEM.md](redesign/DESIGN_SYSTEM.md) §6 and
[redesign/UI_COMPONENT_LIBRARY_STRATEGY.md](redesign/UI_COMPONENT_LIBRARY_STRATEGY.md) §3.
Behavioural contracts that carry over unchanged: `ActionBar` renders only
`allowed_actions` and asks for a reason where MASTERPLAN requires one;
`ConsentSheet` offers "share" and "don't share" with equal weight; `DraftBlock`
is marked by dashed border and the word "Draft"; `SyncBadge` shows "Saved",
"Saving…", "Not saved yet — will retry", "Needs attention"; the emergency
screen is full-screen and static.

---

## 6. Screens

> Where a screen below overlaps a page in
> [redesign/APPLICATION_DESIGN_ARCHITECTURE.md](redesign/APPLICATION_DESIGN_ARCHITECTURE.md),
> that document wins on layout. The behaviour in §6.3, §6.12 and §6.13
> (emergency, offline emergency form, printed slip) is unchanged.

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
│ [  Start talking  ]          │  ← bottom-fixed primary
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
│ ◉  Waiting for doctor        │  ← current stop
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

- WCAG 2.2 AA. Touch targets ≥ 44×44 px. Visible focus: as defined in
  redesign/DESIGN_SYSTEM.md §6.7.
- Every voice feature has a text equivalent. Captions are always on.
- Screen-reader labels in the active language; set `lang="bn"` / `lang="en"`
  on mixed-language fragments.
- The handover tracker has a text alternative: an ordered list of stops with states.
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
