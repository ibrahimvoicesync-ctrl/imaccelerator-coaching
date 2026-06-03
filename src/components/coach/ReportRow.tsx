import { CheckCircle2, Star } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ReportItem } from "@/components/coach/CoachReportsClient";
import { CommentForm } from "@/components/shared/CommentForm";

type Props = {
  report: ReportItem;
  studentName: string;
  onToggleReview: (reportId: string, currentlyReviewed: boolean) => void;
  isReviewing: boolean;
};

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function StarDisplay({ rating }: { rating: number | null }) {
  const filled = rating ?? 0;
  const label = rating ? `${rating} out of 5 stars` : "No rating";

  return (
    <span
      role="img"
      aria-label={label}
      className="inline-flex items-center gap-[2px]"
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= filled
              ? "h-[13px] w-[13px] text-ima-warning fill-ima-warning"
              : "h-[13px] w-[13px] text-ima-text-secondary"
          }
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

export function ReportRow({
  report,
  studentName,
  onToggleReview,
  isReviewing,
}: Props) {
  const isReviewed = report.reviewed_by !== null;

  return (
    <div
      className={[
        "border border-ima-border rounded-[14px] motion-safe:transition-colors",
        isReviewed ? "bg-white" : "bg-ima-surface",
      ].join(" ")}
    >
      <details className="group">
        <summary className="list-none cursor-pointer p-5 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-[14px]">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 min-h-[44px]">
            {/* Identity */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center text-xs font-semibold text-ima-text-secondary shrink-0">
                {initials(studentName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ima-text truncate leading-tight">
                  {studentName}
                </p>
                <p
                  className="mt-[3px] text-[10px] font-medium text-ima-text-secondary tracking-widest uppercase"
                >
                  {formatDate(report.date)}
                </p>
              </div>
              {/* Mobile: review badge inline */}
              <div className="sm:hidden shrink-0">
                {isReviewed && (
                  <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-wider text-ima-success">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Reviewed
                  </span>
                )}
              </div>
            </div>

            {/* Metrics + action */}
            <div className="flex items-center gap-4 flex-wrap">
              <StarDisplay rating={report.star_rating} />
              <div
                className="flex items-center gap-3 text-xs text-ima-text-secondary tracking-wider uppercase"
              >
                <span>
                  <span className="text-sm font-semibold text-ima-text tabular-nums">
                    {typeof report.hours_worked === "number"
                      ? report.hours_worked.toFixed(1)
                      : "0.0"}
                  </span>
                  <span className="ml-[2px] normal-case tracking-normal text-ima-text-secondary">h</span>
                </span>
                <span>
                  <span className="text-sm font-semibold text-ima-text tabular-nums">
                    {report.outreach_count}
                  </span>
                  <span className="ml-[4px]">outreach</span>
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0 ml-auto">
                {isReviewed ? (
                  <>
                    <span className="hidden sm:inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-wider text-ima-success">
                      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      Reviewed
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isReviewing}
                      onClick={(e) => {
                        e.preventDefault();
                        onToggleReview(report.id, true);
                      }}
                      aria-label="Un-review this report"
                    >
                      Un-review
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isReviewing}
                    loading={isReviewing}
                    onClick={(e) => {
                      e.preventDefault();
                      onToggleReview(report.id, false);
                    }}
                    aria-label="Mark this report as reviewed"
                  >
                    Mark Reviewed
                  </Button>
                )}
              </div>
            </div>
          </div>
        </summary>

        {/* Expanded details */}
        <div className="px-5 pb-5 pt-0 border-t border-ima-surface-light">
          {report.wins || report.improvements ? (
            <div className="space-y-4 pt-4">
              {report.wins && (
                <div>
                  <p
                    className="text-[10px] font-semibold tracking-[0.2em] text-ima-text-secondary uppercase"
                  >
                    Wins
                  </p>
                  <p className="mt-[6px] text-sm text-ima-text leading-relaxed">{report.wins}</p>
                </div>
              )}
              {report.improvements && (
                <div>
                  <p
                    className="text-[10px] font-semibold tracking-[0.2em] text-ima-text-secondary uppercase"
                  >
                    Improvements
                  </p>
                  <p className="mt-[6px] text-sm text-ima-text leading-relaxed">
                    {report.improvements}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="pt-4 text-sm text-ima-text-secondary italic">No details provided</p>
          )}
        </div>

        {/* Coach comment form */}
        <div className="px-5 pb-5 pt-0">
          <CommentForm reportId={report.id} initialComment={report.existingComment} />
        </div>
      </details>
    </div>
  );
}
