# Style Guide — Single Source of Truth

> **Measured from the codebase on 2026-07-21**, not aspirational. Every number below
> was counted with the commands in § Verification. Where this document and the code
> disagree, the code is the bug *or* this document is stale — resolve it, don't ignore it.
>
> **This is a living document.** If you make a design decision that departs from it,
> update it in the same commit.

---

## Design Philosophy

Editorial-restrained. Hierarchy comes from **size, weight and tracking** — never from
ornament. Blue is signal, white is canvas, and every border earns its place.

**One focal point per view.** The hero metric is unmistakably the hero. No competing heroes.

---

## Color Palette

Defined in `tailwind.config.ts` under `theme.extend.colors.ima`. Consume as
`text-ima-*` / `bg-ima-*` / `border-ima-*`. **Never write a new hex in a component.**

### Signal

| Token | Hex | Usage |
|---|---|---|
| `ima-primary` | `#2563EB` | The only brand signal. Active nav, single hero metric, primary CTA, focus rings |
| `ima-primary-hover` | `#1D4ED8` | Primary button hover |
| `ima-secondary` | `#1E40AF` | Rare — deep blue for pressed/nested states |
| `ima-accent` | `#3B82F6` | Lighter blue, secondary emphasis |

### Neutral (slate ramp)

| Token | Hex | Usage |
|---|---|---|
| Token | Hex | Contrast on white | Usage |
|---|---|---|---|
| `ima-bg` | `#FFFFFF` | — | Page canvas |
| `ima-surface` | `#FFFFFF` | — | Card surface |
| `ima-surface-light` | `#F1F5F9` | — | Inset / secondary surface, ghost-button hover |
| `ima-surface-accent` | `#EFF6FF` | — | Blue-tinted informational surface |
| `ima-border` | `#E2E8F0` | — | All 1px borders (non-text) |
| `ima-text` | `#1E293B` | 14.63:1 ✓ | Primary text, headings |
| `ima-text-secondary` | `#5F6E85` | 5.18:1 ✓ | **Body copy, labels, metadata** — the workhorse |
| `ima-text-muted` | `#94A3B8` | 2.56:1 ✗ | **Restricted** — see below |
| `ima-overlay` | `rgba(0,0,0,0.5)` | — | Modal scrim |

> `ima-text-secondary` was `#64748B` until 2026-07-21. It passed on white (4.76:1) but
> failed on `surface-light` (4.34:1) — a surface used 294 times. It is now the workhorse
> color after the `text-muted` migration, so it must clear AA on **both** canvases:
> 5.18:1 on white, 4.73:1 on `surface-light`.

> ⚠️ **`ima-text-muted` is 2.56:1 and FAILS AA.** It cannot be darkened without becoming
> `ima-text-secondary` (`#64748B` is the first passing value). It is legal **only** where
> WCAG exempts it: decorative icons marked `aria-hidden`, and genuinely inactive
> controls (locked roadmap steps, outside-month calendar days). **12 sanctioned usages
> remain**; 60 were migrated to `ima-text-secondary` on 2026-07-21. Never use it for
> text that carries information.

> **Note:** `ima-bg` and `ima-surface` are both `#FFFFFF`. Cards separate from the
> canvas by **shadow, not by value**. `ima-bg` was `#F8FAFC` until the current working
> tree flattened it — see § Known Drift.

### Semantic (status only, never brand)

| Token | Hex | On own /10 tint | On white | Usage |
|---|---|---|---|---|
| `ima-success` | `#047857` | 4.78:1 ✓ | 5.48:1 ✓ | Goal reached, completed steps |
| `ima-warning` | `#92400E` | 6.08:1 ✓ | 7.09:1 ✓ | Approaching deadline |
| `ima-error` | `#B91C1C` | 5.45:1 ✓ | 6.47:1 ✓ | Errors, destructive actions |
| `ima-info` | `#1D4ED8` | 5.72:1 ✓ | 6.70:1 ✓ | Informational badges |
| `ima-sidebar` / `-hover` / `-border` | `#FAF7F2` / `#F2ECE2` / `#ECE5D8` | — | — | **Sidebar only** — warm light-beige nav frame, its hover row, and its rules. Added 2026-10-10 on request |
| `ima-live` | `#25D366` | — | 1.98:1 (decorative) | **Status dots only** — "online now" presence green on the KPI bubble, always on a white ring. Never icons/text. Added 2026-10-10 |
| `ima-success-bright` | `#16A34A` | — | 3.30:1 (non-text ✓) | **Graphics only** — status dots, progress fills. Never text. Added 2026-10-10 because the text-grade emerald read muddy at dot size |

