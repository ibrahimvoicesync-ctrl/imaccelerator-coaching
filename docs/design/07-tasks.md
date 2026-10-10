# Implementation Tasks

Ordered by leverage, not by the generic setup→launch template — this is a mature
codebase, not a greenfield build. Phase 0 exists because the audit found real
contradictions; everything after it assumes a single coherent system.

**Legend:** 🔴 blocking / 🟡 should fix / 🟢 polish

---

## Phase 0 — Reconcile the contract ✅ done 2026-07-21

`npx tsc --noEmit` clean; `npx eslint` clean on every touched file.

- [x] **`Card` primitive radius** `rounded-xl` (12px) → `rounded-[14px]`, matching the
      145 hand-rolled shells it shares pages with.
- [x] **Deleted the 9 deprecated tokens** from `tailwind.config.ts` (`ima-pastel-*`,
      `ima-magenta`, `ima-teal`, `ima-violet`) — 0 usages, so they can no longer be
      reached even by accident.
- [x] **Normalized `tracking-widest` → `tracking-[0.08em]`** across 15 coach-side sites.
      Total now 225.
- [x] **Auth cards onto the house style** — all 6 shells (`login`, `register`,
      `register/[code]`, `no-access`, `MagicLinkCard`, `RegisterCard`) moved from
      `rounded-xl`/`shadow-sm` to `rounded-[14px]`/`shadow-card`.
- [x] **Extracted `components/student/NextActionButton.tsx`.** The CTA was duplicated
      across both student lanes and had drifted — `ease-expo-out` vs `ease-out`. The
      `getNextAction` *logic* stays per-lane; DIY has no daily report, so its terminal
      branch legitimately differs.
- [x] **`student_diy` reveal parity** — 7 × `animate-fadeIn` → `animate-riseIn` to match
      `student/page.tsx`.
- [x] **Removed the dead `THEME` const** from `src/lib/config.ts` (plus its entry in the
      aggregate default export). 0 importers, second partial copy of the palette.
- [x] **Owner masthead** — added the missing 3px blue rule, corrected `mt-2` → `mt-3`.

### Deliberately not done

- **Did not add a `Button` variant for the next-action CTA.** A shared component is the
  right shape for a 2-call-site element with bespoke geometry; a CVA variant used twice
  would be over-abstraction.
- **Did not migrate coach/owner to `riseIn`.** `fadeIn` (96 uses) is the dominant
  reveal; `riseIn` (13) is scoped to the student dashboards. Upgrading one masthead
  would leave the rest of its page mismatched.
- **Did not sweep the 145 hand-rolled shells into `<Card>`.** Radius now matches, so
  this is a maintenance concern, not a visual one. Migrate opportunistically.

### Still open from Phase 0

- [ ] 🔴 **Decide the fate of the deleted design docs.** `PRODUCT.md` is deleted and
      CLAUDE.md's Design Context is stripped, both uncommitted. Either commit that
      deletion deliberately (`docs/design/` supersedes them) or revert it. Recover with
      `git show HEAD:PRODUCT.md`. **This is a user decision.**
- [ ] 🟢 **Add an ESLint ignore** for `.next.old/`, `.agents/`, `.claude/skills/`.
      `npm run lint` currently reports ~963 errors from build artifacts and vendored
      scripts; source is clean but the signal is buried.

---

## Phase 1 — Accessibility conformance ✅ done 2026-07-21

`tsc --noEmit` clean · `eslint src` 0 errors · `npm run build` exit 0 · new token values
verified present in the emitted CSS.

**Contrast was the only systemic failure.** Everything else audited clean.

- [x] 🔴 **Darkened all four semantic tokens.** They are used as text on their own /10
      tint at 10px — the smallest type in the product — and failed hard: success
      2.31:1, warning 1.99:1, error 3.29:1, info 3.29:1. Now `#047857` / `#92400E` /
      `#B91C1C` / `#1D4ED8`, all ≥4.78:1 on tint. White-on-solid still passes, so
      filled buttons and progress fills are unaffected.
