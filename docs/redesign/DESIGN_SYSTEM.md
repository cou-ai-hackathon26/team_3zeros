# Medi Waypoint — Design System ("Handover")

> **BLUF:** The identity is built on one idea: care changes hands, and
> someone always holds the case. The signature element is the **handover
> tracker**, which names who has the case now. Colour is Bengal indigo on
> warm paper with a paddy-green accent used only on indigo. Type is Tiro
> Bangla (serif, titles) with Hind Siliguri (UI and body); both cover Bangla
> and Latin. Tokens live in `tokens.json` and generate a Tailwind v4 theme
> with the default palette removed, so a class that bypasses the tokens does
> not exist. Components are shadcn/ui source files restyled with these
> tokens.

This document replaces the values in `docs/UIUX_DESIGN.md` §3–§5 once
Phase 0 of [REDESIGN_IMPLEMENTATION_PLAN.md](REDESIGN_IMPLEMENTATION_PLAN.md)
is done. Until then `docs/UIUX_DESIGN.md` remains the rule for existing code.

Status labels used below: **Verified** = checked during this work (method
stated). **Candidate** = proposed, with a named check still to run.

---

## 1. Identity

### 1.1 Concept

Both audiences ask the same question. The patient: "Has the doctor seen my
request?" The referring doctor: "Did the hospital take my patient?" The
answer is always a holder: *you*, *Dr. Rahima*, *Tangail District Hospital*.
The previous identity drew a route with stops. This one names the holder.

| Principle | Meaning in the interface |
|---|---|
| Name the holder | Every case view states who has it now, in words, before anything else |
| One next step | Each screen has one primary action, or says plainly that the user is waiting and for whom |
| Marked until verified | AI and OCR output is visibly different from clinician-verified content, by pattern and word |
| Quiet by default | Colour, motion and elevation appear only where they carry meaning |
| Two scripts, one voice | Bangla and English have equal weight on every screen |

### 1.2 Mark and wordmark

- **Mark:** two interlocking chevrons, the left in indigo and the right in
  paddy on an indigo-deep tile, forming a single notch where they meet: one
  hand passing to the next. Drawn on a 24-unit grid, 2-unit stroke, usable at
  16px. On light backgrounds without the tile, both chevrons are indigo and
  the notch is the negative space.
- **Wordmark:** "Medi Waypoint" in Hind Siliguri 600, sentence case, ink.
- **Open item:** no project document gives a Bangla form of the product
  name. The wordmark stays in Latin until the product owner supplies one.
- The same notch shape joins the segments of the handover tracker (§6.1), so
  the mark and the product's main component are visibly the same idea.

### 1.3 What the identity never uses

Stock photos of doctors, stethoscope or heart-pulse icons as decoration,
teal-and-white "health app" colour, glass blur, gradient text, glowing orbs,
3D illustration, emoji as icons.

---

## 2. Colour

### 2.1 Primitive tokens

| Token | Hex | Notes |
|---|---|---|
| `paper` | `#FAF7F2` | Page background. Warm, so white panels read as surfaces |
| `surface` | `#FFFFFF` | Panels, inputs, reading surfaces |
| `sunken` | `#F1ECE3` | Wells, table header, inactive tracker segments |
| `ink` | `#1A1B2E` | Text, icons. A blue-black that sits with indigo |
| `ink-muted` | `#55586E` | Secondary text |
| `line` | `#DAD3C6` | Dividers and panel borders (decorative; not relied on for meaning) |
| `line-strong` | `#8A8577` | Input and control borders |
| `indigo` | `#2A3990` | Primary action, selected state, links, focus ring |
| `indigo-hover` | `#212D75` | Hover and pressed state of primary |
| `indigo-deep` | `#151A45` | Brand surfaces: landing hero panel, auth brand panel, clinical sidebar |
| `indigo-wash` | `#E9ECFA` | Selected row, current tracker segment, informational notice |
| `paddy` | `#B9E36B` | Accent **on indigo surfaces only**: primary button on dark, "now" marker |
| `positive` | `#1D6B45` | Confirmed, verified, synced (always with icon and word) |
| `positive-wash` | `#E3F3EA` | Background of positive notices |
| `ochre` | `#8A5A00` | Draft and unverified content |
| `ochre-wash` | `#FBF1DC` | Background of draft blocks |
| `signal` | `#C42B1C` | Emergency and destructive confirmation only (unchanged from the previous system) |
| `signal-wash` | `#FBE9E7` | Emergency screen background (unchanged) |