Semantic hues appear as **10% tint background + full-strength text**:
`bg-ima-success/10 text-ima-success`.

> **These were darkened on 2026-07-21.** The originals (`#10B981`, `#F59E0B`, `#EF4444`,
> `#3B82F6`) were used as text on their own 10% tint — often at 10px, the smallest type
> in the product — and failed badly: 2.31:1, 1.99:1, 3.29:1, 3.29:1. The chip pattern is
> the binding constraint, not white: **always measure a semantic hue against its own
> composited tint**, which is stricter. White-on-solid also passes for all four, so
> filled buttons and progress fills are safe.

### Removed — do not reintroduce

`ima-pastel-*` (6) · `ima-magenta` · `ima-teal` · `ima-violet`

**Deleted from `tailwind.config.ts` on 2026-07-21** (they had 0 usages in `src/`). They
dated from a retired "vibrant `student_diy` lane"; `student_diy` now shares the
editorial-restrained lane 1:1 with `student`. Blue is the only signal color.

### Do's and Don'ts

- **DO** reach for weight/size contrast when a screen feels flat.
- **DO** keep blue rare enough that it still means something.
- **DON'T** introduce a new hex. Sanctioned exceptions below only.
- **DON'T** use gradients (including blue-to-blue), gradient text, or `backdrop-blur`.
  **One sanctioned exception (2026-10-10, owner request):** the "Unlock your AI mentor"
  intro card in `BusinessCheckinForm` — a 135° `#2563EB → #1E40AF → #172554` gradient (darkened 2026-10-10)
  with a soft top glow and a diagonal shine that sweeps every ~5s (off under reduced
  motion). White text, secondary copy at `white/90` to hold AA. Do not spread it.

**Sanctioned raw-hex exceptions** (32 occurrences across 9 files — all legitimate):
recharts props that don't accept CSS classes (`WeeklyHoursChart`, `WeeklyEmailsChart`,
`DealsTrendChart`, `AnalyticsClient`, `OwnerAnalyticsTeaser`, plus `EMAIL_SERIES_COLORS`
in `src/lib/emails.ts`), SVG stroke attributes (`WorkTimer`), the
logo mask on auth cards (`login`, `MagicLinkCard`, `RegisterCard`), and per-piece
CSS custom properties (`Confetti`). Any *new* raw hex outside these needs a reason.

**Multi-series charts** (`WeeklyEmailsChart`): the aggregate series is the one blue line
(`ima-primary`, 3px); component series use existing non-blue tokens at 2px —
brands `ima-warning`, influencers `ima-text-secondary`. The same colors key the 6px dots
in any legend or breakdown that refers to those series (`TodaysEmailsMetric`,
`QuickEmailLog`). Never add a second blue series.

**Metric switch** (student dashboard hero): a vertical icon-only radiogroup pill
(`bg-ima-surface-light` track, 44px round segments, active = `bg-white shadow-card
text-ima-primary`) sits left of the card's eyebrow and drives both the hero metric and
the weekly chart below. Emails is the default view.

**Student simplicity rules** (2026-10-02 — students may not be confident computer users):

- **One thing on screen at a time.** Multi-tool pages use big icon + word tabs
  (`TrackerTabs` on the Work Tracker: 64px tall, active = `bg-ima-primary text-white`)
  instead of side-by-side columns. Two page widths only, always `mx-auto`
  centred: **1200px** for owner/coach dashboards and lists, and **880px** for every
  student page (Home, Ask AI, Work, Report, My Steps). Changed 2026-10-10 —
  pages were a mix of 760/768/880/1200 and the Ask form sat left-aligned.
- **Phones use the hamburger drawer only** — no bottom tab bar (removed 2026-10-02:
  two menus on one screen was confusing). Nav labels are short plain words
  (Home / Work / Report / My Steps / Ask AI). The student KPIs (`ProgressBanner`) live
  behind a floating gauge button bottom-right (all breakpoints) that springs open a
  popup — no sticky strip (changed 2026-10-09).
- **Secondary info collapses into rows**, not cards: the dashboard's `AtAGlance` list
  (72px rows, status chip + chevron). The roadmap folds its full timeline behind
  "See all N steps".
