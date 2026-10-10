# IMA Accelerator — Design Contract

The seven context artifacts that govern how this product looks and behaves. Adapted
from the premium-SaaS-design framework for a **members-only dashboard**, not a
marketing site.

## The loop

```
DEFINE → BUILD → REVIEW → REFINE
   ↑                        │
   └────────────────────────┘
```

These docs are the DEFINE step. They are **descriptive first, prescriptive second**:
every value in the style guide was measured out of the codebase on 2026-07-21, not
invented. Where the code and the old written rules disagreed, the drift is recorded
explicitly rather than silently resolved — see `07-tasks.md` Phase 0.

## The artifacts

| # | Artifact | File | Purpose |
|---|----------|------|---------|
| 1 | Project brief | `01-project-brief.md` | What we're building, for whom, why |
| 2 | Content | `02-content/` | Real copy per surface, one file per role |
| 3 | General vibe | `03-general-vibe.md` | Overall aesthetic, references, anti-references |
| 4 | Section specs | `04-sections/` | Granular per-pattern build specs |
| 5 | Style guide | `05-style-guide.md` | **Single source of truth** — measured tokens |
| 6 | PRD | `06-prd.md` | Tech stack, structure, perf, a11y budgets |
| 7 | Tasks | `07-tasks.md` | Phased execution plan |

## Provenance

`01`, `03`, and parts of `05` are seeded from two documents that existed and were
**deleted in an uncommitted working-tree change** on `chore/simplify-nav-referral-pill`:

- `PRODUCT.md` — recover with `git show HEAD:PRODUCT.md`
- The "Design Context" section of `CLAUDE.md` — recover with `git show HEAD:CLAUDE.md`

Nothing here was invented from scratch where a prior decision existed. Where the prior
decision has since been overruled *by the code*, the code wins and the change is noted.

## Rules of engagement

1. **The style guide is living.** Make a design decision that departs from
   `05-style-guide.md`, and update `05-style-guide.md` in the same commit.
2. **Measure before you assert.** These docs drifted from reality once already. Run
   the audit commands in `05-style-guide.md` § Verification before trusting a number.
3. **One surface per session.** Section isolation keeps context clean and cheap.
4. **Commit per section**, so a bad iteration is one `git revert` away.
