import { Flame } from "lucide-react";
import type { StreakInfo } from "@/lib/streak";


const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

interface StreakCardProps {
  info: StreakInfo;
  className?: string;
}

/**
 * Calm, understated daily-consistency streak — a reason to return without the
 * gamified hype the brand avoids. Rendered as a solid `ima-primary` card so it
 * carries weight on the dashboard and balances the large blue hero metric on
 * the left. White is the foreground; the dot strip reads as "don't break the
 * chain" at a glance.
 */
export function StreakCard({ info, className = "" }: StreakCardProps) {
  const { current, longest, activeToday, week } = info;
  const hasStreak = current > 0;

  const headline = !hasStreak
    ? "Start your streak today"
    : activeToday
    ? "Logged today — keep it alive"
    : "One session keeps it going";

  return (
    <section
      aria-label="Work consistency streak"
      className={`relative overflow-hidden bg-ima-primary rounded-[14px] shadow-card p-6 md:p-8 text-white ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.08em] text-white/80 uppercase">
          <Flame className="h-3.5 w-3.5 text-white" aria-hidden="true" />
          Consistency
        </p>
        {longest > 0 && (
          <span className="text-[10px] font-semibold tracking-[0.08em] text-white/70 uppercase tabular-nums">
            Best {longest}d
          </span>
        )}
      </div>

      <div className="mt-5 flex items-end gap-2">
        <span
          className={`text-[44px] md:text-[52px] font-semibold tabular-nums tracking-[-0.02em] leading-none ${
            hasStreak ? "text-white" : "text-white/55"
          }`}
        >
          {current}
        </span>
        <span className="pb-[6px] text-[15px] font-medium text-white/75">
          {current === 1 ? "day" : "days"}
        </span>
      </div>

      <p className="mt-3 text-[13px] text-white/80 leading-snug">{headline}</p>

      {/* Week dot strip — oldest → newest */}
      <div className="mt-6 flex items-center justify-between max-w-[280px]">
        {week.map((d) => {
          const letter = WEEKDAY_LETTERS[new Date(d.date + "T00:00:00Z").getUTCDay()];
          const dotClass = d.active
            ? "bg-white"
            : d.isToday
            ? "bg-transparent border-2 border-white/70"
            : "bg-white/20";
          return (
            <div key={d.date} className="flex flex-col items-center gap-2">
              <span
                className={`h-[14px] w-[14px] rounded-full ${dotClass}`}
                aria-hidden="true"
              />
              <span
                className={`text-[9px] font-semibold uppercase tracking-[0.08em] tabular-nums ${
                  d.isToday ? "text-white" : "text-white/55"
                }`}
              >
                {letter}
              </span>
              <span className="sr-only">
                {d.date}: {d.active ? "session logged" : "no session"}
                {d.isToday ? " (today)" : ""}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