- **Counters over inputs.** Tap buttons (+1 / +5 / +10, a `−` for mistakes) that save by
  themselves beat typed numbers with a Save button (`QuickEmailLog`).
- **Plain words.** "Work time" not "session", "Delete" not "Discard", "I'm done" not
  "Complete session", "What's stopping you" not "constraint".

---

## Typography

### Family

**Inter only** — `next/font/google`, `subsets: ["latin"]`, applied on `<body>` in
`src/app/layout.tsx`. No display face. No monospace. Do not add a family.

### Scale

This product uses an **explicit pixel scale** for headings, labels and metrics, and the
Tailwind named scale for body/UI text. Both are real; use the right one for the role.

**Pixel scale — headings, labels, metrics**

| Size | Usage | Occurrences |
|---|---|---|
| `text-[10px]` | Chips, dense uppercase metadata | 133 |
| `text-[11px]` | **Eyebrow / section label** — the signature | 96 |
| `text-[12px]` | Dense secondary metadata | 37 |
| `text-[13px]` | Compact body | 44 |
| `text-[14px]` | Body alternate | 30 |
| `text-[15px]` | **Lede / primary body** | 53 |
| `text-[20px]`–`text-[24px]` | Card titles, sub-metrics | 54 |
| `text-[28px]`–`text-[30px]` | Secondary metrics | 9 |
| `text-[32px]` / `text-[36px]` | **Page masthead h1** (mobile / desktop) | 49 |
| `text-[44px]` / `text-[52px]` | Large in-card metrics | 8 |

**Named scale — body & UI text**

`text-sm` (205) and `text-xs` (127) carry the overwhelming majority of interface text.
`text-lg` (9) is the `CardTitle` default. `text-base` (18) is the `lg` button size.

**Hero metric** — `text-6xl md:text-7xl font-semibold tabular-nums tracking-tight
leading-[0.95]`, **exactly once per view**. Used in `TodaysWorkMetric`, roadmap,
analytics, deals, and the coach roadmap/deals tabs.

### Tracking

| Value | Occurrences | Usage |
|---|---|---|
| `tracking-[0.08em]` | **225** | Uppercase editorial labels — the product's signature |
| `tracking-tight` | 82 | Metrics and large numerals |
| `tracking-wider` | 25 | Rare wide labels |
| `tracking-[-0.02em]` | — | Masthead h1 |

`tracking-widest` was normalized to `tracking-[0.08em]` across its 15 remaining
coach-side sites on 2026-07-21. It should now be 0.

> ⚠️ **Never apply negative tracking to Arabic text.** It breaks connected letterforms.
> This affects the `Assalamu3leikum` greeting and `MotivationalCard`.

### Numerals

Every number that updates — metrics, counters, timers, currency, KPI values — carries
`tabular-nums`. Non-negotiable; proportional figures make a ticking timer jitter.

### Canonical recipes

```tsx
/* Eyebrow / section label */
"text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"

/* Page masthead h1 */
"mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]"

/* Lede */
"mt-3 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]"

/* Hero metric */
"text-6xl md:text-7xl font-semibold tabular-nums tracking-tight leading-[0.95] text-ima-primary"

/* Status chip */
"inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-success/10 \
 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success"
```

---

## Spacing System

The app runs a **6 / 10 / 14 / 18 px rhythm** expressed as arbitrary Tailwind values,
applied consistently across ~200 files including matching `loading.tsx` skeletons.

| Value | Occurrences | Usage |
|---|---|---|
| `gap-[14px]` | 55 | **The default grid/stack gap** |
| `mt-[6px]` | 38 | Tight label→value pairing |
| `py-[3px]` | 25 | Chip vertical padding |
| `py-[16px]` | 22 | Card row vertical padding |
| `px-[18px]` | 22 | Card horizontal padding |
| `mt-[14px]` | 18 | Section spacing within a card |
| `gap-[6px]` | 12 | Icon→label gap |

> **This is intentional, not drift.** Do **not** normalize it to the 4/8/16/24 scale.
> That is a ~200-file churn that shifts the entire app's rhythm, and it should only
> happen on an explicit, deliberate ask.

Standard Tailwind spacing (`p-6`, `gap-5`, `mt-9`, `space-y-1.5`) is used freely
alongside it for larger structural gaps. The pixel values govern *fine* rhythm.

