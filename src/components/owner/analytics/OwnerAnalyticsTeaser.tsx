/**
 * Phase 54 → Phase 64: Owner homepage analytics teaser (server component).
 *
 * Renders a single "Top Performers" card with three compact top-1 rows
 * (hours, profit, deals) and a "View full analytics →" link to
 * /owner/analytics.
 *
 * Phase 64: Reads the "alltime" slice of the new 24-slot RPC payload to
 * preserve Phase 54 teaser semantics (student-only, lifetime top-1). The
 * teaser does NOT show coach leaderboards or windowed totals — those live
 * only on /owner/analytics per OA-01.
 *
 * Shares the getOwnerAnalyticsCached() call with the full /owner/analytics
 * page. Both surfaces use the identical cache key ["owner-analytics-v2"], so
 * within the 60s TTL only ONE Postgres RPC fires regardless of how many
 * surfaces render the data.
 *
 * Visual shell: editorial-restrained "coach chrome" (bg-white, #EDE9E0
 * border, rounded-[14px], mono eyebrow treatment) — matches /owner dashboard.
 *
 * Empty state: when no leaderboard has a #1 entry, render a reassuring
 * compact EmptyState inside the same card instead of three empty rows.
 */

import Link from "next/link";
import { Clock, DollarSign, TrendingUp, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { getOwnerAnalyticsCached } from "@/lib/rpc/owner-analytics";

export async function OwnerAnalyticsTeaser() {
  const payload = await getOwnerAnalyticsCached();

  // Only show the #1 entry per lifetime leaderboard — the teaser is
  // deliberately compact and student-only (OA-01 guardrail).
  const topHours = payload.leaderboards.students.hours.alltime[0];
  const topProfit = payload.leaderboards.students.profit.alltime[0];
  const topDeals = payload.leaderboards.students.deals.alltime[0];

  const hasAnyTop = Boolean(topHours || topProfit || topDeals);

  return (
    <div
      className="bg-white border border-ima-border rounded-[14px] p-6"
      aria-labelledby="owner-analytics-teaser-h2"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="owner-analytics-teaser-h2"
            className="text-[15px] font-semibold text-ima-text leading-tight"
          >
            Top Performers
          </h2>
          <p className="mt-1 text-[12px] text-ima-text-secondary">
            Top student in each category (lifetime)
          </p>
        </div>
        <Link
          href="/owner/analytics"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-ima-primary hover:text-ima-primary-hover min-h-[44px] shrink-0 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md px-1"
          aria-label="View full owner analytics"
        >
          View full analytics
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>
      <div className="h-px bg-ima-surface-light mt-4" aria-hidden="true" />

      {!hasAnyTop ? (
        <div className="mt-4">
          <EmptyState
            variant="compact"
            title="No activity yet"
            description="Top performers will appear once students start logging hours and deals."
          />
        </div>
      ) : (
        <ul className="mt-1" role="list">
          <TeaserRow
            icon={<Clock className="h-[14px] w-[14px]" aria-hidden="true" />}
            label="Hours"
            row={topHours}
            iconBg="bg-ima-surface-accent"
            iconColor="text-ima-primary"
            isLast={false}
          />
          <TeaserRow
            icon={<DollarSign className="h-[14px] w-[14px]" aria-hidden="true" />}
            label="Profit"
            row={topProfit}
            iconBg="bg-ima-success/10"
            iconColor="text-ima-success"
            isLast={false}
          />
          <TeaserRow
            icon={<TrendingUp className="h-[14px] w-[14px]" aria-hidden="true" />}
            label="Deals"
            row={topDeals}
            iconBg="bg-ima-warning/10"
            iconColor="text-ima-warning"
            isLast={true}
          />
        </ul>
      )}
    </div>
  );
}

type TeaserRowInput = {
  student_id: string;
  student_name: string;
  metric_display: string;
};

function TeaserRow({
  icon,
  label,
  row,
  iconBg,
  iconColor,
  isLast,
}: {
  icon: React.ReactNode;
  label: string;
  row: TeaserRowInput | undefined;
  iconBg: string;
  iconColor: string;
  isLast: boolean;
}) {
  const borderCls = isLast ? "" : "border-b border-ima-surface-light";

  if (!row) {
    return (
      <li className={borderCls}>
        <div className="flex items-center gap-3 py-3 min-h-[52px] -mx-2 px-2">
          <span
            className={`w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
          >
            {icon}
          </span>
          <span
            className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary w-14 shrink-0"
          >
            {label}
          </span>
          <span className="text-[13px] italic text-ima-text-secondary flex-1">
            No data yet
          </span>
        </div>
      </li>
    );
  }

  return (
    <li className={borderCls}>
      <Link
        href={`/owner/students/${row.student_id}`}
        aria-label={`${label}: #1 ${row.student_name} — ${row.metric_display}`}
        className="flex items-center gap-3 py-3 min-h-[52px] -mx-2 px-2 rounded-md motion-safe:transition-colors hover:bg-ima-bg focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
      >
        <span
          className={`w-8 h-8 rounded-[8px] flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}
        >
          {icon}
        </span>
        <span
          className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary w-14 shrink-0"
        >
          {label}
        </span>
        <span
          className="inline-flex items-center px-[7px] py-[3px] rounded-[6px] bg-ima-primary text-white text-[10px] font-semibold tabular-nums shrink-0"
        >
          #1
        </span>
        <span className="flex-1 text-[14px] font-semibold tracking-[-0.005em] text-ima-text truncate leading-tight">
          {row.student_name}
        </span>
        <span
          className="text-[13px] font-semibold text-ima-text tabular-nums slashed-zero shrink-0"
        >
          {row.metric_display}
        </span>
      </Link>
    </li>
  );
}
