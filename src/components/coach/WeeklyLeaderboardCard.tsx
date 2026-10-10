import Link from "next/link";
import { Trophy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CoachTopHoursRow } from "@/lib/rpc/coach-dashboard-types";

type Props = {
  rows: CoachTopHoursRow[];
};

function formatHoursLabel(minutes: number): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m}m`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WeeklyLeaderboardCard({ rows }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ima-text">Top 3 This Week</h2>
          <p className="text-xs text-ima-text-secondary">Hours worked since Monday</p>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={<Trophy className="h-5 w-5" aria-hidden="true" />}
            title="No hours logged this week"
            description="Once your students start work sessions, the weekly leader will appear here."
          />
        ) : (
          <ul className="space-y-1">
            {rows.map((r, i) => {
              const rank = i + 1;
              const hoursLabel = formatHoursLabel(r.minutes);
              return (
                <li key={r.student_id}>
                  <Link
                    href={`/coach/students/${r.student_id}`}
                    aria-label={`View ${r.student_name} — ${hoursLabel}`}
                    className="flex items-center gap-3 p-3 rounded-lg motion-safe:transition-colors hover:bg-ima-surface-light min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                  >
                    <div className="shrink-0 w-10 flex items-center justify-center">
                      {rank === 1 ? (
                        <span className="inline-flex items-center justify-center rounded-full bg-ima-primary text-white text-xs font-semibold px-2 py-0.5">
                          #1
                        </span>
                      ) : (
                        <span className="text-ima-text-secondary font-semibold text-sm">
                          #{rank}
                        </span>
                      )}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-ima-primary flex items-center justify-center text-xs font-semibold text-white shrink-0">
                      {initials(r.student_name)}
                    </div>
                    <p className="text-sm font-medium text-ima-text truncate flex-1">
                      {r.student_name}
                    </p>
                    <p className="text-sm font-semibold text-ima-text tabular-nums shrink-0">
                      {hoursLabel}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
