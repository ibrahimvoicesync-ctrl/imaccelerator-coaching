# Project Requirements Document

## Project Overview

IMA Accelerator — student performance & coaching platform. Members-only Next.js app
behind Google OAuth, self-hosted on this server via PM2 at
`members.imaccelerator.com`. See `01-project-brief.md`.

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js **16.1.6**, App Router, **`src/proxy.ts` NOT `middleware.ts`** |
| Runtime | React **19.2.3**, TypeScript strict |
| Styling | Tailwind CSS **v4** via `@tailwindcss/postcss` |
| Config bridge | `@config "../../tailwind.config.ts"` in `globals.css` (v4 reads the v3-style config) |
| Components | Hand-rolled CVA primitives — **not shadcn/ui** |
| Variants | `class-variance-authority` + `clsx` + `tailwind-merge` (`cn()`) |
| Animation | `motion` v12 (Framer) + CSS keyframes in `tailwind.config.ts` |
| Charts | `recharts` v3 |
| Icons | `lucide-react` |
| Forms | `react-hook-form` + `zod` v4 |
| Dates | `date-fns` v4, `react-day-picker` v9 |
| Backend | Supabase (`@supabase/ssr`, `@supabase/supabase-js`) — auth + Postgres + RLS |
| Push | `web-push` |
| Font | `Inter` via `next/font/google`, latin subset |

### Deliberate non-choices

- **No shadcn/ui.** Primitives in `src/components/ui/` are hand-written CVA. Don't run
  `npx shadcn add` — it will introduce a second token system (`--background`,
  `--foreground`) that conflicts with `ima-*`.
- **No Three.js / R3F / Sketchfab.** No 3D anywhere. This is a data tool.
- **No second font.** A JetBrains Mono experiment was removed in `ed24734`.
- **No dark mode** this milestone.
- **No OKLCH migration.** `ima-*` hex is the fixed palette.

### Build note

`postcss.config.mjs` sets `"@tailwindcss/postcss": { optimize: false }`. Tailwind v4's
lightningcss minify step intermittently corrupts this project's CSS on this host
(garbage bytes → PostCSS "Missed semicolon" → failed production build). CSS ships
unminified; negligible gzipped. **Do not remove this flag** without reproducing the
build failure first.

## File Structure

```
src/
├── app/
│   ├── (auth)/          # login, register, register/[code], no-access — no sidebar
│   ├── (dashboard)/     # owner, coach, student, student_diy — shared Sidebar layout
│   ├── api/             # route handlers, mutations only
│   ├── globals.css
│   ├── layout.tsx       # Inter + body tokens
│   └── page.tsx
├── components/
│   ├── ui/              # CVA primitives (Button, Card, Badge, Input, Modal, …)
│   ├── layout/          # Sidebar
│   ├── shared/          # Confetti, Reveal, LocalTime, CoachFeedbackCard, …
│   ├── student/ coach/ owner/
│   ├── analytics/ announcements/ resources/
├── lib/
│   ├── config.ts        # SINGLE SOURCE OF TRUTH — roles, routes, nav, roadmap, theme
│   ├── supabase/        # client, server, admin
│   ├── schemas/  rpc/  types.ts  utils.ts
└── proxy.ts             # route guard
docs/design/             # this design contract
```

## Design System

See `05-style-guide.md`. Tokens live in **one place** — `tailwind.config.ts` under
`theme.extend.colors.ima`. A duplicate `THEME` block in `src/lib/config.ts` was removed
on 2026-07-21 (0 importers, already diverged). Do not reintroduce a JS color map; the
font stack lives in `src/app/layout.tsx` via `next/font`.

## Surface Inventory

45 routes. Priority reflects daily-use frequency, not build order.

| Surface | Spec | Priority |
|---|---|---|
| App shell (sidebar + layout) | `04-sections/app-shell.md` | P0 |
| Page masthead | `04-sections/page-masthead.md` | P0 |
| Metric hero | `04-sections/metric-hero.md` | P0 |
| Card surfaces | `04-sections/card-surfaces.md` | P0 |
| States & feedback | `04-sections/states-and-feedback.md` | P0 |
| `student/` dashboard | `02-content/student-surfaces.md` | P0 |
| `student/work` | `02-content/student-surfaces.md` | P0 |
| `student/report` | `02-content/student-surfaces.md` | P0 |
| `student/roadmap` | `02-content/student-surfaces.md` | P1 |
| `coach/` dashboard + students + reports | `02-content/coach-owner-surfaces.md` | P1 |
| `owner/` dashboard + coaches + students | `02-content/coach-owner-surfaces.md` | P1 |
| `(auth)/*` | `02-content/auth-surfaces.md` | P1 |
| Deals / Analytics / Resources / Announcements | — | P2 (nav-hidden) |
| `student/ask` | — | P3 (blocked: `AI_CONFIG.iframeUrl` empty) |

## Responsiveness

| Band | Width | Behaviour |
|---|---|---|
| Mobile | 320–767 | Sidebar collapses to 64px top bar; `p-4` page padding; single column |
| Tablet | 768–1023 | Sidebar fixed at 264px; `p-8`; grids begin to split |
| Desktop | 1024+ | `lg:` grid ratios engage (e.g. `1.7fr / 1fr`); content caps at 1200px |

Mobile-first is not aspirational here — students use this on a phone between work
blocks. Every layout decision gets checked at 390px.

## Performance

| Metric | Target |
|---|---|
| LCP | < 2.5 s |
| INP | < 200 ms |
| CLS | < 0.1 |

CLS is the one at genuine risk: `loading.tsx` skeletons must match their page's
geometry, and `tabular-nums` must stay on every live-updating number.

Server Components are the default. `"use client"` only where interaction requires it —
the Sidebar, timers, forms, charts. Sidebar badge counts are `unstable_cache`'d for 60s
under the `badges` tag.

## Accessibility

WCAG 2.1 AA. Full contract in `05-style-guide.md` § Accessibility.

Audited and remediated 2026-07-21. Touch targets, decorative-icon labelling, ARIA on
dynamic content and the skip link were **already** compliant; **contrast was the only
systemic failure** and all four semantic tokens plus `text-secondary` were darkened to
clear AA. `ima-text-muted` remains 2.56:1 and is now restricted to WCAG-exempt uses
(decorative `aria-hidden` icons, inactive controls) — 12 sanctioned sites.

## Constraints

1. **Config is truth** — import roles/nav/roadmap from `src/lib/config.ts`, never hardcode.
2. **Admin client only in server code** — never import into a client component.
3. **`src/proxy.ts`, not middleware.ts.** Its matcher must exempt static image
   extensions or `/ima-logo.png` 302s to `/login` and the masked logo renders blank.
4. **Google OAuth only.**
5. **`import { z } from "zod"`** — never `"zod/v4"`.
6. Zod `safeParse` on all API inputs; `try/catch` around `request.json()`.
7. Auth + role check before validation on every API route.
8. Filter by user ID in queries — never rely on RLS alone.

## Deployment

Not Vercel. `npm run build && pm2 restart ima-coaching` (port 3001). A production build
compiles the **entire working tree**, including uncommitted changes — confirm scope
before shipping. Full runbook in `CLAUDE.md`.
