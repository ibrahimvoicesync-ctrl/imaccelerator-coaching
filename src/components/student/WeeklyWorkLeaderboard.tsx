import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn, formatHoursMinutes } from "@/lib/utils";
import type { LeaderboardRow } from "@/lib/leaderboard";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function WeeklyWorkLeaderboard({
  rows,
  currentStudentId,
}: {
  rows: LeaderboardRow[];
  currentStudentId: string;
}) {
  return (
    <section
      aria-labelledby="leaderboard-label"
      className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8"
    >
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <p
          id="leaderboard-label"
          className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted"
        >
          Weekly Leaderboard
        </p>
        <p className="text-[11px] text-ima-text-muted">Hours since Monday</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={<Trophy className="h-5 w-5" aria-hidden="true" />}
          title="No hours logged yet this week"
          description="Start a work session and you could top the board."
        />
      ) : (
        <ul className="flex flex-col gap-1">
          {rows.map((r, i) => {
            const rank = i + 1;
            const isMe = r.student_id === currentStudentId;
            return (
              <li key={r.student_id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 min-h-[44px]",
                    isMe && "bg-ima-surface-accent",
                  )}
                >
                  <span
                    className={cn(
                      "w-6 shrink-0 text-center text-sm font-semibold tabular-nums",
                      rank === 1 ? "text-ima-primary" : "text-ima-text-muted",
                    )}
                    aria-hidden="true"
                  >
                    {rank}
                  </span>
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ima-primary text-xs font-semibold text-white"
                    aria-hidden="true"
                  >
                    {initials(r.name)}
                  </div>
                  <p className="flex-1 truncate text-sm font-medium text-ima-text">
                    {isMe ? `${r.name} (You)` : r.name}
                  </p>
                  <p className="shrink-0 text-sm font-semibold tabular-nums tracking-tight text-ima-text">
                    {formatHoursMinutes(r.minutes)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