Why indigo: it is historically tied to Bengal, it is not the teal or green
of regional health apps, and it leaves green and red free for their
conventional meanings. Why warm paper: it lowers glare on low-end phone
screens used outdoors and makes white surfaces legible as surfaces without
shadows.

### 2.2 Contrast

**Verified** by computing WCAG 2.x contrast ratios for these exact values
(same formula as `frontend/scripts/check-contrast.mjs`).

| Foreground on background | Ratio | Requirement | Result |
|---|---|---|---|
| `ink` on `paper` / `surface` / `sunken` | 15.85 / 16.93 / 14.39 | 4.5 | Pass |
| `ink-muted` on `paper` / `surface` / `sunken` | 6.53 / 6.98 / 5.93 | 4.5 | Pass |
| `surface` on `indigo` / `indigo-hover` | 10.07 / 12.38 | 4.5 | Pass |
| `indigo` on `paper` / `surface` / `indigo-wash` / `sunken` | 9.42 / 10.07 / 8.55 / 8.55 | 4.5 | Pass |
| `ink` on `indigo-wash` | 14.39 | 4.5 | Pass |
| `surface` on `indigo-deep` | 16.59 | 4.5 | Pass |
| `paddy` on `indigo-deep` / `indigo` | 11.27 / 6.84 | 4.5 | Pass |
| `indigo-deep` on `paddy` | 11.27 | 4.5 | Pass |
| `positive` on `surface` / `positive-wash` | 6.48 / 5.64 | 4.5 | Pass |
| `ochre` on `surface` / `paper` / `ochre-wash` | 5.93 / 5.55 / 5.28 | 4.5 | Pass |
| `signal` on `surface` / `signal-wash`; `surface` on `signal` | 5.66 / 4.83 / 5.66 | 4.5 | Pass |
| `ink` on `signal-wash` | 14.44 | 4.5 | Pass |
| `line-strong` on `surface` / `paper` (control boundary) | 3.68 / 3.45 | 3.0 | Pass |
| `line` on `surface` | 1.49 | — | Decorative only. Never the sole indicator of a control or a state |
| `paddy` on `surface` | 1.47 | — | **Forbidden pairing.** Paddy never appears on light backgrounds |

These pairs become the pair list in `check-contrast.mjs`, so the build fails
if a later edit breaks one.

### 2.3 Semantic tokens

Components use semantic names only. The shadcn variable names are kept so
its components work without edits.

| Semantic (shadcn name) | Primitive |
|---|---|
| `background` / `foreground` | `paper` / `ink` |
| `card`, `popover` / their `-foreground` | `surface` / `ink` |
| `primary` / `primary-foreground` | `indigo` / `surface` |
| `secondary`, `muted` / `muted-foreground` | `sunken` / `ink-muted` |
| `accent` / `accent-foreground` | `indigo-wash` / `ink` |
| `destructive` | `signal` |
| `border` / `input` / `ring` | `line` / `line-strong` / `indigo` |
| `brand` / `brand-foreground` / `brand-accent` (added) | `indigo-deep` / `surface` / `paddy` |
| `draft` / `draft-wash` (added) | `ochre` / `ochre-wash` |
| `positive` / `positive-wash` (added) | `positive` / `positive-wash` |
| `emergency` / `emergency-wash` (added) | `signal` / `signal-wash` |

### 2.4 Colour rules