### Page geometry

```tsx
/* Dashboard layout shell — src/app/(dashboard)/layout.tsx */
<main className="min-h-screen pt-16 md:pt-0 md:ml-[264px]">
  <div className="p-4 md:p-8">{children}</div>
</main>

/* Page content wrapper — bleeds past the layout padding, then re-establishes its own */
<div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
  <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
```

- Sidebar width: **264px**, fixed, `md` and up. Mobile: 64px top bar.
- Content max width: **1200px**
- Text measure: **58ch**

---

## Border Radius

An explicit pixel radius scale, again not the Tailwind named one.

| Value | Occurrences | Usage |
|---|---|---|
| `rounded-full` | 196 | Chips, badges, avatars, pills, progress tracks |
| `rounded-[14px]` | **145+** | **The card radius** — including the `Card` primitive |
| `rounded-lg` (8px) | 79 | Buttons (md/lg/icon), inputs |
| `rounded-[12px]` | 59 | Nested surfaces inside cards |
| `rounded-[10px]` | 57 | Small interactive tiles |
| `rounded-[8px]` | 41 | Dense inset elements |
| `rounded-md` (6px) | 21 | Small buttons |

The `Card` primitive was `rounded-xl` (12px) until 2026-07-21, which left it visibly
out of step with the hand-rolled shells it shares pages with. It is now `rounded-[14px]`.

**Rule of thumb:** outermost card `14px` → nested surface `12px` → inset element
`10px`/`8px`. Radius decreases with nesting depth.

---

## Elevation

| Token | Value | Usage |
|---|---|---|
| `shadow-card` | `0 1px 2px 0 rgba(15,23,42,.04), 0 2px 8px -2px rgba(15,23,42,.05)` | **Resting card lift** (134 uses) |
| `shadow-card-hover` | `0 8px 25px -5px rgba(0,0,0,.1)` | Interactive card hover (13 uses) |

Because `ima-bg` and `ima-surface` are both pure white, `shadow-card` is the *only*
thing separating a card from the canvas. It is deliberately barely-there and
cool/slate-tinted.

> This **reverses** the older "shadows only on hover, never at rest" principle. The
> current working tree added `shadow-card` and the reversal is intentional — a flat
> white card on a flat white canvas needs the separation. See § Known Drift.

### Blue glows — 6 distinct values, only 1 was documented

Measured 2026-07-21. A blue-tinted `shadow-[…rgba(37,99,235,…)]` is used on 8 sites at
**six different values**, none of them tokens:

| Value | Sites | Where |
|---|---|---|
| `0_8px_20px_-10px_…0.7` | 3 | Dashboard next-action tiles (`student/`, `student_diy/`) |
| `0_16px_38px_-14px_…0.6` | 2 | Roadmap overall-progress hero (both lanes) |
| `0_20px_44px_-14px_…0.78` | 1 | `WorkTrackerClient` primary CTA |
| `0_14px_32px_-14px_…0.65` | 1 | `NextActionButton` hover — **the one this guide documented** |
| `0_14px_34px_-12px_…0.6` | 1 | — |
| `0_8px_24px_-8px_…0.6` | 1 | `RoadmapStep` active node |

Plus `0_10px_30px_-10px_rgba(146,64,14,0.55)` (warning-tinted) and two slate-tinted
values. **This is real drift** — the same "lifted blue element" idea re-derived by hand
seven times, with the resting/hover distinction lost along the way (the hero and the
active node glow at rest; the CTAs glow on hover).

Not consolidated yet: picking the winning value changes the appearance of 8 elements
across screens that can't be screenshotted without OAuth. It wants a `shadow-glow-primary`
token in `tailwind.config.ts` and a deliberate visual pass. **Do not add a seventh value.**

---

## Motion

### Keyframes & animations (`tailwind.config.ts`)

| Class | Definition |
|---|---|
| `animate-fadeIn` | `fadeIn 300ms ease-out both` |
| `animate-scaleIn` | `scaleIn 300ms ease-out both` (opacity + `scale(.95)→1`) |
| `animate-slideUp` | `slideUp 400ms ease-out both` (opacity + `translateY(16px)→0`) |
| `animate-riseIn` | `slideUp 600ms cubic-bezier(.16,1,.3,1) both` |

