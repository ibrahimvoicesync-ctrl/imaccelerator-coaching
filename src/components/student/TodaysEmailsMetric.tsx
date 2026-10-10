"use client";

import { useCountUp } from "@/lib/hooks/useCountUp";
import { cn } from "@/lib/utils";
import { KPI_TARGETS } from "@/lib/config";
import { EMAIL_SERIES_COLORS, type EmailCounts } from "@/lib/emails";

/**
 * Today's emails sent against the daily outreach goal — same count-up +
 * lockstep progress bar as TodaysWorkMetric, plus the brand / influencer
 * split keyed to the weekly chart's line colors.
 */
export function TodaysEmailsMetric({ counts }: { counts: EmailCounts }) {
  const goal = KPI_TARGETS.dailyOutreach;
  const goalMet = counts.total >= goal;
  const targetPct = goal > 0 ? Math.min(100, Math.round((counts.total / goal) * 100)) : 0;

  const progress = useCountUp(counts.total <= 0);
  const shown = Math.round(counts.total * progress);
  const pct = targetPct * progress;
  const unsplit = counts.total - counts.brands - counts.influencers;

  return (
    <>
      <div className="mt-6 flex items-end gap-3 flex-wrap">
        <span
          className={cn(
            "text-6xl md:text-7xl font-semibold tabular-nums tracking-tight leading-[0.95]",
            goalMet ? "text-ima-success" : "text-ima-primary",
          )}
          aria-label={`${counts.total} emails sent`}
        >
          {shown}
        </span>
        <span className="pb-2 text-[15px] font-medium text-ima-text-secondary tabular-nums">
          / {goal} emails
        </span>
      </div>

      <div
        className="mt-5 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
        role="progressbar"
        aria-valuenow={counts.total}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-label={`Daily emails progress: ${counts.total} of ${goal}`}
      >
        {/* rAF-driven like TodaysWorkMetric — no CSS transition on purpose. */}
        <div
          className={cn("h-full rounded-full", goalMet ? "bg-ima-success" : "bg-ima-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>

      <dl className="mt-[14px] flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[12px] text-ima-text-secondary">
        <div className="inline-flex items-center gap-1.5">
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{ backgroundColor: EMAIL_SERIES_COLORS.brands }}
            aria-hidden="true"
          />
          <dt>Brands</dt>
          <dd className="font-semibold tabular-nums text-ima-text">{counts.brands}</dd>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span
            className="h-[6px] w-[6px] rounded-full"
            style={{ backgroundColor: EMAIL_SERIES_COLORS.influencers }}
            aria-hidden="true"
          />
          <dt>Influencers</dt>
          <dd className="font-semibold tabular-nums text-ima-text">{counts.influencers}</dd>
        </div>
        {unsplit > 0 && (
          <div className="inline-flex items-center gap-1.5">
            <dt>Unsplit</dt>
            <dd className="font-semibold tabular-nums text-ima-text">{unsplit}</dd>
          </div>
        )}
      </dl>
    </>
  );
}