- `signal` appears only on the emergency pathway, emergency referral mode,
  escalated referrals and destructive confirmation.
- Status is never shown by colour alone: every status has a word and an icon
  or shape.
- Draft content: `ochre` 1.5px **dashed** border, `ochre-wash` background and
  the word "Draft" / "যাচাই হয়নি". Verified content: solid `line` border. The
  dash carries the meaning in greyscale print.
- No gradients in the application. No dark theme in this release (none is
  required by any project document; the semantic layer allows one later).

---

## 3. Typography

### 3.1 Families

| Role | Family | Weights | Used for |
|---|---|---|---|
| Serif (`font-serif`) | **Tiro Bangla** | 400, 400 italic | Landing headlines, auth titles, patient page titles, the holder line of the tracker in patient views |
| Sans (`font-sans`) | **Hind Siliguri** | 400, 500, 600 | All UI, body, clinical and admin text, numbers |

**Verified** from the Google Fonts CSS API on 2026-11-23: both families ship
`bengali`, `latin` and `latin-ext` subsets; Tiro Bangla has only weight 400
in regular and italic; Hind Siliguri has static weights 300–700 and no
variable axes. Measured `bengali` subset WOFF2 sizes: Hind Siliguri about
40 KB per weight, Tiro Bangla 55 KB, against 448 KB for the single Anek
Bangla variable file loaded today. Three Hind weights plus Tiro regular are
about 175 KB of Bangla font data, and only the regular weights are preloaded.

**Candidate, to check in Phase 1:** (1) tabular figures (`tnum`) in Hind
Siliguri for both digit sets; if absent, numbers in comparison columns fall
back to a tabular numeral face for digits only, as the previous system
planned; (2) rendering of common conjuncts in both families on a low-end
Android device; (3) a fluent Bangla reader's sign-off on Tiro Bangla for
headlines. If Tiro fails (3), titles use Hind Siliguri 600 and the system
still holds.

Consequences of the choice, stated plainly:

- Tiro Bangla has no bold. Emphasis in titles comes from size and from the
  serif/sans contrast, never from faux bold. `font-synthesis: none` is set.
- There is no width axis. Patient and clinical interfaces differ by size,
  spacing and the presence of the serif, not by glyph width.
- Serif titles appear only in public, auth and patient areas. Clinical and
  admin areas are sans only, which keeps them dense and plainly functional.

### 3.2 Scale

| Token | Family | Size mobile / desktop | Weight | Line height (en / bn) | Use |
|---|---|---|---|---|---|
| `display` | serif | 36 / 56 px | 400 | 1.12 / 1.3 | Landing hero only |
| `title` | serif | 26 / 32 px | 400 | 1.2 / 1.35 | Patient and auth page titles, landing section titles |
| `heading` | sans | 20 / 22 px | 600 | 1.3 / 1.45 | Section headings; clinical and admin page titles |
| `subheading` | sans | 16 / 17 px | 600 | 1.4 / 1.5 | Card and group titles |
| `body` | sans | 16 px (en), 17 px (bn) | 400 | 1.5 / 1.65 | Patient and public body text |
| `dense` | sans | 14 px (en), 15 px (bn) | 400, 500 for names | 1.4 / 1.55 | Clinical queue, tables |
| `caption` | sans | 13 px (en), 15 px (bn) | 400 | 1.4 / 1.55 | Metadata, help text |
| `code` | sans, tabular | 28 px | 600 | 1.2 | OTP entry, reference codes |

Rules: Bangla is never set below 15px. Sentence case everywhere; no all-caps
labels and no letter-spaced eyebrows (Bangla has no capitals, so the two
languages would diverge). Line length 34–38 characters for Bangla body on
phones, at most 72 for English on desktop. `font-variant-numeric:
tabular-nums` on any number compared in a column. Vitals and lab values keep
Latin digits in clinical views; patient views use Bangla digits in Bangla
(`FRONTEND.md` §7, unchanged).

