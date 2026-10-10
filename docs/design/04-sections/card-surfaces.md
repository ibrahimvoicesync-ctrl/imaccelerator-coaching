# Section Spec: Card Surfaces

Every content block in the product is a card. Because `ima-bg` and `ima-surface` are
both `#FFFFFF`, cards separate from the canvas by **shadow and border only** — there is
no background-value step to fall back on.

## Two systems coexist — but they now match

| System | Occurrences | Radius |
|---|---|---|
| Hand-rolled shell | **145** across 49 files | `14px` |
| `<Card>` primitive | 43 | `14px` (was `rounded-xl`/12px until 2026-07-21) |

They are no longer *visually* different — the primitive's radius was corrected. Two
implementations of the same look still exist, which is a maintenance cost rather than a
visual bug. **Match whichever system the file you're editing already uses**; don't mix
them within one view, and migrate hand-rolled shells to `<Card>` opportunistically
rather than in a sweep.

## House card shell

```tsx
<div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-8">
```

Dense variants use the pixel rhythm instead of `p-6`:

```tsx
<div className="bg-white border border-ima-border rounded-[14px] shadow-card px-[18px] py-[16px]">
```

## Nesting and radius

Radius decreases with depth:

```
Card              rounded-[14px]
└─ Inner surface  rounded-[12px]
   └─ Inset tile  rounded-[10px] / rounded-[8px]
      └─ Chip     rounded-full
```

Never nest a larger radius inside a smaller one.

## Interactive cards

```tsx
hover:shadow-card-hover hover:-translate-y-0.5 motion-safe:transition-all motion-safe:duration-200 cursor-pointer
```

Only cards that navigate somewhere get this. A card that merely *contains* an
interactive element does not lift — the element inside handles its own hover.

## Card header pattern

Label left, status right:

```tsx
<div className="flex items-center justify-between gap-3">
  <p id="x-label" className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
    Today&apos;s Work
  </p>
  <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success">
    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
    Goal Reached
  </span>
</div>
```

Status chips are `rounded-full`, 10px uppercase, on a `/10` tint of their semantic hue
with a matching `/10` border.

## Grid

Default gap is `gap-[14px]`. Asymmetric hero rows use an explicit ratio:

```tsx
<section className="mt-9 grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-[14px] items-start">
```

`items-start` prevents a tall card stretching its shorter neighbour.

## Primary CTA card

The next-action button is the most important element on the student dashboard and gets
a treatment nothing else may use. **Use the shared component** —
`components/student/NextActionButton.tsx` — rather than re-pasting the classes; it was
duplicated across both student lanes and silently drifted apart on easing:

```tsx
<NextActionButton href={nextAction.href} label={nextAction.label} />
```

Its implementation:

```tsx
className="group inline-flex items-center justify-center gap-3 w-full rounded-[14px]
  bg-ima-primary text-white text-[15px] md:text-[17px] font-bold tracking-tight
  min-h-[60px] md:min-h-[64px] px-6
  motion-safe:transition-all motion-safe:duration-200 ease-expo-out
  hover:bg-ima-primary-hover
  hover:shadow-[0_14px_32px_-14px_rgba(37,99,235,0.65)]
  hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99]
  focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
```

Note it is **64px tall and `font-bold`** — well beyond the `Button` primitive's `lg`
size. That is deliberate: it is the one element on the page a student should hit
without looking. Do not replace it with `<Button size="lg">`.

## Rules

- Never put a card on a colored background.
- Never use more than 1px borders.
- Never add a border stripe (`border-l-4`) as an accent — banned.
- `shadow-card` at rest is correct and intentional. Do not remove it in the name of the
  old "shadows only on hover" rule; that rule was superseded.
