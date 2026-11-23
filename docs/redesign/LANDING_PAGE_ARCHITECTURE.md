# Medi Waypoint — Landing Page Architecture

> **BLUF:** The landing page at `/` has one job for each audience: get a
> patient to start describing their problem, and show a clinician that a
> referral comes back with an outcome. It is built from the product's own
> components with sample data, not from stock imagery, and it makes no claim
> the repository cannot support: no statistics, testimonials, partner logos
> or certifications exist in project data, so none appear. Bangla is the
> default language. The page is server-rendered text first; four small
> effects are added on top.

Read with: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) (tokens, components),
[UI_COMPONENT_LIBRARY_STRATEGY.md](UI_COMPONENT_LIBRARY_STRATEGY.md) §4
(effects E1–E4), [PRODUCT_UX_AUDIT.md](PRODUCT_UX_AUDIT.md) §6 (defects that
gate some claims).

---

## 1. Positioning

| Question a visitor has | Answer the page gives | Source |
|---|---|---|
| What is this? | A website where you describe your health problem, get guided to a suitable doctor, and can see who has your request at every step | `MASTERPLAN.md` §2 |
| Who is it for? | Patients in Bangladesh; doctors and facility staff who refer and receive patients | `MASTERPLAN.md` §2, §3 |
| What problem does it solve? | People do not know which doctor to see; records do not travel with them; the referring doctor does not hear what happened | `MASTERPLAN.md` §2 ("carries their record between providers, and returns the referral outcome") |
| Why trust it? | It says plainly what it is not (not a doctor), and describes the controls that exist: consent before sharing, logged access, clinician verification of AI and OCR output | `MASTERPLAN.md` §2.1; `docs/SECURITY.md` |
| How does it work? | Four steps for patients; a closed loop for clinicians | `MASTERPLAN.md` §2 journeys |
| What is different? | Voice in Bangla; the handover tracker; outcomes return to the sender; emergency referral that works offline | INV-2, INV-3, §5.2, INV-16 |

Positioning line (English): **"Your care, handed over properly."**

Voice: plain, calm, specific. Second person. No superlatives, no "AI-powered",
no "revolutionary". The word "AI" is not used for the triage guide; it is
"automated guide" (`docs/UIUX_DESIGN.md` §7).

---

## 2. Visual direction

- **Ground:** `paper`. One `brand` (indigo-deep) panel in the hero and one
  in the final call to action. Everything between is light.
- **Type:** Tiro Bangla for the hero and section titles; Hind Siliguri for
  everything else. Large, left-aligned, generous line height for Bangla.
- **Imagery:** the product itself. Real `HandoverTracker`, `ListRow`,
  `StatusBadge` and `ConsentSheet` components rendered with synthetic data
  and captioned "Example with sample data". No photographs, no illustrated
  people, no device frames.
- **Signature:** the handover notch and tracker recur: in the mark, in the
  hero composition, as the rail in "How it works", and in the referral tile.
- **Sections differ on purpose:** hero (split, brand panel), problem (three
  plain statements in a row), how it works (vertical rail), features
  (bento), safety (two-column text list), audiences (two contrasting
  panels), final call (brand band). No two adjacent sections share a layout.
- **Not used:** gradients, glass, glow, parallax, counters, carousels,
  marquee, floating shapes.

---

## 3. Page structure

Order chosen so a patient can act within the first screen and a clinician
finds their section by the fourth.

| # | Section | Anchor | Job |
|---|---|---|---|
| 0 | Header | — | Identity, language, the two entry points |
| 1 | Hero | — | What it is; start |
| 2 | Problem | `#why` | Name the three failures the product addresses |
| 3 | How it works | `#how` | The patient journey in four steps |
| 4 | What it does | `#features` | Six capabilities, sized by importance |
| 5 | Safety and privacy | `#safety` | What the system does and does not do with your information |
| 6 | For patients / for doctors | `#for-doctors` | Benefits per audience; staff entry |
| 7 | Final call | — | One clear next step |
| 8 | Footer | — | Navigation, language, legal |

Sections considered and left out: testimonials, statistics, partner logos,
pricing, "as seen in", team. None has real content in the repository.

