# Medi Waypoint — UI Component Library Strategy

> **BLUF:** Use **shadcn/ui** (source copied into the repo, on the Radix
> primitives already installed) for every application component, and
> **Motion** (already installed) for all animation. From the effect
> libraries, adopt **four** components, on the landing page and auth layout
> only, each copied as source and modified: Magic UI *Blur Fade* and
> *Animated Beam*, Aceternity *Tracing Beam*, React Bits *Blur Text*. All
> four depend only on Motion, so the effect tier adds no runtime package.
> Everything else in those catalogues is excluded, mostly because it loops,
> needs data we do not have, or breaks Bangla text.

Decisions recorded on 2026-11-23 by the product owner: adopt Tailwind +
shadcn; expressive effects on the landing page and auth pages only.
Tokens and component specifications: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md).

---

## 1. Constraints the selection must satisfy

| Constraint | Source |
|---|---|
| Patient routes: at most 170 KB gzipped JS on first load; voice code lazy; no images on the critical path | `docs/FRONTEND.md` §11 |
| Target device: low-end Android on slow mobile data | `docs/UIUX_DESIGN.md` §2 |
| Bangla and Latin text in every component | `MASTERPLAN.md` INV-3 |
| WCAG 2.2 AA; reduced motion honoured | `docs/UIUX_DESIGN.md` §8 |
| No motion on the emergency screen; no looping animation anywhere | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) §5 |
| No statistics, testimonials or partner logos unless they exist in project data (they do not) | Brief; `MASTERPLAN.md` rule 5 |
| Strict CSP: `script-src 'self' 'nonce-…'`, `connect-src 'self'` + voice provider | `docs/SECURITY.md` §3.2 |
| New dependencies: exact versions, published at least 7 days before install | Repository working rule |

---

## 2. Libraries evaluated

How each was inspected: documentation pages on the library sites, and the
component source in each library's public registry or GitHub repository,
read on 2026-11-23.

| Library | Distribution | Runtime dependencies | Assessment |
|---|---|---|---|
| **shadcn/ui** | CLI copies component source into the repo | Tailwind CSS v4, `class-variance-authority`, `clsx`, `tailwind-merge`, `tw-animate-css`, Radix primitives | **Adopt as the base.** Accessible primitives (focus management, ARIA, keyboard) come from Radix, which the repo already lists. Source is ours to restyle, so no second visual language. The catalogue now offers Radix and Base UI variants; use the **Radix** variant to match the installed packages |
| **Motion** (`motion`) | npm, already in `package.json` (`^12.4.7`), currently imported nowhere | — | **Adopt as the only animation library.** Supports reduced motion through `MotionConfig reducedMotion="user"`. Import per component so it stays out of routes that do not animate |
| **Magic UI** | shadcn registry (`@magicui/*`), source copied | `motion`, `cn` helper | **Adopt two components, modified.** Most of the catalogue loops forever or exists to display marketing data |
| **Aceternity UI** | shadcn registry (`@aceternity/*`), source copied | `motion`, `cn` helper | **Adopt one component, modified.** Catalogue is dominated by shaders, 3D, particles and cursor effects |
| **React Bits** | shadcn registry (`@react-bits/*`), four variants per component | `motion` for some; **GSAP** (`gsap`, `@gsap/react`, GSAP SplitText) for others | **Adopt one Motion-based component, modified.** Reject every GSAP-based component: a second animation runtime is not justified |

Scores against the seven criteria in the brief (● good, ◐ acceptable with
changes, ○ poor for this product):

| Criterion | shadcn/ui | Motion | Magic UI | Aceternity | React Bits |
|---|---|---|---|---|---|
| Visual quality | ● | — | ● | ● | ● |
| Stack compatibility (Next 15, React 19, Tailwind v4) | ● | ● | ● | ● | ◐ (GSAP variants) |
| Accessibility | ● | ● | ◐ (no reduced-motion handling in the source read) | ◐ | ◐ |
| Performance on low-end phones | ● | ● | ◐ | ○ for most; ◐ for the one chosen | ◐ |
| Responsiveness | ● | — | ● | ◐ | ● |
| Customisation to our tokens | ● | ● | ● (source) | ● (source) | ● (source) |
| Maintenance overhead | ● (we own the files) | ● | ◐ (copied files need our fixes re-applied on update) | ◐ | ◐ |