- [x] 🔴 **Migrated 60 of 72 `ima-text-muted` usages** to `ima-text-secondary`. The 12
      retained are WCAG-exempt: `aria-hidden` decorative icons, locked roadmap steps,
      outside-month calendar days, and the unfilled half of a `role="img"` star rating.
- [x] 🔴 **Nudged `ima-text-secondary` `#64748B` → `#5F6E85`.** It passed on white but
      failed on `surface-light` (4.34:1), a surface used 294 times — and it had just
      become the workhorse color, so the migration would otherwise have moved text from
      one failure into another.
- [x] 🟡 **Synced the 3 chart raw-hex constants** (`AnalyticsClient`, `DealsTrendChart`,
      `WeeklyHoursChart`) that mirror `ima-text-secondary`. Recharts needs literal hex,
      so these shadow the token and went stale the moment it changed.
- [x] 🟡 **Touch targets — already 100%.** All 109 interactive elements clear 44px.
- [x] 🟡 **Decorative icons — already 100%.** All 207 Lucide elements hidden from AT.
- [x] 🟡 **ARIA on dynamic content — already complete.** 14/14 progressbars fully
      specified; plus 34 `role="alert"`, 9 `role="status"`, 1 `role="timer"`.
- [x] 🟢 **Skip link verified** — `Sidebar.tsx` → `#main-content`, target present.

### Bonus find: the build was scanning stale output

Chasing one dead `#f59e0b` rule that survived three rebuilds turned up a real bug.
`.gitignore` had `/.next/` but **not `.next.old`** — and the `CLAUDE.md` deploy runbook
creates `.next.old` on *every* deploy. Tailwind v4 auto-detects sources from the project
root respecting `.gitignore`, so every build was scanning ~90MB of stale compiled JS and
leaking its dead utility classes into the new stylesheet.

Fixed by ignoring `/.next.old/`, `/.next.new/`, `/.next.broken/` (all three runbook
artifact names) in `.gitignore`, and adding them plus `.agents/` and `.claude/` to
`eslint.config.mjs`.

| | Before | After |
|---|---|---|
| Main CSS chunk | 90 KB | **79 KB** (−12%) |
| `npm run lint` | 16,482 problems / 963 errors | **2 problems / 0 errors** |

The CSS was also **non-deterministic** — output depended on which stale build snapshots
happened to be lying around.

### Lesson for future audits

Naive greps over-report badly. 18 "missing `aria-hidden`" icons and 40 "undersized"
touch targets were **all false positives** — the attribute lived on an *ancestor*, or
the size came from `buttonVariants()`. Check the composed result, not the element's own
attribute string. And when a value you removed keeps reappearing in build output, ask
what else is being scanned before assuming a cache.

### Still open

- [ ] 🟢 Keyboard-only pass through sidebar → page → modal → toast. Needs a human at a
      browser; the structural pieces (focus trap, Escape handling, focus-visible rings)
      are in place but the *flow* is unverified.
- [ ] 🟢 Eyeball the darkened palette in situ. Warning moved from bright amber to a
      dark brown-amber — the biggest visual shift of the four. Only `/login` is
      screenshottable without OAuth; authed screens need a user check.

**Regression guards (all must stay at 0):**
```bash
grep -rn 'bg-gradient\|backdrop-blur' src --include=*.tsx | wc -l
grep -rn 'ima-pastel\|ima-magenta\|ima-teal\|ima-violet' src --include=*.tsx | wc -l
grep -rnoE '(^|[^:])\banimate-[a-zA-Z]' src --include=*.tsx | grep -v 'motion-safe:' | wc -l
```

---

## Phase 2 — P0 surfaces (daily-use path) — structural pass ✅ 2026-07-21

`tsc` clean · `eslint` 0 errors · `npm run build` exit 0.

> **Scope note.** These surfaces are behind OAuth and cannot be screenshotted, so this
> pass was deliberately limited to **structural conformance** — parity, skeleton
> geometry, shared-component use. No speculative visual redesign was done on screens
> that can't be seen. Visual refinement stays open below.

- [x] **`student_diy` parity — fixed a real gap.** The DIY dashboard hand-rolled the
      hero metric inline instead of using `<TodaysWorkMetric>`, so it was **missing the
      count-up animation** the component's own docstring calls "the signature moment",
      drove its progress bar with a CSS transition instead of the rAF loop, and lacked
      the `aria-label` that exposes the true value during animation. Now uses the shared
      component. Same duplication pattern as the Phase 0 CTA drift.
