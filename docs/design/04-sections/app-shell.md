# Section Spec: App Shell

The persistent chrome around every authenticated surface. Owner of the "quiet chrome"
principle — the frame must recede so content carries the page.

**Files:** `src/app/(dashboard)/layout.tsx` · `src/components/layout/Sidebar.tsx`

## Structure

```tsx
<div className="min-h-screen bg-ima-bg">
  <ToastProvider>
    <Sidebar role={...} userName={...} badgeCounts={...} />  {/* renders ReferralPill for students */}
    <main id="main-content" className="min-h-screen pt-16 md:pt-0 md:ml-[264px]">
      <div className="p-4 md:p-8">{children}</div>
    </main>
  </ToastProvider>
</div>
```

## Sidebar

- **Mobile (< md)** — a fixed 64px beige top bar (`bg-ima-sidebar`, hamburger left, logo
  centred) replaces the old floating hamburger; the drawer is `w-[min(18rem,85vw)]`,
  positioned with `inset-y-0` (**never `h-screen`** — 100vh overflows iOS Safari's
  visible area), slides on the iOS sheet curve `cubic-bezier(0.32,0.72,0,1)` / 300ms,
  `overscroll-contain` on the nav, safe-area bottom padding, no tap-highlight flash.
- **Width 264px**, fixed, `md` and up, **flush to the viewport** — full height, left edge,
  `border-r` only; no gutter, radius or shadow (the floating panel was dropped 2026-10-09). Below `md` it collapses to the top bar described
  above.
- **Logo lockup** at the top: `/ima-logo.png` rendered via `mask-image` in
  `bg-ima-primary`, ~40px tall, wrapped in a `Link` to `/${role}` so it returns home.
  Never substitute a Lucide glyph.
- **Nav items** come from `NAVIGATION[role]` in `src/lib/config.ts`. **Never hardcode
  nav** — config is truth.
- **Icons** resolve through `ICON_MAP` (Lucide). An icon string not in the map renders
  nothing, so add to both together.
- **Separators** — `NavItem.separator` renders a divider *before* the item, grouping
  nav into clusters (e.g. Dashboard/Coaches/Students | Invites/Assignments/Alerts | Resources).
- **Badges** — `NavItem.badge` keys into `badgeCounts`, fed by the `get_sidebar_badges`
  RPC, cached 60s under tag `badges`. Keys currently live: `active_alerts`,
  `unreviewed_reports`, `coach_milestone_alerts`.

### Rows & micro-interactions (2026-10-10)

- **Frame layer** — warm light beige `bg-ima-sidebar` with `border-ima-sidebar-border`
  (rules and separators too), so the white content canvas reads as the raised plane.
- 64px brand band (logo left-aligned, no rule), then 44px rows at `rounded-[10px]`,
  `text-[14px]`, 18px Lucide icons.
- **Hover** — plain CSS `hover:bg-ima-sidebar-hover` (the gliding `layoutId` hover was
  removed 2026-10-10). Press = `scale-[0.98]`.
- **Responsiveness** — the active pill moves **optimistically on click** (`pendingHref`),
  not when the new route's server response lands, and a small spinner (`useLinkStatus`)
  appears on the row if the route takes >100ms. Never gate nav feedback on the server.
- **Active** — a raised white card (`bg-white shadow-card ring-1 ring-ima-border/70`,
  `layoutId="sidebar-active"`, `bounce: 0, duration: 0.25`) springs between rows; label goes `font-semibold
  text-ima-text`, icon goes `ima-primary` at stroke 2.25. The icon is the only blue.
- Count badges are neutral chips; the account block is a raised white card with a slate
  (`ima-text`) avatar and sign-out as an icon button that tints `ima-error` on hover.

### Active state

The active item's icon is the **only** blue element in the sidebar. This is the clearest
expression of "blue is signal" — if a second thing in the chrome turns blue, the active
state stops reading.

### Accessibility

- Opening the mobile panel moves focus to the close button, traps focus, and closes on
  `Escape`. All three already implemented — preserve them in any refactor.
- Every nav row clears 44px.
- `motion/react` drives the panel transition and honours `useReducedMotion()`.

## Content padding contract

The layout applies `p-4 md:p-8`. Full-bleed pages **undo** it and re-establish their
own rhythm:

```tsx
<div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
  <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
```

Use this when a page needs its own canvas. Gutters were tightened from
`px-14 / pt-14 / pb-20` on 2026-10-10 (pages felt over-padded); use `max-w-[880px]` in
place of 1200 for focused single-task tools. Pages that don't need full bleed simply
render into the layout padding.

## Referral

`ReferralPill` is a **sidebar row** for student roles, pinned just above the account
card (moved from a floating top-right pill on 2026-10-10). It looks like a nav row with a
`Gift` icon in the same color as the label; clicking generates the link and expands in place (height spring) into
a white copy/share card. It replaced the Referral nav tab on 2026-06-09 and must stay
visually quiet — never blue.

## KPI dock

`ProgressBanner` (rendered by `student/layout.tsx`) is a 52px white circular button
fixed **bottom-right**, with a RAG dot for today's outreach. Clicking morphs the bubble
into the popup — one surface sharing `layoutId="kpi-blob"`, an under-damped spring for a
blob-like settle, content fading in once it has grown (reduced-motion → instant) grouping Today /
All-time KPIs as label/value rows with animated progress bars plus three stat tiles;
rows stagger in on open. The dot uses `ima-live` (#25D366, presence green) when green and pings once the
daily goal is hit. Closes on Escape, outside click, or the X.

## Rules

- Chrome never uses the hero type scale.
- Chrome never animates on route change beyond the active-state transition.
- Nav trimming is a `config.ts` edit, never a component edit.
