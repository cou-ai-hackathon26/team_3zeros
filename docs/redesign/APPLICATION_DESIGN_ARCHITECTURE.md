# Medi Waypoint — Application Design Architecture

> **BLUF:** Four shells replace the single `SiteNav`: public, auth, patient,
> and workspace (clinical and administration share a frame but not a
> navigation). Patients get a phone-first home whose largest tile is always
> their next step. Clinicians get one queue of decisions and four navigation
> items instead of eight. Admins get tables. Every page below names its
> purpose, its one primary action, its data source and its loading, empty,
> error and success states. No workflow rule moves into the browser: buttons
> on a case still come only from `allowed_actions`.

Read with: [PRODUCT_UX_AUDIT.md](PRODUCT_UX_AUDIT.md) (current defects),
[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (components named here),
[AUTH_RBAC_ARCHITECTURE.md](AUTH_RBAC_ARCHITECTURE.md) (who sees which
shell). Endpoints are those in `MASTERPLAN.md` §6.3; paths are relative to
`/api/v1`.

---

## 1. Shells

| Shell | Route group | Who | Frame |
|---|---|---|---|
| Public | `(public)` | Anyone | `PublicHeader`, content, footer |
| Auth | `(auth)` | Signed-out users | Split brand/form layout, no navigation |
| Patient | `(patient)` | `patient` | Top bar + bottom tab bar (phone) or top navigation (desktop); single column |
| Focus | inside `(patient)` and `(clinician)` | Triage session; emergency referral form | No navigation, one exit control. Used where interruption is harmful |
| Workspace: clinical | `(clinician)` | `clinician`, `facility_staff` | Sidebar + panes |
| Workspace: administration | `(admin)` | `facility_admin`, `platform_admin` | Same sidebar frame, different items; table pages |

Patient and clinical interfaces are deliberately different products in one
system: patient screens are single-column, large type, serif titles, one
action; clinical screens are dense, sans only, keyboard-driven, several
panes. They share tokens, components and the handover tracker.

### 1.1 Route changes

| Change | Reason |
|---|---|
| `/` becomes the landing page ([LANDING_PAGE_ARCHITECTURE.md](LANDING_PAGE_ARCHITECTURE.md)) | No landing page exists |
| New `/home` (patient) | The signed-in patient home was mixed into `/` |
| New `/consents` (patient list) | `GET /consents` exists; today the nav links to a hardcoded request |
| New `/notifications` (all signed-in shells) | `GET /notifications` exists; no UI |
| New `/patients` (clinical search) | `GET /patients?q=` exists; today the nav links to one hardcoded chart |
| New `/referrals` (clinical index with Incoming / Outgoing tabs); `/referrals/incoming` and `/referrals/outgoing` stay as the tab URLs | Two separate pages duplicated one list |
| Auth routes as in AUTH_RBAC §3.1 | — |
| All 22 existing routes keep their URLs | No functionality removed |

These change the route map in `docs/FRONTEND.md` §3 and are applied to that
document in Phase 0.

### 1.2 Contract gaps found while specifying pages

Not resolved here. Each needs a `MASTERPLAN.md` decision; until then the
page shows the stated fallback.

| ID | Gap | Affects | Fallback |
|---|---|---|---|
| G-1 | No endpoint lists documents waiting for verification (only `GET /documents/{id}`) | Clinical queue "To verify" tab | Tab shows items announced by `document.extraction_ready` events in this session plus reports listed in an opened chart; labelled "Recently ready" |
| G-2 | No endpoint lists a patient's own documents; `GET /patients/{id}/chart` is the nearest | Patient `/reports` | Read reports from the chart response if it includes them; otherwise empty state "Reports your doctor adds will appear here" |
| G-3 | `GET /directory/practitioners` returns name, registration number, specialties, facilities. It does not return a next available slot, and the view reads `area`, `specialty`, `facility` but not `available_from` | Doctor discovery | Slots load per doctor on expand (`GET /practitioners/{id}/slots`); "Available this week" filter hidden until the parameter is honoured |
| G-4 | `GET /auth/me` has no membership list (audit A-03) | Facility switcher | Active facility shown as text, no switcher |
| G-5 | `/admin/*` exposes list `GET`s only; schedules and staff return empty lists (audit A-06) | Admin pages | Read-only tables with empty states; create and edit controls are not rendered |
| G-6 | No endpoint lists a patient's triage sessions | Patient home "continue" | Resume only from the session ID kept in the current tab |

---

## 2. Patterns used on every page

| Pattern | Rule |
|---|---|
| Data | TanStack Query through `api/client.ts` and `api/queries/`. Refetch on focus and on the matching WebSocket event (`MASTERPLAN.md` §6.4); polling fallback |
| Loading | `Skeleton` in the shape of the content. After 1 second a text label appears |
| Empty | `EmptyState`: one sentence on what appears here, one action if there is one |
| Error | `ErrorState` with the message for `error.<code>`, "Try again", and the request ID for unknown codes. `404`: the shared not-found screen |
| Case actions | `ActionBar` renders `allowed_actions`. Actions that need a reason, an alternate slot or an outcome open a `Dialog` (desktop) or `Sheet` (phone) |
| Pending | `pending_action` or `fhir_sync_status=PENDING` → `SyncBadge` "Saving…"; other actions disabled. `423` → refetch, no retry. `412` → refetch and "This was updated by someone else. Review the latest version." |
| Success | Toast with the action's verb, and the tracker advances |
| Titles | Browser tab titles never contain a patient name (`SECURITY.md` §7.2) |
| Copy | All strings from message files; no project IDs in text; open-question placeholders render as "Not yet available" or the marked placeholder text, never as "(Q-06)" |

---

## 3. Public shell

| Route | Purpose | Primary action | Notes |
|---|---|---|---|
| `/` | Explain the product; send patients to triage and staff to sign-in | "Describe your problem" → `/triage` | Full specification in [LANDING_PAGE_ARCHITECTURE.md](LANDING_PAGE_ARCHITECTURE.md). A signed-in user sees "Go to my home" in the header instead of the sign-in links |
| `/access` | How staff get accounts | "Staff sign in" | AUTH_RBAC §6.3 |
| not-found, error | Recovery | "Go to home" | Plain, in both languages |

### 3.1 Auth shell

| Route | Purpose | Primary action | Notes |
|---|---|---|---|
| `/login` | Patient sign-in by phone code | "Send code", then "Sign in" | Replaces the current two-chip form. Full flow, states and errors in [AUTH_RBAC_ARCHITECTURE.md](AUTH_RBAC_ARCHITECTURE.md) §4.1 |
| `/login/staff` | Staff sign-in with password, then verification code | "Sign in", then "Verify" | AUTH_RBAC §4.2 |
| `/login/choose`, `/signed-out`, `/not-authorised` | Session edges | One button each | AUTH_RBAC §4.3–§5.5 |
| `/welcome`, `/login/staff/reset`, `/verify-email` | Flagged flows | — | AUTH_RBAC §6 |

---

## 4. Patient shell

### 4.1 Frame

```text
Phone                                   Desktop (lg+)
┌──────────────────────────┐            ┌────────────────────────────────────────────┐
│ ◇ Medi Waypoint  বাংলা|EN ◯│            │ ◇ Medi Waypoint  Home Doctors Appointments │
├──────────────────────────┤            │                  Reports      বাংলা|EN  ◯  │
│                          │            ├────────────────────────────────────────────┤
│  page content            │            │          page content (max 640px,          │
│  (single column)         │            │           home bento max 960px)            │
│                          │            └────────────────────────────────────────────┘
├──────────────────────────┤
│ Home Doctors Appts Reports│  ← tab bar: icon + label, 4 items
└──────────────────────────┘
```

- Tab bar items: Home, Doctors, Appointments, Reports. Each has an icon and
  a text label; the current item has `aria-current="page"`.
- Account menu (◯): name, "Sharing permissions" (`/consents`),
  "Notifications", language, "Sign out". A dot on the avatar and on the
  menu item marks a pending consent request or unread notification.
- Inner pages (detail screens) replace the mark with a back control and the
  page title.
- Triage is not a tab. It is the primary action on Home and runs in the
  Focus shell.
- Whether `/triage` and `/doctors` work without signing in is open question
  Q-03. The shell supports both: signed-out visitors see the top bar with
  "Sign in" and no tab bar.

### 4.2 `/home` — patient home (new)

Purpose: answer "what is happening with my care, and what do I do next?"

```text
Phone (stacked in this order)            Desktop bento (12 columns)
┌──────────────────────────┐            ┌───────────────────────────┬───────────────┐
│ Next step  (brand tile)  │            │ Next step (brand, 8 cols) │ Describe a    │
│ With Dr. Rahima Khatun   │            │ holder line + tracker     │ problem (4)   │
│ Waiting for the doctor   │            │ [ View request ]          │ [Start talking]│
│ ▮▮▯▯  [ View request ]   │            ├───────────────┬───────────┴───────────────┤
├──────────────────────────┤            │ Appointments  │ Reports     │ Sharing     │
│ Describe a problem       │            │ (4)           │ (4)         │ permissions │
│ [ Start talking ]  Type  │            │               │             │ (4)         │
├──────────────────────────┤            └───────────────┴─────────────┴─────────────┘
│ Appointments          ›  │             Automated-guide notice (full width, plain text)
│ Reports               ›  │
│ Sharing permissions   ›  │
└──────────────────────────┘
```

**Next-step tile.** Shows the first that applies, from real data only:

| Order | Condition | Holder line | Button |
|---|---|---|---|
| 1 | A `ConsentRequest` is `PENDING` | "Dr. … asks to see your record" | "Review request" |
| 2 | An appointment is `ALTERNATE_SLOT_PROPOSED` | "With you: the doctor proposed a new time" | "See new time" |
| 3 | An appointment is `REQUESTED` or `PATIENT_ACCEPTED` | "With Dr. …: waiting for a decision" | "View request" |
| 4 | An appointment is `CONFIRMED` | "Visit confirmed: {day, time}, {facility}" | "View visit" |
| 5 | A triage session is open in this tab (G-6) | "With you: finish describing your problem" | "Continue" |
| 6 | None | Title: the existing `patient.homeTitle` message | "Start talking" + "Type instead" |

When condition 6 applies, the separate "Describe a problem" tile is not
shown (the main tile is that action).

| State | Behaviour |
|---|---|
| Loading | Tile skeletons at final sizes |
| New account | Condition 6; the three small tiles show their empty sentence ("Your requests will appear here") |
| Error | Next-step tile shows `ErrorState`; "Describe a problem" stays usable because it does not depend on the failed request |
| Data | `GET /appointments`, `GET /consents`, `GET /notifications` |

The automated-guide notice ("This is an automated guide, not a doctor…")
and emergency instruction come from existing messages and the backend rule
set. Emergency numbers are open question Q-06 and are not shown until
approved.

### 4.3 Patient pages

| Route | Purpose | First thing seen | Primary action | Secondary | States and notes |
|---|---|---|---|---|---|
| `/triage` (Focus shell) | Describe the problem by voice or text | Before start: three plain statements (microphone use, what is saved, "not a doctor"), language choice | "Allow microphone" | "Type instead"; End | Existing `VoicePanel` phases kept (permission denied, unsupported, connecting, listening, thinking, speaking, reconnecting, lost → text). The clinician-style "live clinical intake draft" block and the provider settings are removed from the patient view. One exit: "End", which goes to summary review if a summary exists. Emergency interrupt renders `EmergencyScreen` instantly and replaces everything |
| `/triage/session/[id]` | Resume | Same screen, loaded from `GET /triage/sessions/{id}` | Resume | End | Uses the `id` (today it is ignored) |
| `/triage/summary/[id]` | Check what will be sent to a doctor | "Here is what you told us" in the patient's own words | "Confirm and find a doctor" (`POST …/summary/confirm`) | Edit a field (marked "Changed by you"); "This is wrong, start again" | Guidance given is listed with its source titles. Calls go through the API client (audit A-09) |
| `/doctors` | Choose a doctor | Filters: Area (sheet with division → district → upazila from `GET /directory/areas`), Specialty (from `GET /directory/specialties`; preselected from a confirmed triage summary when there is one) | Tap a doctor to expand slots → choose a time → "Request this time" (`POST /appointments`) | Clear filters | `ListRow` per doctor: name in both scripts, specialty, facility and area. Capacity as "Reported {time ago} by {source}" (INV-14). No tracker on this page. `409 slot_unavailable` → "That time was just taken. Choose another." and slots refetch. Empty: "No doctors match. Try a wider area." G-3 applies |
| `/appointments` | See all requests and visits | Two groups: "In progress" and "Past" | Open a row | "Find a doctor" in the page header | `ListRow`: doctor, facility, time, `StatusBadge`. No inline tracker in the list. Empty: "You have no requests yet." + "Describe your problem" |
| `/appointments/[id]` | Know who has the request and what happens next | `HandoverTracker` (patient variant) with the holder line as the page's main statement | From `allowed_actions`: accept or decline a proposed time, cancel | Attached triage summary (collapsed) | Expiry sentence appears only when the API returns `expires_at`; its policy is Q-04. Cancel asks for confirmation in a sheet |
| `/consents` (new) | See and control sharing | "Waiting for your answer" group first, then "Sharing now", then "Past" | Open a pending request | Revoke an active consent (confirmation states what revocation does and does not do, wording per Q-07) | Empty: "Nobody has asked to see your record." |
| `/consents/[requestId]` | Decide | Who will receive (doctor and facility), why, exactly which categories, for how long | Two buttons of equal size and weight: "Share with Dr. …" and "Don't share" | — | Neither option is styled as the default. After refusing: one sentence on what happens next. Consent wording comes from the backend policy version, not the message files |
| `/reports` | See own reports | List by date | Open a report (`POST /documents/{id}/download-link`) | Upload, only if the Q-11 flag is on | Verified and unverified reports are visibly different (draft treatment). G-2 applies |
| `/notifications` (new) | Catch up | Unread first | Open the related item | Mark read | Empty: "Nothing new." |
| `/welcome` | Profile completion | AUTH_RBAC §6.2 | "Continue" | — | Flagged |

---

## 5. Clinical workspace

### 5.1 Frame

```text
lg and above
┌──────────┬────────────────────────────────────────────────────────────┐
│ ◇        │ Page header: title · status · page actions                 │
│ Tangail  ├────────────────────────────────────────────────────────────┤
│ District │                                                            │
│ Hospital │  page panes                                                │
│──────────│                                                            │
│ Queue  7 │                                                            │
│ Patients │                                                            │
│ Referrals│                                                            │
│──────────│                                                            │
│ Emergency│                                                            │
│ referral │                                                            │
│──────────│                                                            │
│ Alerts 3 │                                                            │
│ Dr. R.K. │                                                            │
│ Sign out │                                                            │
└──────────┴────────────────────────────────────────────────────────────┘
Below lg: sidebar becomes a sheet opened from a top bar that always shows the
active facility and "Emergency referral".
```

| Element | Rule |
|---|---|
| Facility | Top of the sidebar, always visible. A switcher when the user has several memberships (blocked by G-4; text until then). Switching clears all cached data |
| Navigation | Queue (count of items needing this user), Patients, Referrals, and Emergency referral set apart below a divider with the emergency icon. Items are filtered by AUTH_RBAC §5.3 |
| Removed from navigation | "Workspace", "Patient chart", "Verify OCR", "New draft": these were links to single hardcoded records. They are reached from the queue, a patient, or a referral |
| Footer | Notifications, user name and role, visible "Sign out" |
| Language | In the account menu; clinical default is English (`UIUX_DESIGN.md` §7) |
| Density | `dense` type, 16–24px spacing, `sm` controls on pointer devices |

### 5.2 `/dashboard` — queue

Purpose: clear decisions quickly. Three panes at `xl`; queue + detail at
`lg` with patient context as a tab in the detail; one pane at a time below.

```text
┌ Queue (360) ───────────┬ Detail (fluid) ─────────────────────┬ Patient (320) ──┐
│ Needs you 7 │ Incoming │ Karim Uddin, 54 · করিম উদ্দিন          │ Allergies       │
│ To verify   │ Outgoing │ With you: appointment request        │ Medicines       │
│────────────────────────│ ▮▮▯▯ Requested Thu 10:30             │ Last visits     │
│▌Nasima Begum   escalated│                                     │ Reports         │
│ Chest pain     40 min  │ Triage summary                       │                 │
│ Karim Uddin            │ "…patient's words…"                  │ [Open chart]    │
│ Fever 3 days   2 h     │ Structured fields                    │                 │
│ …                      ├──────────────────────────────────────┤                 │
│                        │        [Decline] [Propose time] [Accept]               │
└────────────────────────┴──────────────────────────────────────┴─────────────────┘
```

| Part | Specification |
|---|---|
| Tabs | Needs you, Incoming referrals, To verify, Outgoing. Counts are plain numbers from the list responses. Tabs really filter (today they do not). Tabs hidden by permission per AUTH_RBAC §5.3 |
| Rows | `QueueList`: name (both scripts), reason, waiting time, urgency as a word. Sorted by urgency then age. Escalated first with a `signal` inline-start bar and the escalation time |
| Keyboard | J / K move, Enter opens, existing behaviour; focus returns to the next row after an action |
| Detail | Header: patient, holder line, compact `HandoverTracker`. Body depends on item type: appointment (triage summary), incoming referral (summary and reason), verification (link to the split view). `ActionBar` pinned to the bottom of the pane |
| After an action | Row collapses (`state` motion), next row is selected, toast repeats the verb |
| Patient pane | `DescriptionList` from `GET /patients/{id}/chart`; "Open chart" |
| Data | `GET /appointments?role_view=…&state=…`, `GET /referrals?direction=incoming|outgoing`; G-1 for "To verify" |
| Empty | Per tab: "No requests waiting. New requests appear here." |
| Error | Per pane, so a failed chart does not block a decision |

### 5.3 Clinical pages

| Route | Purpose | First thing seen | Primary action | Secondary | States and notes |
|---|---|---|---|---|---|
| `/patients` (new) | Find a patient within scope | Search field (name, phone, identifier) | Open a chart | "Register patient" (`POST /patients`), if permitted | Results only for patients the user may see (`SECURITY.md` §4.3). Before searching: "Search by name, phone or ID." No "recent patients" list is invented |
| `/patients/[id]` | Read the chart | Identity header (name both scripts, age, sex, area); then `Tabs`: Summary, Visits, Reports, Referrals | "Refer this patient" → `/referrals/new?patient=…` | "Record visit" (`POST /patients/{id}/encounters`); open a report to verify | Duplicate-candidate notice is an `Alert` (attention) with "Same person" / "Different person" opening a confirmation dialog; nothing merges automatically (INV-13). Break-glass is not rendered (feature off, Q-07) |
| `/patients/[id]/reports/[docId]/verify` | Confirm OCR values against the original | Split view: original (zoom, pages) left; extracted values right | "Confirm values" (`POST …/extraction/verify`) | "Reject extraction"; edit a value | Low-confidence rows carry a "Check this" marker, not a percentage. Earlier results for the same test under each row (INV-15). Selecting a field highlights its box on the original. Below `lg`: tabs "Original" / "Values". FHIR-gated: after confirming, `SyncBadge` shows "Saving…" until synced; the draft border turns solid only then. OCR failed: `ErrorState` with "Retry OCR" when allowed |
| `/referrals` (new index; tab URLs `/referrals/incoming`, `/referrals/outgoing`) | All referrals for the active facility, including finished ones | `Tabs`: Incoming, Outgoing; state filter chips | Open a referral | "New referral" (Outgoing tab, clinicians only) | `Table` at `lg`+, `ListRow` below. Columns: patient, other facility, urgency, state (`StatusBadge`), waiting time. Lookup by slip reference code (`GET /referrals/by-reference/{code}`) as a search field on Incoming |
| `/referrals/new` | Start a draft | Three steps on one page: patient and visit (pre-filled when opened from a chart; otherwise patient search then encounter), destination (`Combobox` of facilities with dated capacity text), urgency and reason | "Create draft" (`POST /referrals`) → goes to the workspace | Cancel | Choosing "Emergency" urgency offers "Use emergency referral instead" linking to `/emergency`. Field errors from `field_errors` |
| `/referrals/[id]` | Move a referral forward (sender or receiver) | Holder line and full `HandoverTracker` across the top; "Waiting for {facility} to acknowledge, {elapsed}" when sent | From `allowed_actions`: sender (ask patient to share, use existing consent, approve, send, reopen, cancel, close) or receiver (acknowledge, decline, start, record outcome) | "Generate draft" (`POST …/generate-draft`) in DRAFT | Two columns at `lg`: left, summary sections as `DraftBlock`s with `SourceChip`s (opening a source shows it beside the text); right, `DescriptionList` of destination, urgency, consent state, reference code, history. Content editable only in DRAFT. Approve stays disabled until an edited draft is saved. Emergency referrals show the five-field dataset and the consent state text for `emergency_exception_pending_policy`. `FAILED_TO_SYNC`: `Alert` with "Retry" when allowed |
| `/emergency` (Focus shell) | Send an emergency referral in under a minute, online or not | Five groups only: identity (or "Identity not confirmed"), reason, urgency (`SegmentedControl` Emergency / Urgent, default Emergency), vitals, treatment given | "Save and send" | "Add more details"; "Print slip" immediately after saving | Large inputs, numeric keypad for vitals. `SyncBadge` always visible. Offline: "Saved on this device. Will send when connected." Conflict: both versions shown. 72-hour banner kept. No motion. Existing queue logic unchanged. Device enrolment is Q-09 and not shown |
| `/notifications` | As patient | — | — | — | Same component |

Facility staff see the same pages with fewer navigation items and fewer
actions; the difference comes from `me.permissions` (navigation) and
`allowed_actions` (case buttons), not from a separate set of screens.

---

## 6. Administration

Same sidebar frame as the clinical workspace, with its own items: Facility,
Schedules, Capacity, Staff. Bilingual, unlike today's English-only stubs.
Pages are `PageHeader` + `Table`. A platform admin additionally gets a
facility picker in place of the fixed facility name, because their scope is
all facilities.

| Route | Purpose | Content | Primary action | States and notes |
|---|---|---|---|---|
| `/facility` | Keep directory data correct | `DescriptionList` of facility details (name in both scripts, type, area, address, phone); tables of departments and services | "Edit details" (dialog) | G-5: read-only until write endpoints exist; the button is not rendered |
| `/schedules` | Manage slots | Practitioner list → slot table (date, time, state: Available, Held, Booked, Blocked) | "Add slots" | G-5: today the endpoint returns an empty list. Empty: "No schedules yet." |
| `/capacity` | Report capacity | Table of reports: service, value, reported at, source, "Out of date" marker when `is_stale` | "Add report" | Always shows time and source; never styled as live (INV-14). Staleness threshold is Q-08 |
| `/staff` | Manage accounts | Table: name, role, facility, permissions (as readable labels), status | "Add staff member" | G-5. Permission labels come from one message map keyed by the strings the backend actually uses (audit A-11). A "Requests" tab appears only with the access-request flag (AUTH_RBAC §6.3) |

### 6.1 Access requests (flagged)

Staff → Requests: table of pending requests (name, registration number,
requested at). Row actions: "Approve" (opens the normal add-staff dialog,
pre-filled) and "Decline" (reason required). Depends on proposed Q-16.

Audit metadata (`GET /audit/events`) has no screen in the current code and
none is added here; `MASTERPLAN.md` §4.2 allows it for admins, and patient
visibility is Q-07. It is listed as future work in the implementation plan.

---

## 7. Component hierarchy

```text
app/[locale]/layout                fonts, MotionConfig, QueryClientProvider, Toaster
├─ (public)/layout                 PublicHeader, Footer
│   └─ page                        landing sections
├─ (auth)/layout                   AuthLayout (brand panel + form column)
├─ (patient)/layout                RequireArea("patient") → PatientShell (TopBar, TabBar)
│   ├─ home                        NextStepTile, Tile ×4
│   ├─ doctors                     FilterBar, ListRow → SlotPicker
│   ├─ appointments, [id]          ListRow · HandoverTracker, ActionBar
│   ├─ consents, [requestId]       ListRow · ConsentSheet
│   ├─ reports                     ListRow
│   └─ triage (FocusShell)         VoicePanel, EmergencyScreen
├─ (clinician)/layout              RequireArea("clinical") → WorkspaceShell(nav=clinical), IdleTimeout
│   ├─ dashboard                   Tabs, QueueList, DetailPane(HandoverTracker, ActionBar), PatientPane
│   ├─ patients, [id], verify      Search, Tabs, DescriptionList, ReportViewer
│   ├─ referrals, new, [id]        Table, Form, DraftBlock, SourceChip, ActionBar
│   └─ emergency (FocusShell)      EmergencyForm, SyncBadge, EmergencySlip
└─ (admin)/layout                  RequireArea("admin") → WorkspaceShell(nav=admin), IdleTimeout
    └─ facility, schedules, capacity, staff     PageHeader, Table, Dialog
```

Each page file contains layout and data wiring only. `screens.module.css`
is deleted when the last page stops importing it.

---

## 8. Responsive behaviour

| Element | Phone (< 768) | Tablet (768–1023) | Laptop and desktop (≥ 1024) |
|---|---|---|---|
| Patient navigation | Bottom tab bar | Bottom tab bar | Top navigation |
| Patient home | Tiles stacked, next step first | Two columns | Bento, 12 columns |
| `ActionBar` | Sticky bottom, primary full width | Sticky bottom | In the page or pane, right-aligned |
| Dialogs | Bottom sheets | Dialogs | Dialogs |
| Clinical frame | Top bar + sidebar as sheet; one pane at a time (queue → detail → patient tab) | Same; queue and detail side by side in landscape | Sidebar + two panes; three at ≥ 1280 |
| Tables | Stacked `ListRow`s with labels | Table, lower-priority columns hidden | Full table |
| Report verification | Tabs: Original / Values | Tabs | Split view |
| Filters | One "Filters" button opening a sheet | Chip row | Chip row |
| Tracker | Vertical | Vertical (patient), horizontal (clinical) | Same |

No horizontal scrolling at 360px width. Text wraps; names are never
truncated in queues (two lines allowed). Sticky bars respect safe-area
insets. Inputs are 16px so mobile browsers do not zoom.

---

## 9. Experience rules by audience

**Patient.** One decision per screen. Plain words: "automated guide", never
"AI" in a way that implies a doctor, never "diagnosis" (`UIUX_DESIGN.md`
§7). Every waiting state names who the patient is waiting for. Every
screen that ends a step says what happens next. Sensitive details (reason
for visit, specialty) never appear in notification previews or tab titles.
Bangla first.

**Clinician and staff.** The queue is the home. Every decision is reachable
in at most two interactions from the queue (select, act). Keyboard paths
for the queue and dialogs. Density over decoration: no tiles, no serif, no
landing-style motion. Draft and verified content never look alike. Sync
state is always visible on anything that leaves the facility.

**Admin.** Tables with clear column meaning, one primary action per page,
and honest empty states where the backend is not ready.
