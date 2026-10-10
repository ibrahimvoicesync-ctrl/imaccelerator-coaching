import { ArrowRight, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { ReportForm } from "@/components/student/ReportForm";
import { DueSoonIndicator } from "@/components/student/DueSoonIndicator";
import { LocalTime } from "@/components/shared/LocalTime";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn, formatHoursMinutes, getToday } from "@/lib/utils";

function formatHeroDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default async function DailyReportPage() {
  const user = await requireRole("student");
  const admin = createAdminClient();
  const today = getToday();

  const [reportResult, sessionsResult] = await Promise.all([
    admin
      .from("daily_reports")
      .select("*")
      .eq("student_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    admin
      .from("work_sessions")
      .select("duration_minutes, status")
      .eq("student_id", user.id)
      .eq("date", today)
      .eq("status", "completed"),
  ]);

  if (reportResult.error) console.error("[report] report:", reportResult.error);
  if (sessionsResult.error) console.error("[report] sessions:", sessionsResult.error);

  const report = reportResult.data;
  const autoMinutes = (sessionsResult.data ?? []).reduce(
    (sum, s) => sum + (s.duration_minutes ?? 0),
    0
  );

  const submitted = Boolean(report?.submitted_at);
  const hasHours = autoMinutes > 0;

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[880px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <div className="flex items-center gap-3">
            <p
              className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
            >
              Daily Report
            </p>
            <span className="h-px flex-1 bg-ima-surface-light" aria-hidden="true" />
            <span className="inline-flex items-center gap-1.5">
              <span
                className={cn(
                  "h-[6px] w-[6px] rounded-full shrink-0",
                  hasHours ? "bg-ima-warning" : "bg-ima-surface-light/40",
                )}
                aria-hidden="true"
              />
              <span
                className="text-[11px] font-semibold tabular-nums text-ima-text"
              >
                {formatHoursMinutes(autoMinutes)}
              </span>
              <span
                className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
              >
                Tracked
              </span>
            </span>
          </div>

          <h1 className="mt-4 text-5xl md:text-6xl font-semibold tracking-tight text-ima-text leading-[1.05]">
            {formatHeroDate(today)}
          </h1>

          <div className="mt-4 h-[3px] w-10 rounded-full bg-ima-primary" aria-hidden="true" />

          <div className="mt-4 min-h-[24px]">
            {submitted && report?.submitted_at ? (
              <p className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ima-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>
                  Submitted at <LocalTime iso={report.submitted_at} /> · you can
                  still edit it.
                </span>
              </p>
            ) : (
              <DueSoonIndicator />
            )}
          </div>
        </header>

        {/* Form (shared) */}
        <div
          className="mt-10 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <ReportForm
            date={today}
            existingReport={report ?? null}
            autoMinutes={autoMinutes}
          />
        </div>

        {/* History link */}
        <div className="mt-10">
          <Link
            href="/student/report/history"
            className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-ima-text-secondary hover:text-ima-text min-h-[44px] motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md"
          >
            View past reports
            <ArrowRight
              className="h-3.5 w-3.5 motion-safe:transition-transform duration-200 ease-out group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