---

## 4. Section specifications

Copy is given in English as the content brief. Bangla is written by a
fluent writer and reviewed by a clinician where clinical, not translated by
machine (`docs/UIUX_DESIGN.md` §7). Bangla lines marked *existing* are
already in `i18n/messages/bn.json`.

### 4.0 Header

```text
Desktop:  ◇ Medi Waypoint    How it works  What it does  Safety  For doctors     বাংলা|EN   Staff sign in   [Describe your problem]
Phone:    ◇ Medi Waypoint                                            বাংলা|EN  ☰
```

- Sticky, `paper` with a 1px `line` bottom border once the page scrolls. No
  blur.
- "Describe your problem" is the only `primary` button. "Staff sign in" is
  `quiet`. There is no "Register": patients have no registration step
  ([AUTH_RBAC_ARCHITECTURE.md](AUTH_RBAC_ARCHITECTURE.md) §4.1).
- Signed-in visitors see "Go to my home" in place of both.
- Phone: section links, "Staff sign in" and "Patient sign in" move into a
  sheet opened by the menu button; the primary action stays in the hero and
  in a sticky bottom bar that appears after the hero scrolls away.

### 4.1 Hero

```text
Desktop (12 columns)
┌──────────────────────────────────────────┬──────────────────────────────────────┐
│ (7 cols, paper)                          │ (5 cols, brand panel, tile radius)   │
│                                          │                                      │
│ Your care, handed over properly.         │  With Dr. Rahima Khatun              │
│  ← display, serif                        │  Waiting for the doctor to decide    │
│                                          │  ▮▮▮ ▯▯▯ ▯▯▯   (HandoverTracker)     │
│ Describe your problem in Bangla or       │                                      │
│ English. We guide you to a suitable      │  ┌ Request to see your record ─────┐ │
│ doctor, and you can always see who has   │  │ Dr. … · Tangail District Hosp.  │ │
│ your request.                            │  │ [Share]  [Don't share]          │ │
│                                          │  └─────────────────────────────────┘ │
│ [ Start talking ]   Type instead         │                                      │
│                                          │  Example with sample data            │
│ This is an automated guide, not a        │                                      │
│ doctor. In an emergency, go to the       │                                      │
│ nearest emergency hospital immediately.  │                                      │
└──────────────────────────────────────────┴──────────────────────────────────────┘
```

| Element | Content | Notes |
|---|---|---|
| Headline | "Your care, handed over properly." | `display`. Bangla headline to be written; the existing `patient.homeTitle` ("আপনার কী সমস্যা হচ্ছে, বলুন। আমরা সঠিক ডাক্তার খুঁজে দেব।", *existing*) is the fallback and is acceptable as the hero line |
| Supporting text | "Describe your problem in Bangla or English. We guide you to a suitable doctor, and you can always see who has your request." | At most three lines on desktop |
| Primary | "Start talking" (*existing* `patient.startTalking`) → `/triage?mode=voice` | `lg` button with microphone icon |
| Secondary | "Type instead" (*existing*) → `/triage?mode=text` | Link, same line |
| Notice | *existing* `patient.automatedGuideNotice` | Always directly under the buttons, `ink-muted`, never hidden behind a tooltip. Emergency phone numbers are open question Q-06 and do not appear |
| Product panel | Tracker in the "waiting for doctor" state and a consent request, both the real components, non-interactive (`inert`, `aria-hidden`), with the caption | Names are the synthetic ones already used in the seed data |
| Effect | E2 on the headline, once. The panel is static | Reduced motion: no effect |

If Q-03 is decided as "account required", both buttons lead to `/login`
with `next=/triage`; the labels do not change.

Phone: headline, text, buttons, notice, then the panel below at full width.
Buttons are full width and stacked; the first screen at 360×640 shows the
headline, the supporting text and "Start talking" without scrolling.

### 4.2 Problem (`#why`)

Title: "Where care gets lost". Three statements side by side (stacked on
phones), each a short heading and one sentence, separated by vertical rules.
No icons, no cards.