**Reveal usage is split, deliberately.** `animate-fadeIn` is the dominant reveal
(96 uses); `animate-riseIn` is the richer treatment and is currently scoped to the two
**student dashboards** only (`student/page.tsx`, `student_diy/page.tsx` — 13 uses).
Coach and owner surfaces are uniformly `fadeIn`. Don't "upgrade" a coach/owner page to
`riseIn` piecemeal — a page must use one reveal throughout, or the stagger reads as a
glitch. Migrating a whole surface is a deliberate decision, not a cleanup.

### Easing

| Token | Curve |
|---|---|
| `ease-expo-out` | `cubic-bezier(0.16, 1, 0.3, 1)` — **default for expressive motion** |
| `ease-quart-out` | `cubic-bezier(0.25, 1, 0.5, 1)` |

Default `ease-out` is deliberately avoided; it reads mechanical.

### Rules

1. **Every `animate-*` MUST be `motion-safe:` gated.** Currently **100% compliant
   (0 bare `animate-*`)** — keep it that way.
2. Transitions likewise: `motion-safe:transition-colors`, `motion-safe:transition-all
   motion-safe:duration-200`.
3. **Staggering** — sequential sections use `motion-safe:animate-riseIn` with an inline
   `style={{ animationDelay: "100ms" }}`, incrementing ~100ms per section.
4. `motion/react` (Framer Motion v12) is used for the sidebar and interactive
   components; it respects `useReducedMotion()`.
5. Confetti (`globals.css`) is decorative, gated behind
   `@media (prefers-reduced-motion: no-preference)`, and fires only on genuine milestones.

---

## Component Patterns

### Button (`src/components/ui/Button.tsx`)

CVA. Base: `inline-flex items-center justify-center font-medium
motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-ima-primary
focus-visible:ring-offset-2`.

| Variant | Classes |
|---|---|
| `primary` | `bg-ima-primary text-white hover:bg-ima-primary-hover` |
| `secondary` | `bg-ima-surface-light text-ima-text border border-ima-border hover:bg-ima-border` |
| `ghost` | `bg-transparent text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text` |
| `danger` | `bg-ima-error text-white hover:bg-ima-error/80` |
| `outline` | `bg-transparent text-ima-primary border border-ima-primary hover:bg-ima-primary/10` |

| Size | Classes |
|---|---|
| `sm` | `min-h-[44px] px-3 text-xs rounded-md gap-1.5` |
| `md` (default) | `h-11 px-4 text-sm rounded-lg gap-2` |
| `lg` | `h-12 px-6 text-base rounded-lg gap-2` |
| `icon` | `h-11 w-11 rounded-lg` |

Loading state preserves resting width via `display:contents` + `visibility:hidden`,
and sets `aria-busy`. Every size clears 44px.

### Card (`src/components/ui/Card.tsx`)

Variants `default` / `warm` (`surface-light`) / `accent` (`surface-accent`), all with
`shadow-card`. `interactive` adds `hover:shadow-card-hover hover:-translate-y-0.5`.
Sub-parts: `CardHeader` `p-6`, `CardTitle` `text-lg font-semibold`, `CardDescription`
`text-sm text-ima-text-secondary mt-1`, `CardContent` `p-6 pt-0`, `CardFooter` `p-6
pt-0 flex items-center gap-3`.

> ⚠️ **The primitive is the minority pattern.** See § Known Drift.

### Badge (`src/components/ui/Badge.tsx`)

`rounded-full font-medium`. Variants `default` / `success` / `warning` / `error` /
`info` / `outline`, all on the `/10` tint pattern. Sizes `sm` (`px-2 py-0.5 text-xs`)
and `md` (`px-2.5 py-1 text-xs`).

### Input (`src/components/ui/Input.tsx`)

`w-full h-11 px-3 bg-ima-surface border border-ima-border rounded-lg
focus:ring-2 focus:ring-ima-primary focus:border-transparent`. Auto-generates an `id`
via `useId()`, wires `htmlFor`, and on error sets `aria-invalid`, `aria-describedby`,
and a `role="alert"` message. **Use this rather than a bare `<input>`** — it is the
accessibility contract.