---

## 4. Space, layout, shape, elevation

| Scale | Values |
|---|---|
| Spacing (px) | 4, 8, 12, 16, 24, 32, 48, 64, 96 |
| Radius | `control` 6px (buttons, inputs, chips, table rows); `panel` 10px (cards, panels, dialogs); `tile` 16px (bento tiles, sheets, landing panels); `pill` (language switch, voice control only) |
| Border | 1px `line` for panels; 1px `line-strong` for controls; 1.5px dashed `ochre` for drafts |
| Elevation | `none` for anything in the page flow; `raised` `0 1px 2px rgba(26,27,46,.08)` for sticky bars; `float` `0 12px 32px rgba(26,27,46,.16)` for dialogs, sheets, menus, toasts |
| Breakpoints | Tailwind defaults: `sm` 640, `md` 768, `lg` 1024, `xl` 1280 |

Layout containers:

| Context | Container | Section spacing |
|---|---|---|
| Landing | 12 columns, max 1200px, 24px gutters (16px below `md`) | 96px (64px below `md`) |
| Auth | Split 5/7 at `lg`; single column 400px form | 32px |
| Patient | Single column, max 640px; patient home bento max 960px | 32–48px |
| Clinical | Full width; sidebar 248px (64px collapsed); queue 360px; detail fluid; context 320px | 16–24px |
| Admin | Sidebar 248px; content max 1200px | 24px |

### 4.1 When to use a bento layout

A bento grid is used only where the items are different kinds of thing with
different amounts of content, and the user benefits from seeing them
together. That is true in two places: the landing "what it does" section
and the signed-in patient home. Lists of like items (doctors, appointments,
queue rows, staff) are lists or tables, never tiles. Tiles in one grid may
differ in size only when their content differs in importance; the largest
tile always holds the user's next step.

---

## 5. Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `feedback` | 120 ms | `cubic-bezier(.2,0,0,1)` | Press, toggle, checkbox |
| `state` | 220 ms | `cubic-bezier(.2,.8,.2,1)` | Dialog, sheet, row leaving a queue, step change in a form |
| `handover` | 480 ms | `cubic-bezier(.65,0,.35,1)` | Tracker advancing to a new holder |
| `page` | 240 ms | `cubic-bezier(.2,.8,.2,1)` | Route transition (View Transitions API where supported) |
| `reveal` | 400 ms, once | `cubic-bezier(.2,.8,.2,1)` | Landing and auth only |

Two tiers:

| Tier | Where | Allowed |
|---|---|---|
| **Functional** | Whole application | Motion that answers a user action or shows a real state change. The tracker advance plays only when the server state is newer than the last one this user saw (existing `shouldAnimateRouteAdvance`) |
| **Expressive** | Landing page and auth layout only | One-time reveals on entering the viewport, one headline reveal, a scroll-linked tracker in "How it works", a finite beam animation in the handover diagram. Listed exhaustively in [UI_COMPONENT_LIBRARY_STRATEGY.md](UI_COMPONENT_LIBRARY_STRATEGY.md) §4 |

Forbidden everywhere: motion on the emergency screen (it appears instantly
and nothing moves); looping or autoplaying animation; skeleton shimmer;
parallax; cursor effects; hover lift on rows; animated counters.

`prefers-reduced-motion: reduce`: all durations become 0; the tracker shows
its final state with a 2px `indigo` outline on the new segment; reveals
render in their final state; the voice level indicator becomes a static
label with a level bar.

---

## 6. Components

All components live in `src/components/ui/` (shadcn source, restyled) or
`src/components/` (product components). One component per job; variants are
listed here and nowhere else.

### 6.1 Handover tracker (replaces `RouteLine`)

The signature component. Shows the stops of a case grouped by **who holds
it**.