| Heading | Sentence |
|---|---|
| "Which doctor?" | "When you are unwell it is hard to know what kind of doctor you need, or where to find one near you." |
| "Records stay behind" | "Reports and notes often do not reach the next doctor, so tests and questions are repeated." |
| "No word back" | "The doctor who refers a patient to a hospital often never learns what happened." |

Closing line, `subheading`: "Medi Waypoint keeps track at each handover."

These describe the problem the project documents set out to solve
(`MASTERPLAN.md` §2; success measures "Less repeated history/testing" and
"Referrers receive feedback" in `Medi_Waypoint_Project_Plan.md`). They
contain no numbers, because the repository has no measured figures. If the
team has pilot or published data, it can be added with its source.

### 4.3 How it works (`#how`)

Title: "From first symptom to the right doctor". A vertical handover rail
(effect E3) on the left; four steps on the right. On phones the rail is a
static line and the steps stack.

| # | Holder shown on the rail | Step title | Text | Small visual (real component, sample data) |
|---|---|---|---|---|
| 1 | You | "Tell us what is wrong" | "Speak or type in Bangla or English. Switch language whenever you like." | Voice caption lines |
| 2 | You | "Check the summary" | "Read back what you said and correct anything before a doctor sees it." | Summary field marked "Changed by you" |
| 3 | You | "Choose a doctor and a time" | "See doctors by area and specialty, and ask for a time that suits you." | A `ListRow` with slot choices |
| 4 | Doctor | "The doctor decides, and you see it" | "The doctor accepts, suggests another time, or declines. Your request shows who has it now." | `StatusBadge` + tracker segment |

Below the steps, an `Alert` (attention, not red): "If your answers suggest
an emergency, the guide stops and tells you to get emergency care. It does
not continue with questions." (INV-8, `docs/UIUX_DESIGN.md` §6.3.) The
approved emergency wording itself is clinical content and is not on the
landing page (Q-06).

### 4.4 What it does (`#features`)

Bento grid, 12 columns, six tiles. Size follows importance to the visitor,
and the two wide tiles carry a product visual.

```text
┌──────────────────────────────────────┬───────────────────────┐
│ A  Voice in Bangla and English       │ B  Always know who    │
│    (7 cols, 2 rows, wash)            │    has your request   │
│    captions sample + language switch │    (5 cols) tracker   │
│                                      ├───────────────────────┤
│                                      │ C  You decide who     │
│                                      │    sees your record   │
├───────────────────┬──────────────────┴───────────────────────┤
│ D  Reports checked│ E  Referrals that come back (8 cols,     │
│    by a clinician │    brand) sender → receiver → outcome    │
│    (4 cols)       │    returned, with the return beam (E4)   │
├───────────────────┴──────────────────────────────────────────┤
│ F  Emergency referral that works without internet (12 cols)  │
└──────────────────────────────────────────────────────────────┘
```

| Tile | Title | Text | Basis |
|---|---|---|---|
| A | "Speak in Bangla or English" | "Use your phone's microphone, or type. Captions are always shown." | INV-2, INV-3; voice availability depends on Q-05 |
| B | "Always know who has your request" | "Each request shows whether it is with you, the doctor or the hospital." | Handover tracker, `MASTERPLAN.md` §5 |
| C | "You decide who sees your record" | "A doctor must ask before your record is shared with another hospital. You can say no, and you can withdraw later." | INV-10, `MASTERPLAN.md` §5.6 |
| D | "Reports checked by a clinician" | "Values read from an uploaded report are marked as drafts until a clinician confirms them." | `MASTERPLAN.md` §5.4, INV-7 |
| E | "Referrals that come back" | "The receiving hospital acknowledges the referral and records the outcome, and the referring doctor sees it." | `MASTERPLAN.md` §5.2 |
| F | "Emergency referral without internet" | "Facility staff can record five essential details offline, print a slip, and the referral is sent when the connection returns." | INV-16, `MASTERPLAN.md` §5.5 |

Tiles are not links (there is no public detail page for a feature). They
have no hover effect. On phones they stack A, B, C, E, D, F at full width.