### Day planner & calendar (`DaySchedule.tsx`, `components/student/schedule/`)
The Work Tracker's Google-Calendar-style day view, plus the full-width `*/calendar`
page with Day / Week / Month views (added 2026-09-29). Both share `TimeGrid` and
`BlockEditor`. The calendar page is `max-w-[1600px]` — a deliberate exception to the
1200px content width, because a week grid needs the room. Decisions:
- **48px per hour**, day scrolls inside a fixed `560px` pane; blocks snap to 30 min.
- **Blue in the planner is signal only**: the now-line, and the left rule on the block
  that is happening now / running. Upcoming blocks are white `shadow-card` tiles, past
  blocks drop to `surface-light`, done blocks use the success `/10` tint.
- Its Start action is the `outline` button variant, deliberately quieter than the
  tracker's primary CTA — one focal point per view.
- **Drag:** blocks move (across days in week view) and resize from their bottom edge,
  snapping to 15 min; dragging empty space draws a new block (mouse only). Touch needs a
  300ms press-and-hold first, so a swipe still scrolls. Blocks with a running or
  finished timer are locked — they are a record of work.
- **Touch-target exception:** timeline blocks under 30 min and month-grid chips are
  shorter than 44px, as in any calendar. Every one of them is reachable another way
  (the day cell / day header opens the day view, where blocks are full-size).

### Other primitives

`EmptyState` · `Modal` · `PaginationControls` · `SegmentedControl` · `Skeleton` ·
`Spinner` · `Textarea` · `Toast` — all in `src/components/ui/`, exported via `index.ts`.

---

## Accessibility Contract

- **44px minimum** on every interactive element (`h-11` / `h-12` / `min-h-[44px]`).
- **Every input labelled** — use the `Input`/`Textarea` primitives, or pair
  `htmlFor` + `id`, or supply `aria-label`.
- **ARIA on dynamic content** — `role="progressbar"`, `role="timer"`, `role="alert"`.
- **`aria-hidden="true"` on decorative icons** — every Lucide glyph that sits beside a
  text label.
- **Focus visible everywhere** — `focus-visible:ring-2 ring-ima-primary ring-offset-2`,
  or `focus-visible:outline-2 outline-ima-primary outline-offset-2`.
- **Skip target** — the dashboard `<main>` carries `id="main-content"`.
- **Body text ≥ 4.5:1.** Every text token except `ima-text-muted` now clears AA on both
  white and `surface-light`. `ima-text-muted` (2.56:1) is restricted to WCAG-exempt
  uses only — see § Color Palette.
- **Measure semantic hues against their own tint**, not white. `bg-ima-x/10
  text-ima-x` composites to a light background that is *stricter* than white.

**Audited 2026-07-21 — already compliant, no changes needed:**

- **Touch targets: 100%.** All 109 interactive elements clear 44px, via an explicit
  height class, `buttonVariants()` (`h-11` / `min-h-[44px]`), a sized inner element, or
  by wrapping a whole card. The one inline text link (`ResourceLinkCard`) is exempt.
- **Decorative icons: 100%.** All 207 Lucide elements are hidden from AT — either
  directly, or via an `aria-hidden` ancestor (`EmptyState` wraps its `icon` prop; the
  resource/announcement icons sit in `aria-hidden` spans). A naive grep for
  `aria-hidden` on the icon itself reports 18 false positives — check ancestors.
- **ARIA on dynamic content: complete.** All 14 `role="progressbar"` carry
  `aria-valuenow`/`valuemin`/`valuemax`. Plus 34 `role="alert"`, 9 `role="status"`,
  1 `role="timer"`.
- **Skip link present** — `Sidebar.tsx` → `#main-content`, target exists on `<main>`.

---

## Known Drift

### Resolved 2026-07-21 (Phase 0)

1. ✅ **`Card` primitive radius** — `rounded-xl` (12px) → `rounded-[14px]`, matching the
   145 hand-rolled shells it shares pages with.
2. ✅ **Deprecated tokens deleted** from `tailwind.config.ts` (9 entries, 0 usages).
3. ✅ **`tracking-widest` normalized** to `tracking-[0.08em]` (15 sites).
4. ✅ **Auth cards** brought onto the house style — `rounded-xl`/`shadow-sm` →
   `rounded-[14px]`/`shadow-card` across all 6 auth card shells.
5. ✅ **Next-action CTA extracted** to `components/student/NextActionButton.tsx`. It was
   duplicated across both student lanes with *different easing* (`ease-expo-out` vs
   `ease-out`). The label/href logic stays per-lane — `student_diy` has no daily
   report, so its terminal branch legitimately differs.
