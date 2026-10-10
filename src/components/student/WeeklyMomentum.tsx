import { Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Confetti } from "@/components/shared/Confetti";
import { formatHoursMinutes } from "@/lib/utils";
import type {
  WeeklyEmailMomentum,
  WeeklyMomentum as WeeklyMomentumData,
} from "@/lib/leaderboard";

type MomentumProps =
  | { metric?: "hours"; data: WeeklyMomentumData }
  | { metric: "emails"; data: WeeklyEmailMomentum };

/**
 * The cohort's collective effort this week (emails sent, or hours for the DIY
 * lane, which doesn't log emails) and the student's own contribution —
 * the one celebratory, warm-gold surface in an otherwise blue-and-white app.
 * No rank, no comparison: belonging plus personal progress. A confetti burst
 * pops on load whenever the cohort has logged anything this week.
 */
export function WeeklyMomentum(props: MomentumProps) {
  const isEmails = props.metric === "emails";
  const cohortValue = isEmails ? props.data.cohortEmails : props.data.cohortMinutes;
  const myValue = isEmails ? props.data.myEmails : props.data.myMinutes;
  const { activeStudents } = props.data;
  const hasMomentum = cohortValue > 0;
  const format = (n: number) =>
    isEmails ? `${n.toLocaleString("en-US")} ${n === 1 ? "email" : "emails"}` : formatHoursMinutes(n);

  return (
    <section
      aria-labelledby="momentum-label"
      className={
        hasMomentum
          // Glow must track ima-warning (#92400E). It was previously hardcoded to the
          // old bright-amber value and clashed once the token was darkened for WCAG AA.
          // NOTE: Tailwind v4 scans this file as raw text, so never write a stale color
          // literal in a comment here — it regenerates the dead utility class.
          ? "relative overflow-hidden rounded-[14px] bg-ima-warning p-6 md:p-8 shadow-[0_10px_30px_-10px_rgba(146,64,14,0.55)]"
          : "rounded-[14px] bg-white border border-ima-border p-6 md:p-8 shadow-card"
      }
    >
      {hasMomentum && <Confetti replayKey={cohortValue} />}

      <div className="relative">
        <div className="flex items-baseline justify-between gap-3 mb-5">
          <p
            id="momentum-label"
            className={
              hasMomentum
                ? "text-[11px] uppercase tracking-[0.08em] font-semibold text-white"
                : "text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary"
            }
          >
            This week, together
          </p>
          <p
            className={
              hasMomentum
                ? "text-[11px] font-medium text-white/75"
                : "text-[11px] text-ima-text-secondary"
            }
          >
            Since Monday
          </p>
        </div>

        {!hasMomentum ? (
          <EmptyState
            variant="compact"
            icon={<Users className="h-5 w-5" aria-hidden="true" />}
            title="The week is fresh"
            description={
              isEmails
                ? "Send some emails and you'll get it started for the cohort."
                : "Log some work and you'll get it started for the cohort."
            }
          />
        ) : (
          <>
            <div className="flex items-end gap-2.5 flex-wrap">
              <span className="text-[44px] md:text-[52px] font-semibold tabular-nums tracking-tight leading-none text-white">
                {isEmails ? cohortValue.toLocaleString("en-US") : formatHoursMinutes(cohortValue)}
              </span>
              <span className="pb-[6px] text-[13px] font-medium text-white/85">
                {isEmails ? (cohortValue === 1 ? "email sent" : "emails sent") : "logged"} by {activeStudents} {activeStudents === 1 ? "student" : "students"}
              </span>
            </div>

            <div className="mt-6 pt-5 border-t border-white/25 flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.08em] font-semibold text-white/85">
                Your contribution
              </span>
              <span className="text-[15px] font-bold tabular-nums tracking-tight text-white">
                {format(myValue)}
              </span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
