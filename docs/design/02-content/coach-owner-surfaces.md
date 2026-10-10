# Content: Coach & Owner Surfaces

Management views. The reader is looking for **exceptions**, not totals — the design job
is to make the outlier findable, not to present a balanced report.

## Coach Dashboard — `/coach`

Roster-first. Thresholds from `COACH_CONFIG`:

| Signal | Threshold |
|---|---|
| At-risk (inactive) | 3+ days |
| At-risk (rating) | ≤ 2 |
| Max students/coach | 100 |
| Report inbox window | 7 days |
| Milestone | 6000 min (100 h) within 45 days of joining |

Observed copy: `Hours worked since Monday`.

> **Relative timestamps must measure against real wall-clock time**, not end-of-day —
> otherwise a report filed this morning reads as "14H AGO". Fixed in the current
> working tree; keep it that way. Format is uppercase compact: `2H AGO`.

Empty states:
- `Students will appear here once the owner assigns them to you.`
- `Once an owner assigns students to you, they'll appear here.`
- `Once your students start work sessions, the weekly leader will appear here.`

## Coach Students — `/coach/students`

Per-student detail tabs include Roadmap and Deals, each with their own stepped-down
hero metric (`text-5xl md:text-6xl`, one notch below the student-side hero because
coach views are comparative).

Empty:
- `This student hasn't submitted any reports.`
- `This student hasn't started their roadmap.`
- `This student hasn't recorded any deals yet. Use Add Deal to log one on their behalf.`
- Search: `Try a different name or clear the search.`

## Coach Reports — `/coach/reports`

Badge-driven: `unreviewed_reports` feeds the sidebar count.

- New: `Reports from your students will appear here as soon as they log their day.`
- Filtered: `Reports matching your filters will appear here.`
- Unassigned: `Reports will appear here once students are assigned to you.`

Three distinct empty states for three distinct causes — preserve that precision.

## Coach Analytics — `/coach/analytics`

- Empty: `Analytics will appear once students join your cohort.`
- Leaderboard empty: `Leaderboards will appear once students log hours, close deals, or
  earn profit.` / `Log some work and you'll get it started for the cohort.`
- `Top performers will appear once students start logging hours and deals.`

## Owner Dashboard — `/owner`

| Slot | Copy |
|---|---|
| Headline | `Assalamu3leikum, {firstName}!` |
| Lede | `Platform overview` |
| Loading | `Loading analytics teaser…` |

> This masthead omits the eyebrow and the blue rule and uses `mt-2` rather than `mt-3`.
> Normalize to the canonical masthead spec when next touching it.

Alert thresholds (`OWNER_CONFIG`): student inactive 3 d, dropoff 7 d, coach
underperforming rating < 2.5 over a 14-day window.

## Owner Coaches — `/owner/coaches`

- Empty: `Coaches will appear here once invited and registered.`
- Unassigned: `Assign students from the Assignments page.`

## Invites — `/owner/invites`, `/coach/invites`

Codes expire in **72 h** (`INVITE_CONFIG`). Who may invite whom:

| Role | Can invite |
|---|---|
| Owner | coach, student, student_diy |
| Coach | student, student_diy |
| Student / DIY | nobody |

Empty states vary by inviter scope — keep them distinct:
- `Generate an invite link above to share with coaches or students.` (owner)
- `Generate an invite link above to share with students.` (coach)
- `Generate an email invite above to get started.`

## Announcements

Destructive confirm: **`Delete this announcement?`** / `This cannot be undone. Students
who already saw it will no longer see it in their feed.`

## Resources

Action: `Add Resource`. Includes a `Discord Community` entry.

## Deals (coach view)

- `Once a student closes a deal, it'll show up here.`
