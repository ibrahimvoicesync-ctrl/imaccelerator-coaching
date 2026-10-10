# General Vibe

> Seeded from the deleted "Design Context" block in `CLAUDE.md`
> (`git show HEAD:CLAUDE.md`). This is the *feel* document — what the product should
> evoke. Hard numbers live in `05-style-guide.md`.

## Overall Aesthetic

**Editorial-restrained.** Minimalist with confident typography. Blue as signal, white
as canvas. Light mode only.

- **Theme:** Light. Pure white canvas (`#FFFFFF`), white surfaces separated by a
  barely-there slate-tinted shadow rather than a background-value step.
- **Feel:** Disciplined, trustworthy, understated.
- **Color direction:** A single blue signal hue on a neutral slate ramp. No second
  brand color exists.

## Brand Personality

**Disciplined. Trustworthy. Understated.**

Evoke calm confidence, focus, and earned progress — NOT urgency, NOT gamified hype.
The app sits between Ibadat and Dunya; it must feel respectful and grounded. Voice is
direct and specific, never hype.

This is the load-bearing constraint. Most "improve the dashboard" instincts —
celebratory color, achievement badges, urgency banners, streak-shaming — are
**wrong for this product** even when they'd raise engagement elsewhere.

## Reference Feel

| Reference | What we take from it |
|---|---|
| **Linear** | Sidebar restraint — quiet chrome, no decoration competing with content |
| **Stripe Dashboard** | KPI hierarchy, editorial uppercase labels, tabular numbers |
| **Arc Browser** | Quiet chrome generally; the frame recedes |
| **Vercel Dashboard** | Spacing discipline, generous vertical rhythm |

## Anti-References

Explicitly banned directions. These are not stylistic preferences — they are rules.

- Generic Tailwind SaaS templates
- Gamified productivity apps (streaks-confetti-amber-stars aesthetics)
- Bootcamp purple-gradient marketing sites
- "AI coding assistant" landing pages

**Concretely banned:**

- All gradients, including blue-to-blue. No gradient text anywhere.
- Glassmorphism / `backdrop-blur` on content surfaces.
- Pastel, magenta, teal, violet accents.
- Border stripes wider than 1px (no `border-l-4` accent bars).
- Any new font family. Personality comes from weight, tracking and size discipline.
- New hex colors outside the `ima-*` token set.

*Current compliance: 0 gradients, 0 `backdrop-blur`. The pastel/magenta/teal/violet
tokens were deleted from `tailwind.config.ts` on 2026-07-21 — they can no longer be
used even by accident.*

## Color Psychology

**Blue (`#2563EB`) is the only signal color.** Blue reads as professional, calm and
trustworthy — correct for a product handling a student's livelihood and a mentor's
reputation. It is deliberately *not* a growth-hacky green or an urgent amber.

The discipline that makes it work: blue marks **what matters**, never what looks nice.
Reserve it for:

- The active nav item
- The single hero metric on a view
- Primary CTAs
- Focus rings

Everything else lives on the slate ramp. When a screen starts to feel flat and the
instinct is "add color," the correct move is to add *contrast in weight and size*, or
to remove a competing element so the existing blue carries more.

Semantic hues (success green, warning amber, error red) are **status**, not brand.
They appear only at 10% tint behind their own text color, in badges and chips.

## Typography Direction

- **One family: Inter** (`next/font/google`, latin subset). No display face, no mono.
  A JetBrains Mono experiment was removed in commit `ed24734`; do not reintroduce it.
- **Headlines:** semibold, tight negative tracking (`-0.02em`), tight leading (1.05).
  Large but not monumental.
- **Editorial labels:** 10–11px, semibold, UPPERCASE, `+0.08em` tracking. This is the
  product's most recognisable typographic signature — it appears 210 times.
- **Numbers:** always `tabular-nums`. Metrics must not jitter as they tick.
- **Body:** 15px at 1.55 leading, capped at `58ch` measure.

## Motion Direction

Motion is **allowed and encouraged**, which is a deliberate reversal of an earlier
stricter policy (commit `ed24734`). Scroll reveals, spring physics, and expressive
easing are all fair game — provided:

1. Every `animate-*` is `motion-safe:` gated, so reduced-motion users get a calm app.
2. Motion *serves* the content. A metric rising into place earns its animation; a
   decorative background loop does not.

The house easing is `expo-out` — `cubic-bezier(0.16, 1, 0.3, 1)`. It is physical
rather than mechanical, and it deliberately banishes the default `ease-out`.

## Brand Asset

The logo is a custom mark: a stylized **handshake icon** + **"IMA ACCELERATOR"**
wordmark, uppercase, bold, wide tracking. It is **NOT a graduation cap** — any
`GraduationCap` icon reference is obsolete and must not return.

The source PNG is deep navy, but the mark ships **rendered in `ima-primary`** via CSS
`mask-image`, so the color always comes from the live token rather than the asset.

```tsx
<span
  role="img"
  aria-label="IMA Accelerator"
  className="block bg-ima-primary"
  style={{
    width: 192, height: 40,
    WebkitMaskImage: "url(/ima-logo.png)", maskImage: "url(/ima-logo.png)",
    WebkitMaskSize: "contain", maskSize: "contain",
    WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
    WebkitMaskPosition: "left center", maskPosition: "left center",
  }}
/>
```

- **Asset:** `/public/ima-logo.png` (horizontal lockup, navy + alpha)
- **Sizes:** sidebar ~40px tall, login card ~50px, root/landing ~60px
- **Never:** place on blue or dark backgrounds, separate icon from wordmark in the
  sidebar, stretch, rotate, crop, or tint to any hue other than `ima-primary`
- **Never** substitute a Lucide glyph for the mark
- `src/proxy.ts` must exempt static image extensions, or the auth guard redirects the
  mask URL to `/login` and the logo renders blank

## Skill Overrides

When running `/impeccable`, `/bolder`, `/refactoring-ui` or any design skill on this
repo:

- **Keep the font stack.** No new families.
- **Do not migrate tokens to OKLCH.** `ima-*` is the fixed palette.
- **Do not reintroduce** the deprecated pastel/magenta/teal/violet tokens.
- **Respect the absolute bans** above.
- **"Bolder" means** committing harder to `ima-primary` as the single dominant signal,
  and to weight/tracking/tabular-nums discipline. It never means new hues, surface
  tints, or restored monumental scale.
