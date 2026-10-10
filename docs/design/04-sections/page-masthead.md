# Section Spec: Page Masthead

The editorial header that opens every page. The single most repeated composition in the
product and the main carrier of the "editorial-restrained" feel.

**Canonical implementation:** `src/app/(dashboard)/student/page.tsx:128–141`

## Anatomy

```
EYEBROW          ← 11px uppercase, +0.08em, secondary
Headline.        ← 32/36px semibold, -0.02em, leading 1.05
▬                ← 3px × 40px blue rule (optional)
Lede sentence.   ← 15px, secondary, 58ch, leading 1.55
```

## Markup

```tsx
<header className="motion-safe:animate-riseIn">
  <p className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
    Dashboard
  </p>
  <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
    Assalamu3leikum, {firstName}.
  </h1>
  <div className="mt-3 h-[3px] w-10 rounded-full bg-ima-primary" aria-hidden="true" />
  <p className="mt-3 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
    Here&apos;s how today is tracking.
  </p>
</header>
```

## Rules

- **Eyebrow is the page's category**, not a repeat of the headline. "Dashboard",
  "Roadmap", "Daily Report". Always uppercase, always `tracking-[0.08em]`.
- **Headline is human**, not a label. `Assalamu3leikum, {firstName}.` beats "Student
  Dashboard". On coach/owner surfaces it can be a stated fact ("Platform overview").
- ⚠️ **The greeting contains Arabic-derived text.** `tracking-[-0.02em]` is applied to
  the whole `h1` today; if the headline is ever switched to actual Arabic script, the
  negative tracking must be removed — it breaks connected letterforms.
- **The 3px blue rule is optional** and is one of the few purely decorative uses of
  `ima-primary`. Use it on primary surfaces; drop it on secondary ones. Never make it
  taller than 3px (border-stripe ban).
- **Lede is capped at 58ch.** One sentence. States what the page is *for*, not what it
  contains.
- **Entrance:** `motion-safe:animate-riseIn` on the header, then each following section
  gets the same class with an incrementing `style={{ animationDelay }}` of ~100ms.

## Spacing to first section

`mt-9` (36px) from the masthead to the first content section.

## Variants observed

| Surface | Eyebrow | Headline | Rule | Lede |
|---|---|---|---|---|
| `student/` | "Dashboard" | `Assalamu3leikum, {firstName}.` | ✅ | "Here's how today is tracking." |
| `student_diy/` | "Dashboard" | `Assalamu3leikum, {firstName}.` | ✅ | "Here's how today is tracking." |
| `owner/` | "Dashboard" | `Assalamu3leikum, {firstName}!` | ✅ | "Platform overview" |

All three now match the canonical spec. The owner masthead was missing the blue rule
and used `mt-2` on its lede until 2026-07-21.

> **Entrance animation is the one legitimate difference.** Student dashboards use
> `motion-safe:animate-riseIn`; owner and coach use `motion-safe:animate-fadeIn`. That
> is a per-surface choice, not drift — see `05-style-guide.md` § Motion. A page must
> use one reveal throughout.
