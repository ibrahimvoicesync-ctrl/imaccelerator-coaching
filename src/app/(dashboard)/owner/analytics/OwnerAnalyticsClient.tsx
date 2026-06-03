/**
 * Phase 64: Owner Analytics client — six independent window toggles, zero
 * client re-fetch.
 *
 * The server page fetches the full 24-slot payload once (see page.tsx) and
 * hands it to this component. State here is six useState hooks (one per
 * leaderboard), each holding the currently displayed window. Toggling a
 * window pill calls setState, React re-renders from the already-delivered
 * payload — no fetch(), no useEffect, no network round-trip.
 *
 * Default window per leaderboard = "monthly".
 *
 * Layout: two sections. Students first (3 cards) then Coaches (3 cards).
 * Student rows link to /owner/students/[id]; coach rows link to
 * /owner/coaches/[id].
 *
 * Window pills follow the coach editorial chrome: a min-h-[44px] pill
 * toolbar per card (bg-ima-primary active / bg-white ima-border idle)
 * instead of the shared SegmentedControl primitive — presentation-only
 * swap so the page matches the owner chrome refactor.
 */

"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  LeaderboardCard,
  type LeaderboardRow,
} from "@/components/analytics/LeaderboardCard";
import { cn } from "@/lib/utils";
import type {
  OwnerAnalyticsPayload,
  OwnerAnalyticsWindow,
} from "@/lib/rpc/owner-analytics-types";

const WINDOW_OPTIONS: { value: OwnerAnalyticsWindow; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "alltime", label: "All Time" },
];

function mapStudentRows(
  rows: {
    rank: number;
    student_id: string;
    student_name: string;
    metric_display: string;
  }[],
): LeaderboardRow[] {
  return rows.map((r) => ({
    rank: r.rank,
    student_id: r.student_id,
    student_name: r.student_name,
    metric_display: r.metric_display,
  }));
}

function mapCoachRows(
  rows: {
    rank: number;
    coach_id: string;
    coach_name: string;
    metric_display: string;
  }[],
): LeaderboardRow[] {
  // LeaderboardRow has historical student_* field names — coach id/name pass
  // through those fields. See LeaderboardRow JSDoc in LeaderboardCard.tsx.
  return rows.map((r) => ({
    rank: r.rank,
    student_id: r.coach_id,
    student_name: r.coach_name,
    metric_display: r.metric_display,
  }));
}

interface Props {
  payload: OwnerAnalyticsPayload;
}