---

## 3. shadcn/ui components to add

Added to `src/components/ui/` with the CLI, then restyled once to the
tokens. Only what a screen in
[APPLICATION_DESIGN_ARCHITECTURE.md](APPLICATION_DESIGN_ARCHITECTURE.md)
uses.

| shadcn component | Becomes (Design System §6) | Used in |
|---|---|---|
| `button` | `Button`, `LinkButton` | Everywhere |
| `input`, `textarea`, `label`, `field` | `Field`, `Input`, `Textarea`, `CodeInput`, `PasswordInput` | Auth, emergency form, referral, admin |
| `select`, `native-select`, `combobox` (`popover` + `command`) | `Select`, `Combobox` | Area and facility pickers, urgency, filters |
| `radio-group`, `checkbox`, `switch` | Same | Profile, consent categories display, admin |
| `tabs` | `Tabs` | Queue filters, chart sections, admin |
| `dialog`, `alert-dialog`, `sheet` | `Dialog`, `AlertDialog`, `Sheet` | Reason capture, idle timeout, consent, mobile filters |
| `dropdown-menu` | Account menu, row actions, "More" in `ActionBar` | Shells, tables |
| `table` | `Table` | Admin |
| `badge` | `StatusBadge` | Everywhere |
| `alert` | `Alert` | Everywhere |
| `skeleton`, `empty` | `Skeleton`, `EmptyState` | Every data view |
| `sidebar` | `WorkspaceSidebar` | Clinical and admin shells |
| `breadcrumb`, `separator`, `tooltip`, `scroll-area` | Same | Clinical and admin |
| `toast` | `Toast` (keeps the Radix toast already installed) | Everywhere |

Deliberately **not** added:

| Not added | Reason |
|---|---|
| `input-otp` | Adds the `input-otp` package; a single code field is more accessible and handles Bangla digits ([AUTH_RBAC_ARCHITECTURE.md](AUTH_RBAC_ARCHITECTURE.md) §4.1) |
| `data-table` (TanStack Table) | Admin lists are short and server-paginated by cursor; a plain `Table` is enough. Revisit only if sorting and column control are requested |
| `chart` (Recharts) | No screen has a chart. No project document defines a metric to plot, and capacity must not look live (INV-14) |
| `carousel`, `calendar`, `resizable`, `menubar`, `navigation-menu`, `hover-card`, AI Elements | No screen needs them. Slots are a list of server-provided times, not a calendar grid |
| `card` | Replaced by our `Panel` and `Tile`, so the default shadcn card look does not creep in |

Patient-route budget: Radix dialog, popover and select are only loaded by
the routes that use them. The patient home, triage and appointment status
routes are built from `Button`, `ListRow`, `Tile`, `StatusBadge`,
`HandoverTracker` and `Sheet` (for consent), which keeps their first-load
JS inside the 170 KB limit. This is checked per route in CI
([REDESIGN_IMPLEMENTATION_PLAN.md](REDESIGN_IMPLEMENTATION_PLAN.md) §7).

---

## 4. Effect components selected (landing and auth only)

Each is copied as source into `src/components/marketing/`, never imported
from a package, and changed as listed before first use.