```text
Patient view (vertical)                 Clinical view (horizontal, compact)

 With Dr. Rahima Khatun                  ┌ Sender ──────────┐┌ Patient ┐┌ Receiver ───────────┐
 Waiting for the doctor to decide        │ ● Draft  ● Ready ││ ● Consent││ ◆ Sent  ○ Ack  ○ …  │
                                         └──────────────────>└─────────>└─────────────────────┘
 ┃ You                                    Now: with Tangail District Hospital, 2 h 10 min
 ┃  ✓ Request sent  10:42
 ▼
 ┃ Dr. Rahima Khatun        ← now
 ┃  ◆ Waiting for decision
 ▼
 ┆ Visit
 ┆  ○ Confirmed
 ┆  ○ Visit
```

| Part | Specification |
|---|---|
| Holder line | First line, in words: "With you", "With Dr. …", "With {facility}", or "Closed". Serif `title` in patient view; sans `subheading` in clinical view. This line is the accessible name of the component |
| Segment | One per holder. Completed: `indigo` rail. Current: `indigo-wash` fill, 2px `indigo` border, "now" label. Upcoming: `sunken` fill, `ink-muted` text. Segments join with the notch from the mark |
| Stop | Inside its segment. Completed ✓, current ◆, upcoming ○: three shapes, so state survives without colour |
| Exception | Terminal side states (declined, cancelled, expired, no-show, failed to sync) end the tracker at the segment where they happened with an end cap, icon and label. Tone `emergency` (escalated, emergency pathway) uses `signal` |
| Data | Stops, aliases and exception branches come unchanged from `src/state/routes.ts`. A new map in the same file assigns each state a holder (`patient`, `practitioner`, `sender`, `receiver`, `system`, `none`) derived from the Actor column of `MASTERPLAN.md` §5. The tracker never lists states itself |
| Semantics | `<ol>` of segments, each containing an `<ol>` of stops; the current stop has `aria-current="step"`; SVG is `aria-hidden` |
| Motion | `handover` token; rules in §5 |
| Use | Only where a real case exists: appointment detail, referral workspace, triage session, queue detail. Never as a navigation bullet, a decoration, or a preview of a case that does not exist |

### 6.2 Actions

| Component | Variants | Sizes | States | Rules |
|---|---|---|---|---|
| `Button` | `primary` (indigo), `secondary` (surface, `line-strong` border), `quiet` (text only), `danger` (signal), `on-brand` (paddy on indigo-deep) | `lg` 52px (patient primary), `md` 44px (default), `sm` 36px (clinical and admin on pointer devices at `lg`+ only) | default, hover, focus-visible, pressed, loading (spinner + verb, width fixed), disabled | One `primary` per view. `danger` only for destructive confirmation and the emergency call action. `on-brand` only on `brand` surfaces. Label is a verb phrase; the success toast repeats the verb |
| `ActionBar` (existing, restyled) | — | — | pending (`SyncBadge`), reason sheet open | Renders exactly `allowed_actions` through the action registry. Desktop: right-aligned, primary last. Mobile: sticky bottom, primary full width, others in a "More" menu when there are more than two |
| `LinkButton` | inline link, standalone link with arrow | — | default, hover, focus, visited (public pages only) | Links navigate; buttons act. A link is never styled as a chip |

### 6.3 Forms

| Component | Specification |
|---|---|
| `Field` | Wrapper: label above, optional help text, control, error text. Error uses an icon and words, `aria-describedby`, `aria-invalid`. Required fields are marked with the word "required", not an asterisk alone |
| `Input`, `Textarea` | 48px high (44px `dense`), 16px text (prevents iOS zoom), `line-strong` border, focus ring. Numeric fields accept Bangla and Latin digits and normalise (existing `normalizeDigits`) |
| `CodeInput` | Single field, `code` type style, `autocomplete="one-time-code"` |
| `PasswordInput` | Show/hide button with `aria-pressed` |
| `Select` | Native `<select>` on phones; shadcn `Select` on desktop. `Combobox` for facility and area pickers |
| `RadioGroup`, `Checkbox`, `Switch` | 44px touch rows; label is clickable |
| `SegmentedControl` | For 2–3 mutually exclusive views (language; urgency "Emergency / Urgent"). Not for navigation |
| Validation | On blur and on submit, never while typing. Server `field_errors` bind to fields; other error codes map to `error.<code>` messages (`FRONTEND.md` §5). Forms use React Hook Form + Zod, which are already installed |

