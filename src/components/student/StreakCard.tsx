import type { StreakInfo } from "@/lib/streak";


const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

interface StreakCardProps {
  info: StreakInfo;
  className?: string;
}

/**
 * Calm, understated daily-consistency streak — a reason to return without the
 * gamified hype the brand avoids. Blue is the signal; the dot strip reads as
 * "don't break the chain" at a glance.
 */
export function StreakCard({ info, className = "" }: StreakCardProps) {
  const { current, longest, activeToday, week } = info;
  const hasStreak = current > 0;

  const headline = !hasStreak
    ? "Start your streak"
    : activeToday
    ? "Logged today — keep it going"
    : "Keep your streak alive today";

  return (
    <section
      aria-label="Work consistency streak"
      className={`bg-white border border-ima-border rounded-[14px] p-6 md:p-8 ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p
          className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
        >
          Consistency
        </p>
        {longest > 0 && (
          <span
            className="text-[10px] font-semibold tracking-[0.14em] text-ima-text-secondary uppercase tabular-nums"
          >
            Best {longest}d
          </span>
        )}
      </div>

      <div className="mt-5 flex items-end gap-2">
        <span
          className={`text-[44px] md:text-[52px] font-bold tabular-nums tracking-[-0.02em] leading-none ${
            hasStreak ? "text-ima-primary" : "text-ima-border"
          }`}
        >
          {current}
        </span>
        <span className="pb-[6px] text-[15px] font-medium text-ima-text-secondary">
          {current === 1 ? "day" : "days"}
        </span>
      </div>

      <p className="mt-3 text-[13px] text-ima-text-secondary leading-snug">{headline}</p>

      {/* Week dot strip — oldest → newest */}
      <div className="mt-5 flex items-center justify-between max-w-[280px]">
        {week.map((d) => {
          const letter = WEEKDAY_LETTERS[new Date(d.date + "T00:00:00Z").getUTCDay()];
          const dotClass = d.active
            ? d.isToday
              ? "bg-ima-success"
              : "bg-ima-primary"
            : d.isToday
            ? "bg-white border-2 border-ima-primary"
            : "bg-ima-surface-light";
          return (
            <div key={d.date} className="flex flex-col items-center gap-2">
              <span
                className={`h-[14px] w-[14px] rounded-full ${dotClass}`}
                aria-hidden="true"
              />
              <span
                className={`text-[9px] font-semibold uppercase tracking-[0.08em] tabular-nums ${
                  d.isToday ? "text-ima-primary" : "text-ima-text-muted"
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