- [x] **Rewrote `student/loading.tsx`.** It was months stale — still rendered a referral
      nudge, a 3-up KPI strip and a deals row that `26c1688` and `358f82f` removed, and
      missed the hours chart and leaderboard entirely.
- [x] **Rewrote `student_diy/loading.tsx`** — same staleness, now mirrors its real
      section order (deals row + full-width roadmap, no Daily Report pair).
- [x] **Fixed a ~440px horizontal jump on `*/work`.** Both work skeletons used
      `max-w-[1200px]` against a `max-w-[760px]` page, and rendered a masthead the page
      doesn't have (it's just a right-aligned `ReminderBell`). Both lanes fixed.
- [x] **`student/report` skeleton verified correct** — kicker, hero date, form card,
      footer link all match.
- [x] **"One focal point per view" verified** — every file has exactly one
      `text-6xl`/`7xl`. Coach views correctly step down to `5xl`/`6xl`.

### Deliberately not done

- **No visual redesign of authed screens.** Can't see them; changing them on taste alone
  would be guessing on a live product.
- **Owner skeletons left for Phase 3** (they're P1). See the finding below — they are
  not uniform enough to fix mechanically and need per-file judgment.

### Found, deferred to Phase 3

- 🔴 **All 7 owner skeletons predate the current layout.** They use an old
  `<div className="px-4">` + `<Skeleton>` pattern with **no `max-w-` container at all**,
  while every owner page uses the full-bleed `max-w-[1200px] px-6 md:px-14 pt-10
  md:pt-14` wrapper. That's a jump in both axes on every owner page load. They are not
  uniform (`owner/analytics` differs entirely; `alerts`/`assignments` use
  `space-y-6 px-4`), so each needs reading rather than a scripted sweep.
- 🟡 **`student_diy/analytics` and `student_diy/deals`** — same missing-container problem
  as the owner set. Both are nav-hidden (P2), so lower priority.
- 🟡 **`coach/students/[studentId]`** — skeleton declares `max-w-[1200px]`, page declares
  none. Confirm which is right.

**10 container mismatches remain** (7 owner + 2 `student_diy` P2 + 1 coach detail). All
4 P0 surfaces are now aligned. Re-check with the audit snippet in
`04-sections/states-and-feedback.md`.
- 🟡 **`student/report` masthead deviates** — its `h1` is `text-5xl md:text-6xl`, not the
  canonical `text-[32px] md:text-[36px]`. Possibly intentional (the date *is* the hero
  on that screen), but it is undocumented. Decide and record it.
- 🟢 **16 pages have no `loading.tsx`** — mostly nav-hidden P2 routes (resources,
  announcements, referral across all roles) plus `coach/assignments`. Auth pages don't
  need one.

### Still open (needs a browser / your eyes)

- [ ] Visual pass on `student/`, `student/work`, `student/report`, `student_diy/`
- [ ] Confirm the rewritten skeletons actually settle without a jump
- [ ] `student/work` break/session/paused states — a branching client; the skeleton
      reserves one card rather than guessing a branch

---

## Phase 3 — P1 surfaces (management path)

### `student/roadmap` + `student_diy/roadmap` ✅ done 2026-07-21

`tsc --noEmit` clean · `eslint` 0 errors on all 10 touched files · `npm run build` exit 0
· all 4 regression guards still 0.

Structural pass only — these sit behind OAuth and were not screenshotted.

- [x] **De-duplicated the two lanes.** The page files were **365 of 370 lines identical**
      and the skeletons byte-identical. Extracted `lib/roadmap-data.ts`,
      `components/student/RoadmapView.tsx`, `RoadmapSkeleton.tsx`, `DeadlineBadge.tsx`.
      Each `page.tsx` is now 15 lines and each `loading.tsx` is 5.
- [x] **Removed the duplicated "Current Step".** Stage name, title and description
      rendered twice per view — page card *and* timeline active card — with the action
      only on the second. The action moved up into the page card (`Mark complete` +
      `Watch video`); the timeline's active row demoted to a normal row carrying a
      `Badge variant="info"` "Current step" chip. `RoadmapStep` lost its `onComplete` prop.
- [x] **Rebuilt the timeline skeleton** — was ~944px against a ~2,430px real timeline
      (**~1,500px jump**, ~4× the `*/work` bug). Now mirrors `RoadmapStep`'s box model
      row for row, which the demotion above made possible.
- [x] **Masthead onto the canonical recipe** — dropped the app's only `uppercase` `h1`
      carrying a positive 0.01em tracking. 24/24 mastheads now canonical. (The literal
      class name is not written out here on purpose — Tailwind v4 scans `docs/` and
      would re-emit it.)
- [x] **Extracted `DeadlineBadge`** — the page card and the timeline row both need it, and
      re-inlining it would have recreated the duplication being removed here.

**Deliberately not done**

- **Did not reorder the sections.** Current-step still sits *below* the 3 stage cards, so
  on mobile the action is ~700px down. Moving it directly under the hero would read
  better (where am I → what now → context → map) but that's a visible reorder on a screen
  neither of us can see. Cheap to do later.
- **Did not consolidate the 6 blue-glow shadows** or touch the locked-step contrast — both
  recorded in `05-style-guide.md` § Known Drift → Open.

**Found, not fixed**

- 🟡 **`metric-hero.md` contradicts `05-style-guide.md` on reveal motion.** The former says
  the hero card animates in with `riseIn`; the latter scopes `riseIn` to the two student
  *dashboards* and says not to upgrade surfaces piecemeal. The roadmap uses `fadeIn`
  throughout, which follows the style guide. Fix the section spec, not the code.
- 🟡 **The container-audit script now passes four routes vacuously** — see the warning
  added to `04-sections/states-and-feedback.md`.

### Remaining

- [ ] `coach/` dashboard — at-risk surfacing, roster
- [ ] `coach/students` + `[studentId]` detail tabs
- [ ] `coach/reports` — three distinct empty states
- [ ] `owner/` dashboard + `coaches` + `students`
- [ ] `(auth)/*` — login, register, register/[code], no-access

---

## Phase 4 — Polish

- [ ] 🟡 **Stagger audit.** `animate-riseIn` + `animationDelay` is applied ad hoc.
      Standardise the increment (~100ms) and cap total sequence length so a slow
      connection doesn't leave content invisible.
- [ ] 🟢 Hover/active/focus states on every interactive element, verified at 390px.
- [ ] 🟢 Confetti audit — confirm it only fires on genuine milestones, never routine
      session completion (brand personality rules out gamified hype).
- [ ] 🟢 Chart styling pass — recharts is the main raw-hex escape hatch; make sure the
      hardcoded values match the `ima-*` tokens they're standing in for.
- [ ] 🟢 Responsive pass at 320 / 390 / 768 / 1024 / 1440.

---

## Phase 5 — Verification & ship

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run lint` clean
- [ ] Re-run every command in `05-style-guide.md` § Verification and update the
      occurrence counts in that document
- [ ] Screenshot the auth pages (the only ones reachable without OAuth):
      ```bash
      chromium --headless=new --no-sandbox --disable-gpu \
        --virtual-time-budget=9000 --window-size=390,1100 \
        --screenshot=/root/ima-coaching/.uishot.png "http://localhost:3001/login"
      ```
      Authed screens need user-supplied screenshots or a temporary test session.
- [ ] Deploy per the `CLAUDE.md` runbook — snapshot `.next`, build, `pm2 restart
      ima-coaching`, verify `/login` → 200 and `/student` `/coach` `/owner` → 307

---

## Standing rules

1. **Update `05-style-guide.md` in the same commit** as any decision that departs
   from it. The last contract went stale and then got deleted; don't repeat that.
2. **One surface per session.** Cleaner context, cheaper, better output.
3. **Commit per surface** — `style(student): …` — so a bad iteration reverts cleanly.
4. **Never normalize the 6/10/14/18px spacing** to a 4/8/16/24 scale without an
   explicit ask. It is intentional and spans ~200 files including skeletons.
