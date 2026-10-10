# Section Spec: Metric Hero

The single largest number on a view. Carries the "one focal point per view" principle —
if a screen has two of these, the screen is wrong.

**Canonical implementation:** `src/components/student/TodaysWorkMetric.tsx`

## The rule

**Exactly one metric hero per view.** Every other number on the page steps down to
`text-[44px]`, `text-[32px]`, or the KPI scale. If a second metric feels like it
deserves hero size, the real problem is that the page is trying to answer two questions
and should be split or re-ranked.

## Markup

```tsx
<span className="text-6xl md:text-7xl font-semibold tabular-nums tracking-tight leading-[0.95] text-ima-primary">
  {value}
</span>
```

- `tabular-nums` — **mandatory**. This number ticks; proportional figures make it jitter.
- `tracking-tight` — large numerals need the negative tracking to hold together.
- `leading-[0.95]` — sub-1 leading so the numeral sits tight against its label.
- `text-ima-primary` — the hero metric is one of the four sanctioned uses of blue.

## Color states

| State | Color |
|---|---|
| Default / in progress | `text-ima-primary` |
| Goal reached | `text-ima-success` (paired with a "Goal Reached" chip) |
| On a filled blue surface | `text-white` (roadmap stage cards) |

## Label pairing

The hero is always introduced by an eyebrow label directly above it, and often followed
by a unit or context line:

```tsx
<p className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
  Today&apos;s Work
</p>
{/* hero metric */}
```

The container carries `aria-labelledby` pointing at the label's `id`, so the number is
announced with its meaning.

## Where it appears

| Surface | Metric |
|---|---|
| `student/` · `student_diy/` | Hours worked today (`TodaysWorkMetric`) |
| `student/roadmap` · `student_diy/roadmap` | Step progress (white on blue) |
| `student/analytics` | Headline analytic |
| `student/deals` · `coach` DealsTab | Deal value / count |
| `coach` RoadmapTab | Cohort average step (`text-5xl md:text-6xl`) |

Coach-side heroes step down one notch (`5xl/6xl`) because coach views are comparative
rather than personal — no single number owns the page the way it does for a student.

## Anti-patterns

- ❌ A second `6xl`/`7xl` number anywhere on the same view.
- ❌ `7xl`/`8xl` "monumental scale". The amplified `student_diy` treatment was retired;
  `student_diy` mirrors `student` exactly.
- ❌ Gradient text on the metric.
- ❌ Omitting `tabular-nums` because "it looks tighter without it". It will jitter.

## Motion

The hero's card animates in with `motion-safe:animate-riseIn` at a ~100ms delay behind
the masthead. The number itself does not count up — a ticking count-up reads as
gamified hype, which the brand personality rules out.
