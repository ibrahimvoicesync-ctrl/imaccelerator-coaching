import { ArrowLeft, FileText, Star } from "lucide-react";
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHours } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";
import { CoachFeedbackCard } from "@/components/shared/CoachFeedbackCard";
import type { Database } from "@/lib/types";

type DailyReport = Database["public"]["Tables"]["daily_reports"]["Row"];

type ReportWithComment = DailyReport & {
  report_comments: Array<{
    id: string;
    comment: string;
    updated_at: string;
    coach: { name: string } | null;
  }> | null;
};

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function ReportHistoryPage() {
  const user = await requireRole("student");
  const admin = createAdminClient();

  const { data: reports, error } = await admin
    .from("daily_reports")
    .select(
      `
      *,
      report_comments (
        id,
        comment,
        updated_at,
        coach:users!report_comments_coach_id_fkey ( name )
      )
    `,
    )
    .eq("student_id", user.id)
    .order("date", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[report history] Failed to load reports:", error);
  }

  const reportList = (reports ?? []) as ReportWithComment[];

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-3xl px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Back link */}
        <Link
          href="/student/report"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ima-text-secondary hover:text-ima-text min-h-[44px] motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to Report
        </Link>

        {/* Masthead */}
        <header className="mt-4 motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
          >
            Report History
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Past Reports
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Your last {reportList.length} submissions.
          </p>
        </header>

        {/* Empty state */}
        {reportList.length === 0 ? (
          <div
            className="mt-9 bg-white border border-ima-border rounded-[14px] p-6 motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <EmptyState
              variant="compact"
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              title="No reports submitted yet"
              description="Start tracking your progress by submitting your first daily report."
              action={
                <Link
                  href="/student/report"
                  className={buttonVariants({ variant: "primary" })}
                >
                  Submit Your First Report
                </Link>
              }
            />
          </div>
        ) : (
          <section
            aria-label="Past reports"
            className="mt-9 space-y-4 motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            {reportList.map((report) => {
              const feedbackComment = report.report_comments?.[0] ?? null;
              return (
                <div key={report.id} className="space-y-2">
                  <article className="bg-white border border-ima-border rounded-[14px] p-6">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[15px] font-semibold text-ima-text">
                        {formatDateDisplay(report.date)}
                      </p>
                      <div
                        className="flex items-center gap-[2px] shrink-0"
                        aria-label={`${report.star_rating ?? 0} of 5 stars`}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star
                            key={n}
                            className={
                              n <= (report.star_rating ?? 0)
                                ? "h-[13px] w-[13px] fill-ima-warning text-ima-warning"
                                : "h-[13px] w-[13px] text-ima-text-secondary"
                            }
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center px-2 py-[2px] rounded-full bg-ima-surface-light border border-ima-border text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary tabular-nums"
                      >
                        {formatHours(report.hours_worked * 60)}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-[2px] rounded-full bg-ima-surface-light border border-ima-border text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary tabular-nums"
                      >
                        {report.outreach_count} Outreach
                      </span>
                    </div>

                    {report.wins && (
                      <div className="mt-4">
                        <p
                          className="text-[10px] font-semibold tracking-[0.18em] text-ima-text-secondary uppercase"
                        >
                          Wins
                        </p>
                        <p className="mt-1 text-[14px] text-ima-text leading-relaxed">
                          {report.wins}
                        </p>
                      </div>
                    )}

                    {report.improvements && (
                      <div className="mt-3">
                        <p
                          className="text-[10px] font-semibold tracking-[0.18em] text-ima-text-secondary uppercase"
                        >
                          Improvements
                        </p>
                        <p className="mt-1 text-[14px] text-ima-text leading-relaxed">
                          {report.improvements}
                        </p>
                      </div>
                    )}
                  </article>

                  {feedbackComment && feedbackComment.comment && (
                    <CoachFeedbackCard
                      comment={feedbackComment.comment}
                      coachName={feedbackComment.coach?.name ?? "Coach"}
                      updatedAt={feedbackComment.updated_at}
                    />
                  )}
                </div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