6. ✅ **`student_diy` reveal parity** — its dashboard used `fadeIn` at all 7 sites while
   `student` used `riseIn` at all 6. Now matched.
7. ✅ **Dead `THEME` const removed** from `src/lib/config.ts` — a second partial copy of
   the palette with 0 importers that had already diverged from `tailwind.config.ts`.
8. ✅ **Owner masthead** — added the missing 3px blue rule and corrected `mt-2` → `mt-3`.

### Resolved 2026-07-21 (Phase 3 — roadmap surface)

9. ✅ **The two roadmap lanes de-duplicated.** `student/roadmap/page.tsx` and
   `student_diy/roadmap/page.tsx` were **365 of 370 lines identical** (role string + 4
   log prefixes were the only differences) and the two `loading.tsx` were byte-identical.
   Third instance of the duplicate-then-drift pattern after the Phase 0 CTA and the
   Phase 2 DIY hero metric. Now: `lib/roadmap-data.ts` (loader) ·
   `components/student/RoadmapView.tsx` (surface) · `RoadmapSkeleton.tsx` ·
   `DeadlineBadge.tsx`. Each page is 15 lines.
10. ✅ **Roadmap masthead onto the canonical recipe.** It was the *only* `h1` in the app
    rendered `uppercase` with a **positive 0.01em** tracking; the other 22 use the
    canonical `tracking-[-0.02em]`. Both occurrences are gone — **24/24 mastheads
    canonical.**

    > The literal class name is deliberately *not* written out anywhere in `docs/`.
    > Spelling it in prose regenerates it — see § Known Drift → Open, "documentation
    > resurrects dead classes", which was demonstrated live by this very entry.
11. ✅ **"Current Step" rendered twice per view.** The page-level card and the timeline's
    active `RoadmapStep` showed the same stage name, title and description; only the
    timeline copy had the action. The action (`Mark complete` + `Watch video`) now lives
    **once**, in the page-level card, and the timeline's active row demoted to the same
    treatment as every other row — its status is carried by the node plus a
    `<Badge variant="info">Current step</Badge>` (the node is `aria-hidden`, so the chip
    is the only signal AT receives). `RoadmapStep` no longer takes `onComplete`.
12. ✅ **Roadmap timeline skeleton rebuilt.** It rendered 16 flat 44px rows (~944px)
    against a real timeline of 3 stage headers + 16 full step rows (~2,430px) — a
    **~1,500px jump on settle**, ~4× the `*/work` jump fixed in Phase 2. Demoting the
    active row made every timeline row uniform, so the skeleton can now mirror it
    faithfully. Also added the missing 3px blue masthead rule and the current-step
    card's chip + action rows.

### Standing (not drift — recorded decisions)

- **Shadow policy is reversed** from the old "shadows only on hover, never at rest".
  134 resting `shadow-card` uses are correct: `ima-bg` and `ima-surface` are both
  `#FFFFFF`, so shadow is the only thing separating a card from the canvas.
  Do not "fix" it back.
- **`ima-bg` is `#FFFFFF`** (was `#F8FAFC`), flattened in the current working tree.

### Open

- 🔴 **Two card systems still coexist.** The radius now matches, so they are no longer
  visually different — but there are still 145 hand-rolled shells vs 43 `<Card>` uses.
  Migrate opportunistically; do not attempt a 49-file sweep in one commit.
- 🔴 **The written contract is deleted in the working tree.** `PRODUCT.md` and CLAUDE.md's
  Design Context are removed but uncommitted. These docs supersede them — that deletion
  needs to be either committed deliberately or reverted.
- 🟡 **`ima-text-muted` still fails AA** (2.56:1) and always will — it is now *restricted*
  to WCAG-exempt uses rather than fixed. 12 sanctioned sites; see § Color Palette.
- 🟡 **The locked-roadmap-step exemption is doing more work than it looks.** The sanctioned
  use covers `RoadmapStep`'s locked title *and* description. For a student early in the
  program that is **14 of 16 steps** — the majority of the timeline's prose rendering at
  2.56:1. WCAG 1.4.3 exempts *inactive user interface components*; a locked step's
  description is arguably not a control at all, just text about upcoming work. Reviewed
  2026-07-21 and **deliberately left as-is** — the muting is what makes locked steps read
  as unavailable. If it's revisited, the smallest fix is title stays muted, description
  moves to `ima-text-secondary`.