### 6.4 Navigation

| Component | Use |
|---|---|
| `PublicHeader` | Landing and public pages: mark, section links, language switch, "Staff sign in" (quiet), "Describe your problem" (primary) |
| `PatientTopBar` + `PatientTabBar` | Patient shell: title and language on top; 4-item bottom tab bar on phones, the same items as a top nav at `lg` |
| `WorkspaceSidebar` | Clinical and admin shells: `brand` surface, facility switcher at the top, nav items with counts, account and sign-out at the bottom; collapses to icons at `lg`, becomes a sheet below `lg` |
| `Tabs` | Switch views of one object or one list (queue filters, chart sections). Underline style |
| `FilterChip` | Filters only. Shows selected state with a check icon and `aria-pressed` |
| `Breadcrumb` | Clinical and admin detail pages only, two levels at most |
| `PageHeader` | Title, optional status, optional one-line context, right-aligned page actions |

### 6.5 Surfaces and data

| Component | Variants and rules |
|---|---|
| `Panel` | The default container: `surface`, 1px `line`, `panel` radius, no shadow. Optional header row |
| `Tile` | Bento unit: `tile` radius; `default` (surface), `brand` (indigo-deep), `wash` (indigo-wash). Whole tile is one link when it has a single destination |
| `ListRow` | Like items in a list: title, meta, trailing status or chevron, divider. Used for doctors, appointments, reports, consents |
| `QueueList` (existing, restyled) | Dense rows: patient name (both scripts), reason, waiting time, urgency word. Escalated rows have a `signal` left border and sort first. J/K/Enter keyboard navigation kept |
| `Table` | Admin data. Sticky header on `sunken`, row height 44px, right-aligned tabular numbers. Below `md` each row becomes a stacked `ListRow` |
| `DescriptionList` | Label–value pairs (patient context, consent details, emergency slip preview) |
| `DraftBlock` (existing, restyled) | §2.4 draft treatment, source chips, editable. Border becomes solid when verified |
| `SourceChip`, `ReportViewer`, `ConsentSheet`, `VoicePanel`, `EmergencyScreen` | Behaviour unchanged; restyled with these tokens. `EmergencyScreen` keeps `signal-wash`, no motion, no secondary paths |

### 6.6 Status and feedback

| Component | Variants | Rules |
|---|---|---|
| `StatusBadge` (replaces `StatusLabel`) | `neutral`, `active` (indigo-wash), `positive`, `draft`, `attention` (ochre), `emergency` | Icon + word from `state.<entity>.<STATE>`. `control` radius, not a pill |
| `SyncBadge` (existing) | Saved, Saving…, Not saved yet (will retry), Needs attention | A `202` or `pending_action` is always "Saving…", never "Saved" (INV-12) |
| `Alert` | `info`, `positive`, `attention`, `emergency` | In the page flow, with icon, title, one sentence and at most one action |
| `Toast` | — | Confirms a completed action with the same verb; 5 seconds; never the only place an error is shown |
| `Dialog` / `AlertDialog` | — | Confirmation and reason capture. Focus trapped, Escape closes (except destructive pending). Becomes a bottom `Sheet` below `md` |
| `Sheet` | bottom (mobile), right (desktop context) | Consent, filters, reason entry |
| `Skeleton` | — | Static blocks in the shape of the content; after 1 second a text label appears ("Loading your appointments") |
| `EmptyState` | — | One sentence saying what will appear here and one action when there is one. No illustration |
| `ErrorState` | page, inline | What happened, what to do, "Try again", and the request ID for unknown errors |

