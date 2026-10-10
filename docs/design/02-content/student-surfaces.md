# Content: Student Surfaces

Covers `student/*` and `student_diy/*`. The DIY lane mirrors `student` 1:1 — same copy,
minus anything sourced from data it doesn't have (no daily reports, no outreach KPIs,
no coach). Where DIY lacks the data, **omit the block rather than fake it**.

## Dashboard — `/student`

| Slot | Copy |
|---|---|
| Eyebrow | `Dashboard` |
| Headline | `Assalamu3leikum, {firstName}.` |
| Lede | `Here's how today is tracking.` |
| Hero label | `Today's Work` |
| Hero metric | Hours worked today, vs a 4h goal |
| Goal-met chip | `Goal Reached` + `CheckCircle2` |
| Session counter | `{n} Session` / `{n} Sessions` (pluralised) |
| Primary CTA | Computed `nextAction.label` — must name the actual next step |

Secondary blocks: Consistency (right column, `1.7fr / 1fr` split), weekly hours chart,
coach feedback, roadmap position.

> The duplicate KPI strip and deals summary were removed in `358f82f`. Don't
> reintroduce a second row of numbers competing with the hero.

## Work Tracker — `/student/work`

Mechanics from `WORK_TRACKER`: 45 min sessions, 15 min breaks, 4 cycles/day, 4h goal,
8h cap. Duration presets 30/45/60/90/120, custom 5–240.

Break labels come from config: `Short Break` (5, 10), `Long Break` (15, 20, 25, 30).

The timer carries `role="timer"`. Copy stays factual — no "Keep going!" encouragement.

## Roadmap — `/student/roadmap`

16 steps in 3 stages, titles and descriptions **all live in `ROADMAP_STEPS`**
(`src/lib/config.ts`). Never hardcode a step title in a component.

| Stage | Name | Steps |
|---|---|---|
| 1 | Setup & Preparation | 1–8 |
| 2 | Influencer Outreach | 9–12 |
| 3 | Brand Outreach | 13–16 |

- Steps carry `target_days` (cumulative from `joined_at`); stage 3 tail steps have
  `null` = no deadline. Don't render a deadline chip for `null`.
- `unlock_url` shows a link when a step becomes active.
- Confirmation before completion: **"Mark Step Complete?"**
- Empty (coach view): `This student hasn't started their roadmap.`

Step 15 is `Receive Your First Brand Rejection` — deliberately framed as a milestone.
Keep that framing; it is the brand personality in miniature.

## Daily Report — `/student/report`

Field labels are authoritative in `DAILY_REPORT.fields`:

| Field | Label | Required |
|---|---|---|
| `starRating` | `Rate your day` | ✅ |
| `brandsContacted` | `Brands outreach` | ✅ |
| `influencersContacted` | `Influencers outreach` | ✅ |
| `callsJoined` | `Calls joined` | ✅ |
| `wins` | `What went well today?` | — (500 max) |
| `improvements` | `What could you improve tomorrow?` | — (500 max) |

Deadline hour 23. Empty history: `Start tracking your progress by submitting your first
daily report.`

## Deals — `/student/deals`

- Empty: `Log your first closed deal to start tracking revenue and profit.`
- Primary action: `Add Deal`

## Analytics — `/student/analytics`

- Empty (range): `No activity in this range` / `Try a longer time range, or check back
  after your next session.`

## Ask — `/student/ask`

`AI_CONFIG`: title `Ask Abu Lahya`, subtitle `Your 24/7 AI mentor`. Renders an iframe.

> ⚠️ `AI_CONFIG.iframeUrl` is still `""` with a TODO. The page cannot be designed
> meaningfully until that URL exists.

## Referral

A row at the bottom of the sidebar, above the account card (`ReferralPill.tsx`), not a
nav tab. Label reads `Get my referral link`. Must stay visually quiet — it is secondary to the page CTA.

## Currently unreachable

Deals, Analytics, Resources and Announcements are **hidden from nav** for all roles as
of 2026-06-09. The pages render; the links are commented out in
`NAVIGATION` (`src/lib/config.ts`). Design work here is real but not user-visible until
the nav is restored.

## Ask AI — business check-in (`BusinessCheckinForm.tsx`)

Revamped 2026-10-10 on Apple-style motion principles:

- **Fields are filled wells**, not 2px outlines: `bg-ima-surface-light/70`, no border at
  rest, lifting to `bg-white` + `border-ima-primary` + `ring-4 ring-ima-primary/10` on
  focus. Values are `ima-text` (not blue) with `-0.02em` tracking.
- **Segmented progress** — one 4px segment per question, filled on a critically damped
  spring (`bounce: 0, duration: 0.4`).
- **Screens slide along the direction of travel** (forward → in from the right, back →
  in from the left), and the card height springs to fit. Reduced motion → cross-fade.
- **Invalid "Continue" shakes** the screen (decaying ±9px, 420ms), like a wrong passcode.
- Counts get `−`/`+` steppers; the feeling scale is a segmented control with a gliding
  white thumb; the cash total glides to its new value.
- **Unlock moment** — on save the padlock opens on a green disc (`ima-success-bright`)
  for ~1.3s before handing off to `/student/ask`.