- 🟡 **Six blue-glow shadow values, one token.** See § Elevation. Wants a
  `shadow-glow-primary` token and a visual pass.
- 🔴 **Documentation resurrects dead classes — confirmed live 2026-07-21.** Writing a
  utility's literal name in `docs/` is enough to emit it into production CSS, because
  Tailwind v4's automatic source detection scans the whole project root. Measured, not
  theorised: documenting the masthead class that had *just* been deleted from `src/` grew
  the emitted stylesheet by **268 bytes** and put `letter-spacing:.01em` back into
  production with **zero `src/` usages**. Reverting the prose removed it again.
  **When you record a class you removed, describe it — don't spell it.** Two dead
  letter-spacing rules (`.14em`, `-.005em`) are still in the stylesheet from earlier
  rounds of this. The real fix is the `source(none)` + explicit `@source` change sketched
  at the end of this section; until that lands, prose discipline is the only guard.
- 🟢 **The only infinite animation outside skeletons** is `RoadmapStep`'s active node
  (`motion-safe:animate-pulse`, `RoadmapStep.tsx:47`). It is `motion-safe`-gated so it's
  compliant, but `animate-pulse` isn't one of the four documented keyframes and a
  permanently pulsing element on an orientation screen is a standing attention magnet.
  Kept for now — with the active step's elevated card gone, the node is the timeline's
  only "you are here" marker.

> ⚠️ **Raw hex shadows the tokens in 4 places.** Recharts needs literal hex, so
> `AnalyticsClient`, `DealsTrendChart`, `WeeklyHoursChart` and `WeeklyEmailsChart`
> mirror `ima-text-secondary` (and `EMAIL_SERIES_COLORS` mirrors three tokens), and `WeeklyMomentum` mirrors `ima-warning` in an arbitrary
> `shadow-[…rgba()]`. All four went stale the moment the tokens changed and had to be
> hand-synced. **If you change a token, grep for its old hex AND its rgb() triplet.**
> Also: never write a stale color literal in a comment inside `src/` — Tailwind v4
> scans files as raw text and will regenerate the dead utility class.

> 🔴 **Tailwind v4 scans far more than `content:` says.** `@import "tailwindcss"` does
> **automatic source detection** across the whole project root (respecting
> `.gitignore`), *in addition to* the `content` globs in `tailwind.config.ts`. That
> means `docs/`, `.planning/`, and even comments in `tailwind.config.ts` itself are
> scanned — so a hex written in a documentation table can emit a phantom utility class
> into production CSS. A dead `.text-[#64748B]` rule in the live stylesheet came from
> exactly this. It is also why an unignored `.next.old/` leaked 11 KB of dead classes.
>
> **Fix (untested — verify carefully before shipping):** constrain sources explicitly in
> `globals.css`:
> ```css
> @import "tailwindcss" source(none);
> @source "../../src";
> ```
> Do **not** apply this casually — if the globs are wrong the app ships unstyled. Build,
> then diff the emitted CSS against the current one and confirm no real classes vanish. Worth an `eslint.config.mjs` ignore entry.

---

## Verification

Re-measure before trusting any number above.

```bash
# Type scale
grep -rhoE 'text-\[[0-9]+px\]' src --include=*.tsx | sort | uniq -c | sort -rn

# Tracking
grep -rhoE 'tracking-\[?[a-z0-9.-]+\]?' src --include=*.tsx | sort | uniq -c | sort -rn

# Spacing rhythm
grep -rhoE '(gap|px|py|mt|mb|p)-\[[0-9]+px\]' src --include=*.tsx | sort | uniq -c | sort -rn

# Radius
grep -rhoE 'rounded-(\[[0-9]+px\]|xl|2xl|lg|md|full|sm)' src --include=*.tsx | sort | uniq -c | sort -rn

# Bans — all must return 0
grep -rn 'bg-gradient\|backdrop-blur' src --include=*.tsx | wc -l
grep -rn 'ima-pastel\|ima-magenta\|ima-teal\|ima-violet' src --include=*.tsx | wc -l
grep -rnoE '(^|[^:])\banimate-[a-zA-Z]' src --include=*.tsx | grep -v 'motion-safe:' | wc -l

# Card system split
grep -rho 'rounded-\[14px\]' src --include=*.tsx | wc -l   # hand-rolled
grep -rho '<Card[ >]' src --include=*.tsx | wc -l          # primitive
```