Publishing conditions: tile A states voice only when the voice feature flag
is on for the deployment (Q-05); tile F only when offline emergency mode is
enabled (Q-09). Otherwise A reads "Type in Bangla or English" and F is
omitted, and the grid closes up.

### 4.5 Safety and privacy (`#safety`)

Title: "What we do with your information". Two columns of plain statements
with a check icon and a word, on `surface`. No shield icons, no badges, no
compliance logos.

Left column, "What the system does":

| Statement | Basis in the repository | Condition before it is published |
|---|---|---|
| "The guide is automated. It does not diagnose, prescribe or decide for a doctor." | INV-7 | None |
| "Danger signs are checked by fixed rules written by clinicians before anything else." | INV-8; `apps/triage/rules/engine.py` | The rule set is currently a marked placeholder (`PLACEHOLDER — Q-06`). Publish only after clinical approval |
| "Your record is shared with another hospital only after you agree, and you can withdraw." | INV-10; consent enforcement in `apps/referrals`, `apps/consent` | Consent wording approved (Q-07) |
| "Each time someone opens your record, it is logged." | INV-9; `apps/audit` | None for the statement. Do not add "and you can see the log" until Q-07 approves patient access to it |
| "Doctors approve appointments and referrals themselves. A text message can never approve anything." | INV-4, INV-6 | None |
| "You sign in with a code sent to your phone. We do not keep a password for you." | `docs/SECURITY.md` §3.1 | Audit A-02 fixed (the code is currently a fixed test value) |

Right column, "What it does not do":

- "It is not an emergency service." (with the emergency notice)
- "It does not replace seeing a doctor."
- "It does not use your information to train AI models without your
  explicit permission." (`docs/SECURITY.md` §6.4)

Statements that must **not** appear, because nothing in the repository
supports them: encryption claims beyond what is deployed, any certification
or regulatory approval, hosting location, numbers of patients, doctors or
facilities, uptime, "government approved", named partner institutions.

### 4.6 For patients / for doctors (`#for-doctors`)

Two panels side by side, visually opposed so the distinction is immediate:
the patient panel on `indigo-wash` with a serif heading and body-size text;
the clinician panel on `surface` with a sans heading and dense text, echoing
the two interfaces.

| | For patients | For doctors and facility staff |
|---|---|---|
| Heading | "For you and your family" | "For doctors and facility staff" |
| Points | "Explain your problem in your own words" · "Find a doctor by area and specialty" · "See what is happening with your request" · "Control who sees your record" | "One queue of decisions: requests, referrals, reports to verify" · "AI drafts are marked and need your approval before anything is sent" · "Know when the receiving facility acknowledges, and get the outcome back" · "Send an emergency referral in five fields, even offline" |
| Action | "Start talking" (`primary`) | "Staff sign in" (`secondary`) and the link "How do I get access?" → `/access` |

The clinician action is sign-in, not sign-up: accounts are created by
facility admins (`docs/SECURITY.md` §3.1).

### 4.7 Final call

Full-width `brand` band, dot-grid pattern, centred on phones and
left-aligned on desktop.

- Title (serif): "Tell us what is wrong."
- Text: "It takes a few minutes. You can stop at any time."
- Button: "Start talking" (`on-brand`), with "Type instead" as a link.
- The automated-guide notice again, in `surface` text.

"A few minutes" is a description, not a measured figure; remove it if the
team prefers no duration claim until pilot data exists.

### 4.8 Footer

| Column | Content |
|---|---|
| Brand | Mark, wordmark, one-line description |
| Patients | Describe your problem, Find a doctor, Patient sign in |
| Doctors and staff | Staff sign in, How to get access |
| About | How it works, Safety and privacy (anchor) |
| Bottom row | Language switch; legal links; contact |

**Content the repository does not contain, required from the product owner
before launch:** a privacy notice, terms of use, a contact address or
phone, the operating organisation's name, and where the service is
available. Until supplied, those footer items are not rendered. They are
not filled with placeholders.

---

## 5. Call-to-action strategy