export function OwnerAnalyticsClient({ payload }: Props) {
  // Six independent window states — one per leaderboard. Default "monthly".
  const [studentHoursWin, setStudentHoursWin] =
    useState<OwnerAnalyticsWindow>("monthly");
  const [studentProfitWin, setStudentProfitWin] =
    useState<OwnerAnalyticsWindow>("monthly");
  const [studentDealsWin, setStudentDealsWin] =
    useState<OwnerAnalyticsWindow>("monthly");
  const [coachRevenueWin, setCoachRevenueWin] =
    useState<OwnerAnalyticsWindow>("monthly");
  const [coachOutreachWin, setCoachOutreachWin] =
    useState<OwnerAnalyticsWindow>("monthly");
  const [coachDealsWin, setCoachDealsWin] =
    useState<OwnerAnalyticsWindow>("monthly");

  const studentHours = mapStudentRows(
    payload.leaderboards.students.hours[studentHoursWin],
  );
  const studentProfit = mapStudentRows(
    payload.leaderboards.students.profit[studentProfitWin],
  );
  const studentDeals = mapStudentRows(
    payload.leaderboards.students.deals[studentDealsWin],
  );
  const coachRevenue = mapCoachRows(
    payload.leaderboards.coaches.revenue[coachRevenueWin],
  );
  const coachOutreach = mapCoachRows(
    payload.leaderboards.coaches.avg_total_outreach[coachOutreachWin],
  );
  const coachDeals = mapCoachRows(
    payload.leaderboards.coaches.deals[coachDealsWin],
  );

  // Global empty state — if no window in any leaderboard has any data, show a
  // single reassuring card instead of six empty leaderboards.
  const anyStudentData = Object.values(payload.leaderboards.students).some(
    (metric) =>
      Object.values(metric).some((arr) => (arr as unknown[]).length > 0),
  );
  const anyCoachData = Object.values(payload.leaderboards.coaches).some(
    (metric) =>
      Object.values(metric).some((arr) => (arr as unknown[]).length > 0),
  );
  const anyData = anyStudentData || anyCoachData;

  if (!anyData) {
    return (
      <div
        className="mt-10 bg-white border border-ima-border rounded-[14px] p-6 motion-safe:animate-fadeIn"
        style={{ animationDelay: "100ms" }}
      >
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" aria-hidden="true" />}
          title="No activity yet"
          description="Leaderboards will appear once students log hours, close deals, or earn profit."
        />
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-10">
      {/* Students section */}
      <section
        aria-labelledby="owner-lb-students-h2"
        className="motion-safe:animate-fadeIn"
        style={{ animationDelay: "50ms" }}
      >
        <h2
          id="owner-lb-students-h2"
          className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
        >
          Students
        </h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-[14px]">
          <LeaderboardWithToggle
            headingId="owner-lb-hours"
            heading="Top 3 Students by Hours Worked"
            subheading="Completed work sessions"
            rows={studentHours}
            value={studentHoursWin}
            onChange={setStudentHoursWin}
            controlLabel="Hours time range"
            emptyHeading="No hours logged yet"
            emptyBody="Students appear here once they complete a work session."
            hrefPrefix="/owner/students/"
          />
          <LeaderboardWithToggle
            headingId="owner-lb-profit"
            heading="Top 3 Students by Profit Earned"
            subheading="All closed deals"
            rows={studentProfit}
            value={studentProfitWin}
            onChange={setStudentProfitWin}
            controlLabel="Profit time range"
            emptyHeading="No profit recorded yet"
            emptyBody="Students appear here once they log a deal with profit."
            hrefPrefix="/owner/students/"
          />
          <LeaderboardWithToggle
            headingId="owner-lb-deals"
            heading="Top 3 Students by Deals Closed"
            subheading="Count of closed deals"
            rows={studentDeals}
            value={studentDealsWin}
            onChange={setStudentDealsWin}
            controlLabel="Deals time range"
            emptyHeading="No deals closed yet"
            emptyBody="Students appear here once they log a deal."
            hrefPrefix="/owner/students/"
          />
        </div>
      </section>

      {/* Coaches section */}
      <section
        aria-labelledby="owner-lb-coaches-h2"
        className="motion-safe:animate-fadeIn"
        style={{ animationDelay: "100ms" }}
      >
        <h2
          id="owner-lb-coaches-h2"
          className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
        >
          Coaches
        </h2>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-[14px]">
          <LeaderboardWithToggle
            headingId="owner-lb-coach-revenue"
            heading="Top 3 Coaches by Revenue"
            subheading="Sum of deal profit from assigned students"
            rows={coachRevenue}
            value={coachRevenueWin}
            onChange={setCoachRevenueWin}
            controlLabel="Coach revenue time range"
            emptyHeading="No coach revenue yet"
            emptyBody="Coaches appear here once their assigned students close deals."
            hrefPrefix="/owner/coaches/"
          />
          <LeaderboardWithToggle
            headingId="owner-lb-coach-outreach"
            heading="Top 3 Coaches by Avg Outreach"
            subheading="Brands + influencers per student per day"
            rows={coachOutreach}
            value={coachOutreachWin}
            onChange={setCoachOutreachWin}
            controlLabel="Coach outreach time range"
            emptyHeading="No outreach data yet"
            emptyBody="Coaches appear here once their assigned students log reports."
            hrefPrefix="/owner/coaches/"
          />
          <LeaderboardWithToggle
            headingId="owner-lb-coach-deals"
            heading="Top 3 Coaches by Deals"
            subheading="Total deals across assigned students"
            rows={coachDeals}
            value={coachDealsWin}
            onChange={setCoachDealsWin}
            controlLabel="Coach deals time range"
            emptyHeading="No coach deals yet"
            emptyBody="Coaches appear here once their assigned students close deals."
            hrefPrefix="/owner/coaches/"
          />
        </div>
      </section>
    </div>
  );
}

interface LeaderboardWithToggleProps {
  headingId: string;
  heading: string;
  subheading: string;
  rows: LeaderboardRow[];
  value: OwnerAnalyticsWindow;
  onChange: (v: OwnerAnalyticsWindow) => void;
  controlLabel: string;
  emptyHeading: string;
  emptyBody: string;
  hrefPrefix?: string;
  linkRows?: boolean;
}

function LeaderboardWithToggle({
  headingId,
  heading,
  subheading,
  rows,
  value,
  onChange,
  controlLabel,
  emptyHeading,
  emptyBody,
  hrefPrefix,
  linkRows,
}: LeaderboardWithToggleProps) {
  return (
    <div className="space-y-3">
      <WindowPills value={value} onChange={onChange} ariaLabel={controlLabel} />
      <LeaderboardCard
        headingId={headingId}
        heading={heading}
        subheading={subheading}
        rows={rows}
        emptyHeading={emptyHeading}
        emptyBody={emptyBody}
        hrefPrefix={hrefPrefix}
        linkRows={linkRows}
      />
    </div>
  );
}

interface WindowPillsProps {
  value: OwnerAnalyticsWindow;
  onChange: (next: OwnerAnalyticsWindow) => void;
  ariaLabel: string;
}

function WindowPills({ value, onChange, ariaLabel }: WindowPillsProps) {
  return (
    <div
      className="flex gap-[6px] flex-wrap"
      role="tablist"
      aria-label={ariaLabel}
    >
      {WINDOW_OPTIONS.map(({ value: v, label }) => {
        const isActive = value === v;
        return (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(v)}
            className={cn(
              "min-h-[44px] px-[14px] rounded-[10px] text-[12px] font-medium motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
              isActive
                ? "bg-ima-primary text-white"
                : "bg-white border border-ima-border text-ima-text hover:border-ima-border",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
