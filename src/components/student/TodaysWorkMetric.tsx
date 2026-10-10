"use client";

import { useCountUp } from "@/lib/hooks/useCountUp";
import { cn, formatHoursMinutes } from "@/lib/utils";
import { WORK_TRACKER } from "@/lib/config";

/**
 * Signature moment — the daily hours metric counts up from zero while the
 * progress bar fills in lockstep, both on an expo-out curve. Animation plays
 * once on mount and is skipped for users who prefer reduced motion. The true
 * value is always exposed via aria so assistive tech never sees the count-up.
 */
export function TodaysWorkMetric({
  totalMinutes,
  goalMet,
}: {
  totalMinutes: number;
  goalMet: boolean;
}) {
  const dailyGoalMinutes = WORK_TRACKER.dailyGoalHours * 60;
  const targetPct =
    dailyGoalMinutes > 0
      ? Math.min(100, Math.round((totalMinutes / dailyGoalMinutes) * 100))
      : 0;

  const progress = useCountUp(totalMinutes <= 0);
  const minutes = Math.round(totalMinutes * progress);
  const pct = targetPct * progress;

  return (
    <>
      <div className="mt-6 flex items-end gap-3 flex-wrap">
        <span
          className={cn(
            "text-6xl md:text-7xl font-semibold tabular-nums tracking-tight leading-[0.95]",
            goalMet ? "text-ima-success" : "text-ima-primary",
          )}
          aria-label={formatHoursMinutes(totalMinutes)}
        >
          {formatHoursMinutes(minutes)}
        </span>
        <span className="pb-2 text-[15px] font-medium text-ima-text-secondary tabular-nums">
          / {WORK_TRACKER.dailyGoalHours}h
        </span>
      </div>

      <div
        className="mt-5 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
        role="progressbar"
        aria-valuenow={totalMinutes}
        aria-valuemin={0}
        aria-valuemax={dailyGoalMinutes}
        aria-label={`Daily hours progress: ${formatHoursMinutes(totalMinutes)} of ${WORK_TRACKER.dailyGoalHours}h`}
      >
        {/* No CSS transition here — the rAF loop above already drives `pct`
            frame-by-frame on an expo-out curve. A transition would chase a
            value that changes every frame, lagging the count-up and easing
            the motion twice. */}
        <div
          className={cn(
            "h-full rounded-full",
            goalMet ? "bg-ima-success" : "bg-ima-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </>
  );
}
