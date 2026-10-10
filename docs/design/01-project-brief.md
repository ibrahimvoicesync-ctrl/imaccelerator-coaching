# Project Brief: IMA Accelerator

> Seeded from the deleted `PRODUCT.md` (`git show HEAD:PRODUCT.md`), reconciled
> against `src/lib/config.ts` on 2026-07-21.

## What We're Building

A student performance & coaching platform for Abu Lahya's halal influencer-marketing
mentorship. It tracks daily outreach and work sessions, walks a student through a
16-step roadmap, collects a daily reflection, and surfaces at-risk signals to coaches
before a student quietly drops off.

This is **not** a marketing site. Every surface sits behind Google OAuth and
invite-only registration. There is no anonymous traffic, no conversion funnel, and no
SEO surface beyond `/login`. Design effort buys *daily-use quality*, not acquisition.

Production: `members.imaccelerator.com`

## Primary Target Audience

- **Students** — young Muslim entrepreneurs under Abu Lahya's mentorship. Daily use,
  often mobile, wedged between outreach blocks and study. They open the app to answer
  two questions: *how is today tracking* and *what do I do next*.
- **Student DIY** — same person, self-directed track. No coach, no daily reports, no
  outreach KPIs. Shares the student visual lane 1:1.
- **Coaches** — manage up to 100 students each. They open the app to find *who needs
  help*, without digging.
- **Owner** — Abu Lahya and staff. Platform-health snapshot: are coaches performing,
  are students progressing, where is the leak.

## Goals

1. **A student logs work in seconds and always knows the next action.** The dashboard's
   single next-action CTA is the most important element in the product.
2. **A coach spots an at-risk student without searching.** At-risk = 3+ days inactive
   or a rating ≤ 2 (`COACH_CONFIG`).
3. **Earned progress feels visible.** The roadmap and hour totals are the emotional
   payoff; they must read as substantial without becoming gamified hype.

## Product Mechanics That Drive the UI

Pulled from `src/lib/config.ts` — the UI must respect these, and they explain why
certain numbers get hero treatment.

| Mechanic | Value | UI consequence |
|---|---|---|
| Work session | 45 min work / 15 min break, 4 cycles | Timer is a first-class screen |
| Daily goal | 4 h | The progress ring target; drives "Goal Reached" state |
| Daily cap | 8 h | Planning limit, lifts once the plan is fulfilled |
| Roadmap | 16 steps across 3 stages | Stage grouping is a primary navigation concept |
| Lifetime targets | 2500 outreach, 300 h | Long-horizon progress bars |
| Daily outreach target | 50 | Daily KPI comparison baseline |
| At-risk | 3 days inactive, rating ≤ 2 | Alert badges, coach roster sorting |
| Report deadline | hour 23 | Time pressure states on the daily report |

## Roles & Surfaces

45 routes across four roles. Full inventory in `06-prd.md`.

- `(auth)` — login, register, register/[code], no-access
- `owner/*` — dashboard, coaches, students, analytics, invites, assignments, alerts, resources
- `coach/*` — dashboard, students, reports, analytics, invites, assignments, alerts, resources
- `student/*` — dashboard, work, roadmap, report, ask, deals, analytics, resources, referral, announcements
- `student_diy/*` — dashboard, work, roadmap, deals, analytics, resources, referral, announcements

**Nav is currently trimmed.** As of 2026-06-09 the Deals, Analytics, Resources and
Announcements tabs are hidden for every role, and Referral moved to a floating pill
(`ReferralPill.tsx`). The routes still exist and still render — only the nav links were
removed. Design work on those pages is real work, but it is not *reachable* work until
the nav is restored.

## Requirements

- **Mobile-first.** Students use this on a phone between blocks. The sidebar collapses
  under `md`; every page wrapper carries horizontal padding.
- **44px minimum touch targets** on every interactive element.
- **WCAG 2.1 AA** — body text ≥ 4.5:1, labelled inputs, ARIA on dynamic content
  (progressbar / timer / alert), `aria-hidden` on decorative icons.
- **Reduced motion respected** — every `animate-*` is `motion-safe:` gated. Currently
  100% compliant.
- **Light mode only.** No dark theme this milestone.
- **Arabic-aware.** Arabic strings (e.g. `MotivationalCard`, the `Assalamu3leikum`
  greeting) must never receive `tracking-tight` — negative tracking breaks connected
  letterforms.

## Non-Goals

No leaderboard, tiers, player cards, streak-shaming, focus mode, or notification
preference surfaces. `config.ts` calls these out as explicitly out of V1 scope. The
brand personality below is the reason: this is not a gamified productivity app.

## Success Criteria

A student opens it daily, logs work in seconds, and always knows the next action.
A coach sees who needs help without digging. An owner gets platform health at a glance.