### 6.7 Interaction states (all interactive components)

| State | Treatment |
|---|---|
| Hover (pointer only) | Background shifts one step (`surface` → `sunken`, `indigo` → `indigo-hover`). No movement |
| Focus-visible | 2px `indigo` outline with 2px offset. On `brand` surfaces the outline is `paddy` |
| Pressed | `feedback` duration darken; no scale |
| Selected | `indigo-wash` background plus a non-colour indicator (check icon, `aria-current`, or 2px inline-start bar) |
| Disabled | 40% opacity on content, `not-allowed` cursor, and the reason shown as help text where it is not obvious |
| Loading | Control keeps its width; label changes to the verb in progress |

---

## 7. Iconography and imagery

- **Icons:** `lucide-react` (already installed), 1.75px stroke, 20px in
  patient and public areas, 18px in clinical and admin. Decorative icons are
  `aria-hidden`; icon-only buttons have an accessible name and a tooltip.
- **Imagery:** no photography or illustration is required anywhere, which
  protects the patient-route budget ("no images on the critical path",
  `FRONTEND.md` §11). The landing page shows the product itself: real
  components rendered with synthetic sample data, labelled as an example.
- **Pattern:** a static dot grid (CSS background, no JavaScript) at low
  contrast on `brand` surfaces only.

---

## 8. Accessibility

- WCAG 2.2 AA. Contrast as §2.2. Touch targets at least 44×44px; `sm`
  controls only on pointer devices.
- Keyboard: everything reachable in visual order; skip link to main content;
  focus moves to the heading on route change and to the first error on
  failed submit; dialogs trap and restore focus.
- Language: `lang` on `<html>` and on mixed-language fragments
  (`lang="bn"` / `lang="en"`).
- Status never by colour alone; draft never by colour alone.
- Every voice feature has a text equivalent; captions always on.
- Reduced motion as §5.
- Test with TalkBack (Bangla voice) on a low-end Android phone and
  keyboard-only on the clinical workspace, as `docs/UIUX_DESIGN.md` §8
  already requires.

---

## 9. Tokens in code

```text
src/tokens/tokens.json          single source (three layers: primitive, semantic, component)
        │  scripts/build-tokens.mjs
        ▼
src/tokens/tokens.css           GENERATED. Tailwind v4 theme:
                                  @theme {
                                    --color-*: initial;        /* removes Tailwind's default palette */
                                    --color-paper: …; --color-indigo: …;   /* primitives */
                                    --font-sans: …; --font-serif: …;
                                    --radius-control: 6px; …
                                  }
                                  :root { --background: var(--color-paper); … }  /* shadcn semantics */
```

- Because the default palette is removed, `bg-blue-500` and similar classes
  do not compile to anything. Only token colours exist as utilities.
- Arbitrary values that bypass tokens (`bg-[#fff]`, `text-[rgb(...)]`, inline
  `style` colours) are blocked by a script, `npm run lint:tokens`, that fails
  on a hex, `rgb(` or `hsl(` literal anywhere in `src/` outside
  `src/tokens/`. This replaces the stylelint hex rule, which only covers CSS
  Modules.
- `check-contrast.mjs` keeps running in CI with the pair list from §2.2.
- Component-level tokens are added only when a component needs a value that
  differs from its semantic default (for example the tracker rail width).

---

## 10. Usage rules (review checklist)

1. One primary button per view.
2. Buttons act; links navigate; chips filter; tabs switch views. No
   component is restyled to do another's job.
3. The tracker appears only for a real case.
4. Lists for like items; tiles only under §4.1.
5. Red only under §2.4. Paddy only on indigo.
6. Serif only for titles in public, auth and patient areas.
7. No project IDs ("Q-11", "INV-10") in user-facing text.
8. Every data view has loading, empty and error states designed.
9. Every string comes from a message file in both languages.
10. Nothing is shown as done before the server says it is.
