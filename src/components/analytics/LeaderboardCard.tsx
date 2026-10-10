/**
 * Phase 54 → Phase 64: Shared leaderboard card.
 *
 * Reused by /coach/analytics (Phase 48) and /owner/analytics (Phase 54, now
 * Phase 64) via the `hrefPrefix` prop. Relocated from
 * src/components/coach/analytics/LeaderboardCard.tsx per locked decision D-02.
 *
 * Phase 48 behavior preserved: rank-1 badge, avatar initials, 44px touch
 * target, focus-visible ring, ima-* tokens, EmptyState on zero rows.
 *
 * Phase 54 addition: `hrefPrefix` prop. Default "/coach/students/" preserves
 * the Phase 48 coach behavior. Owner passes "/owner/students/" for OA-06.
 *
 * Phase 64 addition: `linkRows?: boolean` prop (default true). When false,
 * rows render as a plain non-interactive `<div>` inside `<li>`. Retained
 * for callers that have no detail route to link to.
 */

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * NOTE: The `student_*` field names are historical (Phase 48 origin). Coach
 * rows pass coach id / coach name through `student_id` / `student_name` at
 * the call site (see OwnerAnalyticsClient in Phase 64). The shape stays
 * stable so existing callers are unaffected.
 */
export type LeaderboardRow = {
  rank: number;
  student_id: string;
  student_name: string;
  metric_display: string;
};

type LeaderboardCardProps = {
  heading: string;
  subheading: string;
  rows: LeaderboardRow[];
  emptyHeading: string;
  emptyBody: string;
  // Used to give the heading + aria-labelledby a stable unique id.
  headingId: string;
  // Optional prefix for the row link, e.g. "/owner/students/" — defaults to
  // "/coach/students/" to preserve Phase 48 call-sites without modification.
  // Include the trailing slash in the prefix; the component concatenates
  // `${hrefPrefix}${row.student_id}` without adding one.
  hrefPrefix?: string;
  // Phase 64: when false, render rows as non-interactive <div> inside <li>
  // (no <Link>). Default true; retained for callers that have no detail
  // route to link to.
  linkRows?: boolean;
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function LeaderboardCard({
  heading,
  subheading,
  rows,
  emptyHeading,
  emptyBody,
  headingId,
  hrefPrefix = "/coach/students/",
  linkRows = true,
}: LeaderboardCardProps) {
  const renderRowContent = (row: LeaderboardRow) => (
    <>
      {row.rank === 1 ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-ima-primary text-white text-xs font-semibold tabular-nums shrink-0">
          #1
        </span>
      ) : (
        <span className="text-xs font-semibold text-ima-text-secondary tabular-nums w-6 text-center shrink-0">
          #{row.rank}
        </span>
      )}
      <span
        aria-hidden="true"
        className="w-8 h-8 rounded-full bg-ima-primary flex items-center justify-center text-xs font-semibold text-white shrink-0"
      >
        {getInitials(row.student_name)}
      </span>
      <span className="flex-1 text-sm font-medium text-ima-text truncate">
        {row.student_name}
      </span>
      <span className="text-sm font-semibold text-ima-text tabular-nums shrink-0">
        {row.metric_display}
      </span>
    </>
  );

  return (
    <Card aria-labelledby={headingId}>
      <CardContent className="p-4">
        <div className="mb-4">
          <h2
            id={headingId}
            className="text-base font-semibold text-ima-text"
          >
            {heading}
          </h2>
          <p className="text-xs text-ima-text-secondary mt-1">{subheading}</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            variant="compact"
            title={emptyHeading}
            description={emptyBody}
          />
        ) : (
          <ul className="space-y-1">
            {rows.map((row) => (
              <li key={row.student_id}>
                {linkRows ? (
                  <Link
                    href={`${hrefPrefix}${row.student_id}`}
                    aria-label={`View ${row.student_name} — ${row.metric_display}`}
                    className="flex items-center gap-3 p-3 rounded-lg motion-safe:transition-colors hover:bg-ima-surface-light min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                  >
                    {renderRowContent(row)}
                  </Link>
                ) : (
                  <div
                    aria-label={`${row.student_name} — ${row.metric_display}`}
                    className="flex items-center gap-3 p-3 rounded-lg min-h-[44px]"
                  >
                    {renderRowContent(row)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