| # | Component | Source read | What it does | Where it is used | Why it earns its place | Required changes |
|---|---|---|---|---|---|---|
| E1 | **Blur Fade** (Magic UI) | `motion` + `useInView` with `once: true` | Content fades in once when it enters the viewport | Landing section blocks; auth step change | The only section-reveal effect; plays once and never again | Remove the blur filter (costly on low-end GPUs), keep opacity and 8px offset; duration from the `reveal` token; wrap the page in `MotionConfig reducedMotion="user"` |
| E2 | **Blur Text** (React Bits, TypeScript + Tailwind variant) | `motion`, `IntersectionObserver`; splits on spaces in `words` mode; already sets `reducedMotion="user"` | Headline words resolve in sequence | Landing hero headline only, once on load | Gives the one serif headline a considered entrance | Force `animateBy="words"`; delete the `letters` mode (see §6); remove the blur filter as in E1; keep the full sentence in the DOM as one accessible string |
| E3 | **Tracing Beam** (Aceternity) | `motion` `useScroll` + `useSpring`; scroll-linked, not autoplaying | A line beside the content fills as the user scrolls | Landing "How it works": becomes the handover tracker filling from "You" to "Doctor" to "Outcome returned" as the steps scroll past | It is the product's own signature element, driven by the user's scroll, explaining the real journey | Redraw the SVG as the tracker rail and notch (Design System §6.1); recolour to tokens; disable below `md` (steps are simply stacked) and under reduced motion (rail shown full) |
| E4 | **Animated Beam** (Magic UI) | `motion`, `ResizeObserver`; default `repeat: Infinity` | A light travels along a path between two elements | Landing "Closed-loop referral" tile: one pass from sending facility to receiving facility and one pass back, labelled "Outcome returned" | Shows the one thing that distinguishes the product: the outcome comes back | Set a finite repeat (two passes, then rest in the final state); start only when in view; recolour to `paddy` on `indigo-deep`; static final state under reduced motion |

No other effect component is permitted without amending this table.

Hand-built instead of imported:

| Need | Why not import |
|---|---|
| Dot-grid background on `brand` surfaces | Magic UI *Dot Pattern* is a client component that measures its container and renders one SVG circle per dot, with an optional infinite glow animation. A CSS `radial-gradient` background does the same statically with no JavaScript |
| Bento grid | A CSS grid with `Tile` components. The library versions add hover choreography and assume marketing copy |
| Product previews in the hero | The real `HandoverTracker`, `ListRow` and `StatusBadge` rendered with labelled sample data, so the landing page cannot drift from the product |

---

## 5. Where effects are and are not used

| Surface | Motion allowed |
|---|---|
| Landing page | E1–E4, each once, as listed |
| Auth layout | E1 for the change between steps of one flow. The brand panel is static |
| Patient application | Functional tier only: tracker advance on a real state change, sheet and dialog transitions, press feedback, voice level indicator |
| Clinical workspace | Functional tier only: queue row leaving after a decision, detail panel change, draft border becoming solid on verification |
| Administration | Press feedback and dialog transitions only |
| Emergency screen and emergency referral form | None |

---

## 6. Excluded, with reasons

| Excluded | Examples | Reason |
|---|---|---|
| Looping or ambient animation | Border Beam, Shine Border, Meteors, Particles, Ripple, Aurora and gradient backgrounds, Background Beams, Flickering Grid, Sparkles | Constant movement beside medical text; battery and GPU cost on low-end phones; violates the "no looping animation" rule |
| Number and statistic effects | Number Ticker, Animated Circular Progress, stats sections | The project has no real statistics to show. Animating an invented number is a false claim |
| Social proof components | Marquee, Tweet Card, Avatar Circles, logo clouds, animated testimonials | No testimonials, partners or user counts exist in project data |
| Per-letter text effects | React Bits Split Text (letters), Typing Animation, Hyper Text, Text Generate, Flip Words, Morphing Text | Bangla is written in conjuncts and vowel signs that attach to a base letter. Splitting a string by character breaks them apart and renders wrong glyphs. Only word-level splitting is safe |
| GSAP-based components | React Bits Split Text, Scroll Reveal and others | Adds `gsap` and `@gsap/react` for effects Motion already covers |
| Cursor and pointer effects | Smooth Cursor, Pointer, Lens, Following Pointer, Magnetic Button, Cool Mode, Confetti | No meaning on touch devices, which are the primary audience; distracting on desktop |
| 3D, WebGL and shader effects | Globe, 3D Card, Vortex, Canvas Reveal, shaders, Macbook Scroll | Bundle size and GPU load; unrelated to the product |
| Glass, glare and neon surfaces | Magic Card, Glare Card, Neon Gradient Card, Liquid Glass | Excluded by the brief and by Design System §1.3 |
| Parallax and scroll-jacking | Hero Parallax, Parallax Scroll, Sticky Scroll Reveal, Container Scroll | Hijacks reading; E3 is the single scroll-linked element and it does not change scroll behaviour |
| Decorative buttons | Rainbow, Shimmer, Pulsating, Moving Border | A pulsing call to action on a health page reads as pressure. The primary button is a solid colour |
| Device mock-ups | Safari, iPhone, Android frames | The hero shows components directly; a fake phone frame adds weight and nothing else |