| Audience | Primary | Where | Secondary |
|---|---|---|---|
| Patient | "Start talking" / "Describe your problem" → triage | Header (desktop), hero, sticky bottom bar on phones after the hero, patient panel, final call | "Type instead" beside every "Start talking" (INV-2 requires the text path to be as easy to find) |
| Clinician and staff | "Staff sign in" | Header, clinician panel, footer | "How do I get access?" |

Rules: one `primary` button visible per viewport. The patient action is
always first. No pop-ups, no newsletter capture, no chat widget, no cookie
banner unless analytics that need consent are added (none are planned;
`docs/SECURITY.md` §6.4 allows no third-party analytics on authenticated
routes).

---

## 6. Interaction details

| Element | Behaviour |
|---|---|
| Header links | Scroll to the section; focus moves to the section heading; smooth scrolling only when reduced motion is not requested |
| Language switch | Changes the locale segment (`/bn` ↔ `/en`) and keeps the scroll position; sets `lang` |
| Section reveal (E1) | Each section's content fades in once on first entering the viewport. Content is present in the HTML and visible without JavaScript |
| Headline (E2) | Words appear in sequence once, total under one second |
| Handover rail (E3) | Fills as the steps scroll past; the current step's holder label is emphasised. No scroll-jacking; the page scrolls normally |
| Return beam (E4) | Two passes when the tile enters the viewport, then rests showing "Outcome returned" |
| Product previews | Not interactive; excluded from the tab order and from the accessibility tree, with the caption exposed as text |
| Sticky bar (phones) | Slides in after the hero's button leaves the viewport and out when the final call is visible, so two primary buttons are never on screen |
| Reduced motion | All four effects render their final state |

---

## 7. Responsive behaviour

| Breakpoint | Layout |
|---|---|
| < 640 | Single column. Hero text then product panel. Problem statements stacked with horizontal rules. Steps stacked, static rail. Bento stacked. Audience panels stacked, patients first. Footer columns stack |
| 640–1023 | Hero still stacked, panel beside text from 768. Problem in three columns from 768. Bento in two columns |
| ≥ 1024 | As drawn in §4 |
| ≥ 1280 | Container stays at 1200px; side margins grow |

Checks: no horizontal scroll at 360px; Bangla headline wraps to at most
four lines at 360px; all tap targets at least 44px; text remains readable
at 200% zoom without loss of content.

---

## 8. Technical notes

| Topic | Decision |
|---|---|
| Rendering | Server Components for all text and layout. Client components only for the language switch, mobile menu, sticky bar and effects |
| Locale | `/bn` default, `/en` alternate; `hreflang` links for both; `lang` attribute per page |
| Metadata | Title and description per locale from message files; Open Graph image is a static render of the hero panel (generated at build, no external service) |
| Performance | No images on the critical path. LCP element is the headline text. Effects E3 and E4 load when their sections approach. Proposed budget: first-load JS at most 200 KB gzipped; LCP at most 2.5 s on throttled "Slow 4G" in Lighthouse, matching the patient-route target in `docs/FRONTEND.md` §11 |
| Fonts | Preload Tiro Bangla 400 and Hind Siliguri 400 for the active script |
| Semantics | One `h1`; sections as `<section aria-labelledby>`; header `nav` and footer `nav` labelled; skip link |
| Analytics | None specified. If added later, self-hosted and without patient identifiers |
| Tests | Renders in both locales; one `h1`; primary action present and links to triage; no text matching a statistic pattern outside approved copy; axe pass; visual snapshots at 360, 768, 1280 in both locales and with reduced motion |

---

## 9. Open content items

| Item | Needed from | Until then |
|---|---|---|
| Bangla headline and all Bangla section copy | Fluent Bangla writer; clinician for §4.3 and §4.5 | Existing `patient.homeTitle` as headline; English copy is not machine-translated into the Bangla page; unfinished Bangla sections block launch of `/bn` |
| Bangla form of the product name | Product owner | Latin wordmark |
| Privacy notice, terms, contact, operator name | Product owner, legal | Footer items omitted |
| Service area and availability | Product owner, pilot facilities | Not stated |
| Emergency numbers and instruction text | Clinical reviewers (Q-06) | Existing notice only |
| Any statistic or testimonial | Pilot data with source | Not shown |
