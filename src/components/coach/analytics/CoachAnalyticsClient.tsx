"use client";

/**
 * Phase 48: Orchestrator client component for /coach/analytics.
 *
 * Receives a fully resolved RPC payload + the URL params that produced it.
 * Mutates URL via useRouter on every sort/search/page change — URL is the
 * single source of truth (back/forward navigation just works).
 */

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  CoachAnalyticsPayload,
  CoachAnalyticsSort,
} from "@/lib/rpc/coach-analytics-types";
import type { CoachAnalyticsSearchParams } from "@/lib/schemas/coach-analytics-params";
import { ActiveInactiveChip } from "./ActiveInactiveChip";
import { ExportCsvButton } from "./ExportCsvButton";
import { KPIGrid } from "./KPIGrid";
import { LeaderboardCard, type LeaderboardRow } from "@/components/analytics/LeaderboardCard";
import { DealsTrendChart } from "./DealsTrendChart";
import { StudentListTable } from "./StudentListTable";

const integerFormatter = new Intl.NumberFormat("en-US");

function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatWeekStartLabel(today: Date): string {
  const day = today.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // ISO week starts Monday. If today is Sunday (0), Monday is -6 days back.
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setUTCDate(today.getUTCDate() + diff);
  return monday.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type Props = {
  payload: CoachAnalyticsPayload;
  initialParams: CoachAnalyticsSearchParams;
};

export function CoachAnalyticsClient({ payload, initialParams }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const buildUrl = useCallback(
    (overrides: Partial<CoachAnalyticsSearchParams>) => {
      const next = { ...initialParams, ...overrides };
      const params = new URLSearchParams();
      if (next.sort !== "name_asc") params.set("sort", next.sort);
      if (next.search) params.set("search", next.search);
      if (next.page !== 1) params.set("page", String(next.page));
      const qs = params.toString();
      return qs ? `/coach/analytics?${qs}` : "/coach/analytics";
    },
    [initialParams],
  );

  const handleSortChange = useCallback(
    (next: CoachAnalyticsSort) => {
      startTransition(() => {
        router.push(buildUrl({ sort: next, page: 1 }));
      });
    },
    [buildUrl, router],
  );

  const handleSearchChange = useCallback(
    (next: string) => {
      startTransition(() => {
        router.push(buildUrl({ search: next, page: 1 }));
      });
    },
    [buildUrl, router],
  );

  const weekStartLabel = formatWeekStartLabel(new Date());

  const hoursRows: LeaderboardRow[] = payload.leaderboards.hours_week.map(
    (r) => ({
      rank: r.rank,
      student_id: r.student_id,
      student_name: r.student_name,
      metric_display: formatHoursMinutes(r.minutes),
    }),
  );

  const emailsRows: LeaderboardRow[] = payload.leaderboards.emails_week.map(
    (r) => ({
      rank: r.rank,
      student_id: r.student_id,
      student_name: r.student_name,
      metric_display: integerFormatter.format(r.emails),
    }),
  );

  const dealsRows: LeaderboardRow[] = payload.leaderboards.deals_alltime.map(
    (r) => ({
      rank: r.rank,
      student_id: r.student_id,
      student_name: r.student_name,
      metric_display: `${integerFormatter.format(r.deals)} ${r.deals === 1 ? "deal" : "deals"}`,
    }),
  );

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4 motion-safe:animate-fadeIn">
        <div>
          <p
            className="text-xs font-semibold tracking-[0.2em] text-ima-text-secondary uppercase"
          >
            Analytics
          </p>
          <h1
            id="coach-analytics-h1"
            className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight"
          >
            Coach Analytics
          </h1>
          <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
            Aggregate stats across your assigned students.
          </p>
          <div className="mt-4">
            <ActiveInactiveChip
              activeCount={payload.active_inactive.active}
              inactiveCount={payload.active_inactive.inactive}
            />
          </div>
        </div>
        <ExportCsvButton
          sort={initialParams.sort}
          search={initialParams.search}
        />
      </header>

      <div
        className="motion-safe:animate-fadeIn"
        style={{ animationDelay: "50ms" }}
      >
        <KPIGrid stats={payload.stats} />
      </div>

      <div
        className="grid grid-cols-1 lg:grid-cols-3 gap-[14px] mt-8 motion-safe:animate-fadeIn"
        style={{ animationDelay: "100ms" }}
      >
        <LeaderboardCard
          headingId="leaderboard-hours-heading"
          heading="Top 5 — Hours This Week"
          subheading={`Since Monday ${weekStartLabel}`}
          rows={hoursRows}
          emptyHeading="No hours logged this week"
          emptyBody="Once your students start work sessions, the weekly leaderboard will appear here."
        />
        <LeaderboardCard
          headingId="leaderboard-emails-heading"
          heading="Top 5 — Emails This Week"
          subheading={`Since Monday ${weekStartLabel}`}
          rows={emailsRows}
          emptyHeading="No emails logged this week"
          emptyBody="Reports submitted this week will populate this leaderboard."
        />
        <LeaderboardCard
          headingId="leaderboard-deals-heading"
          heading="Top 5 — All-Time Deals"
          subheading="Lifetime closed-deal count"
          rows={dealsRows}
          emptyHeading="No deals closed yet"
          emptyBody="Closed deals will appear here as your students log them."
        />
      </div>

      <div
        className="mt-8 motion-safe:animate-fadeIn"
        style={{ animationDelay: "150ms" }}
      >
        <DealsTrendChart buckets={payload.deals_trend} />
      </div>

      <div
        className="mt-8 motion-safe:animate-fadeIn"
        style={{ animationDelay: "200ms" }}
      >
        <StudentListTable
          rows={payload.students}
          pagination={payload.pagination}
          sort={initialParams.sort}
          search={initialParams.search}
          onSortChange={handleSortChange}
          onSearchChange={handleSearchChange}
        />
      </div>
    </>
  );
}