---

## 7. Customisation strategy

1. **One visual language.** Every copied component is edited to use token
   utilities only (`bg-brand`, `text-brand-accent`, `rounded-tile`). Hex
   values, default Tailwind colours and library-specific shadows are removed
   on import; `npm run lint:tokens` enforces it.
2. **Our names.** Components are renamed to what they are in this product
   (`SectionReveal`, `HeadlineReveal`, `HandoverRail`, `ReturnBeam`), so
   nobody later treats them as general-purpose effects.
3. **Reduced motion is part of the component**, not of the page: each has a
   static final state that is rendered when the user prefers reduced motion,
   and each has a Storybook story for that state.
4. **Server first.** Effect components are client components; the text they
   wrap is rendered on the server and is readable before hydration and
   without JavaScript.
5. **Record the origin.** `src/components/marketing/README.md` lists, for
   each file, the library, component name, date copied and changes made, so
   an update can be compared deliberately.

---

## 8. Performance rules

| Rule | Detail |
|---|---|
| Effects never load in the application | `src/components/marketing/*` may be imported only from the `(public)` and `(auth)` route groups. A lint rule on import paths enforces this |
| Landing loads effects after content | E3 and E4 are loaded with `next/dynamic` when their section approaches the viewport; E1 and E2 are small enough to ship with the page |
| Animate only `opacity` and `transform` | No animated `filter`, `box-shadow`, `width` or `height` |
| No animation library on patient critical routes unless used | `motion` is imported by the tracker (state advance) and sheets only |
| Budgets checked in CI | First-load JS per route group from the Next.js build output: patient routes at most 170 KB gzipped (existing budget); landing at most 200 KB gzipped (new, proposed) |
| Fonts | Preload Hind Siliguri 400 and Tiro Bangla 400 for the active script only; other weights load on demand (Design System §3.1) |
| CSP | No inline scripts or remote assets introduced by any selected component; all four work under the existing policy |

---

## 9. Dependency management

Added to `frontend/package.json` (all build-time or small utilities):

| Package | Purpose | Runtime cost |
|---|---|---|
| `tailwindcss`, `@tailwindcss/postcss` | Styling engine (v4) | None at runtime; CSS only |
| `tw-animate-css` | Keyframes used by shadcn dialogs, sheets and menus | CSS only |
| `class-variance-authority`, `clsx`, `tailwind-merge` | Variant and class helpers used by shadcn components | Small; shared by all components |
| Radix primitives not yet listed (`select`, `dropdown-menu`, `alert-dialog`, `radio-group`, `checkbox`, `switch`, `tooltip`, `scroll-area`, `label`, `separator`, `slot`) | Behaviour for the components in §3 | Loaded per component |
| `cmdk` | `Combobox` (facility and area pickers) | Loaded only where a combobox is used |

Latest published versions seen on the npm registry on 2026-11-23:
`tailwindcss` 4.3.5, `@tailwindcss/postcss` 4.3.5, `shadcn` CLI 4.23.0,
`class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.1,
`tw-animate-css` 1.4.0. Their publish dates were not checked. At install
time, pick for each the newest version that is at least 7 days old and pin
it exactly (no `^`, no `latest`).

Removed after migration: `stylelint`, `stylelint-config-standard` (replaced
by `lint:tokens`), and the `lint:css` script.

Not added: `gsap`, `@gsap/react`, `input-otp`, `@tanstack/react-table`,
`recharts`, `embla-carousel`, `next-themes`, `three`, any icon set other
than `lucide-react`.

Tradeoff accepted with this strategy: Tailwind utilities replace CSS
Modules, which reverses `docs/FRONTEND.md` §2 ("no utility-class sprawl that
bypasses tokens"). The concern behind that rule is kept by removing
Tailwind's default palette and linting arbitrary values (Design System §9).
The cost is a one-time restyle of the 14 existing components and their two
test files.
