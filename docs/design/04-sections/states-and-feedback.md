# Section Spec: States & Feedback

Empty, loading, error and confirmation states. In a daily-use tool these are not edge
cases — a new student sees almost nothing *but* empty states in week one.

## Loading

Every route has a sibling `loading.tsx` that renders a **skeleton matching the real
page's geometry** — same card count, same radii, same spacing rhythm. This is why the
`6/10/14/18` pixel spacing appears in the skeletons too; if you change a page's layout,
change its skeleton in the same commit or the transition visibly jumps.

### The container must match first

Before matching any internal blocks, check the **wrapper**. A skeleton at a different
`max-w-` than its page produces a horizontal jump that dwarfs any internal mismatch.

| Surface family | Container |
|---|---|
| Dashboards, lists, detail pages | `max-w-[1200px]` |
| **Work tracker** (`*/work`) | `max-w-[1200px]`, two columns on `lg` (tracker + 380px day planner) |

Both `student/work` and `student_diy/work` skeletons once shipped at `1200px` against
what was then a `760px` page — a ~440px jump on the most-used screen in the product.
Fixed 2026-07-21. On 2026-09-29 the page itself widened to `1200px` to fit the
`DaySchedule` planner column; the skeletons moved with it and reserve both columns.

Audit the whole set with:

```bash
for l in $(find src/app -name loading.tsx); do d=$(dirname "$l"); p="$d/page.tsx"
  [ -f "$p" ] || continue
  pw=$(grep -oE 'max-w-\[[0-9]+px\]' "$p" | head -1)
  lw=$(grep -oE 'max-w-\[[0-9]+px\]' "$l" | head -1)
  [ "$pw" = "$lw" ] || echo "$d  page=$pw skel=$lw"
done
```

> ⚠️ **The script only sees literal classes in `page.tsx`/`loading.tsx`.** Once a route
> delegates its markup to a component — as `*/roadmap` now does (`RoadmapView` /
> `RoadmapSkeleton`) — both files report `none` and the route *passes vacuously*. Four
> routes are currently invisible to it. When a surface is extracted, check the
> containers in the components by hand and note the pairing here.

### Match the internal geometry, not just the container

A matching container still jumps if the blocks inside are the wrong height. The roadmap
timeline skeleton rendered **16 flat 44px rows (~944px)** against a real timeline of
**3 stage headers + 16 full step rows (~2,430px)** — a ~1,500px jump, ~4× the `*/work`
container bug above, and it survived because the container check passed.

Cheap way to be right: mirror the real component's own box model rather than
approximating it. `RoadmapSkeleton` reuses the exact wrappers `RoadmapStep` uses —
`flex gap-4`, an `h-11 w-11` node, `w-[3px] min-h-[2.5rem]` connector, `flex-1 pb-7`
content — so the two can only drift if someone edits one and not the other.

**Uniform rows are worth designing for.** The timeline only became mirror-able once the
active step stopped rendering an elevated card inline; a skeleton cannot reserve space
for a block whose height depends on *which* row is active.

### Omit conditional blocks

A skeleton must reserve space only for what renders **every** time. `CoachNoteCard` is
conditional, so the dashboard skeletons deliberately skip it — reserving space for a
usually-absent block jumps on every load instead of occasionally.

### Skeletons go stale silently

Nothing fails when a page changes and its skeleton doesn't — no type error, no lint
error, no failing test. The student dashboard skeleton still rendered a referral nudge,
a 3-up KPI strip and a deals row **months** after commits `26c1688` and `358f82f`
removed them. Re-read the skeleton whenever you touch a page's section order.

- Primitive: `src/components/ui/Skeleton.tsx`
- Inline/button loading: `src/components/ui/Spinner.tsx`
- `Button` handles its own loading state — preserves resting width via
  `display:contents` + `visibility:hidden`, sets `aria-busy`. Never swap a button's
  label for "Loading…" manually; that reflows the layout.

## Empty states

Primitive: `src/components/ui/EmptyState.tsx`

Copy formula — **state the fact, then the unblocking action**:

> "Reports from your students will appear here as soon as they log their day."
> "Log your first closed deal to start tracking revenue and profit."
> "Generate an invite link above to share with students."

Rules:

- **Never apologise** ("Sorry, nothing here yet").
- **Never blame the user** ("You haven't done anything").
- Point at the specific control that fills the state, and where it is ("above", "the
  Assignments page", "Add Deal").
- Distinguish **empty-because-new** from **empty-because-filtered**:
  - New: "No activity yet" → describe what will appear
  - Filtered: "Try a different name or clear the search." / "Try a longer time range,
    or check back after your next session."

## Errors

- Every `catch` **must** toast or `console.error`. Empty catch blocks are banned.
- Every `fetch()` **must** check `response.ok` before parsing JSON.
- Inline field errors come from the `Input`/`Textarea` primitives: `aria-invalid`,
  `aria-describedby`, and `role="alert"` on the message. Don't hand-roll them.
- Page-level error surface (see `login/page.tsx`):

```tsx
<div role="alert" className="mt-5 rounded-lg border border-ima-error/30 bg-ima-error/10 px-4 py-3 text-sm leading-relaxed text-ima-error">
```

- Error copy is plain and actionable: `"Something went wrong. Try again."` /
  `"You already have an account. Sign in instead."` No error codes in the UI.

## Toasts

`ToastProvider` wraps the dashboard `<main>`. Use for the result of a user-initiated
mutation. Not for background events — a toast the user didn't cause reads as noise.

> **Stability rule:** keep `useCallback` deps stable by holding `toast`/`router` in
> refs. This is a documented footgun in this codebase.

## Confirmation modals

Primitive: `src/components/ui/Modal.tsx`. Required before any destructive or
irreversible action.

Copy formula — **question title + consequence description**:

> **"Delete this announcement?"**
> "This cannot be undone. Students who already saw it will no longer see it in their feed."

> **"Mark Step Complete?"**

Destructive confirm buttons use `<Button variant="danger">`.

## Celebration

`src/components/shared/Confetti.tsx` — CSS-keyframe burst, per-piece trajectory via
`--cx/--cy/--cr/--spin`, gated behind
`@media (prefers-reduced-motion: no-preference)`.

**Use sparingly.** The brand personality explicitly rules out gamified hype, so
confetti is reserved for genuine, rare milestones (closing a first deal, completing the
roadmap) — never for routine completions like finishing a work session.

## Progress indicators

- `role="progressbar"` with `aria-valuenow` / `aria-valuemin` / `aria-valuemax`
- `role="timer"` on the work timer
- Track is `rounded-full` on `ima-surface-light`; fill is `ima-primary`, or
  `ima-success` once the goal is met
