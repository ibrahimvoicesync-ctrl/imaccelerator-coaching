import { CalendarDays, CalendarRange, CalendarClock, Infinity as InfinityIcon, type LucideIcon } from "lucide-react";
import type { OwnerHoursTotals } from "@/lib/rpc/owner-analytics-types";

/**
 * Platform-wide total hours logged (self-reported daily_reports.hours_worked)
 * across four windows. Read-only KPI tiles — styled after
 * coach/analytics/KPIGrid.tsx. All four windows are pre-computed by the RPC, so
 * we render all tiles at once (no toggle).
 */

function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const display = Number.isInteger(rounded)
    ? rounded.toLocaleString("en-US")
    : rounded.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${display}h`;
}

type Tile = {
  key: keyof OwnerHoursTotals;
  label: string;
  icon: LucideIcon;
};

const TILES: Tile[] = [
  { key: "weekly", label: "This Week", icon: CalendarDays },
  { key: "monthly", label: "This Month", icon: CalendarRange },
  { key: "ninety", label: "90 Days", icon: CalendarClock },
  { key: "alltime", label: "All Time", icon: InfinityIcon },
];

export function PlatformHoursPanel({ hours }: { hours: OwnerHoursTotals }) {
  return (
    <section aria-labelledby="platform-hours-label">
      <p
        id="platform-hours-label"
        className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
      >
        Total Hours Logged
      </p>

      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-[14px]">
        {TILES.map(({ key, label, icon: Icon }) => {
          const value = formatHours(hours[key]);
          return (
            <div
              key={key}
              className="flex items-start gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px] shadow-card"
            >
              <div className="w-9 h-9 rounded-[8px] bg-ima-surface-accent flex items-center justify-center shrink-0">
                <Icon className="h-[18px] w-[18px] text-ima-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p
                  className="text-[24px] md:text-[28px] font-semibold leading-none tabular-nums tracking-tight text-ima-text"
                  aria-label={`${label}: ${value}`}
                >
                  {value}
                </p>
                <p className="mt-[8px] text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
                  {label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
