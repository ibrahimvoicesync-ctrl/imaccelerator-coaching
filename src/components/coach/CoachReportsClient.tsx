"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ReportRow } from "@/components/coach/ReportRow";
import { EmptyState } from "@/components/ui/EmptyState";

export type ReportItem = {
  id: string;
  student_id: string;
  date: string;
  hours_worked: number;
  star_rating: number | null;
  outreach_count: number;
  wins: string | null;
  improvements: string | null;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  existingComment: string | null;
};

type StudentItem = { id: string; name: string };

type Props = {
  reports: ReportItem[];
  students: StudentItem[];
  studentMap: Record<string, string>;
  currentFilter: string;
  currentStudentId: string;
};

export function CoachReportsClient({
  reports,
  students,
  studentMap,
  currentFilter,
  currentStudentId,
}: Props) {
  const routerRef = useRef(useRouter());
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [localReports, setLocalReports] = useState(reports);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  function buildUrl(params: {
    reviewed?: string | undefined;
    student_id?: string | undefined;
  }) {
    const sp = new URLSearchParams();
    if (params.reviewed !== undefined && params.reviewed !== "false") {
      sp.set("reviewed", params.reviewed);
    }
    if (params.student_id) {
      sp.set("student_id", params.student_id);
    }
    const qs = sp.toString();
    return `/coach/reports${qs ? `?${qs}` : ""}`;
  }

  function handleFilterTab(filter: "all" | "false" | "true") {
    routerRef.current.push(
      buildUrl({
        reviewed: filter,
        student_id: currentStudentId || undefined,
      })
    );
  }

  function handleStudentFilter(studentId: string) {
    routerRef.current.push(
      buildUrl({
        reviewed: currentFilter,
        student_id: studentId || undefined,
      })
    );
  }

  async function handleToggleReview(
    reportId: string,
    currentlyReviewed: boolean
  ) {
    setReviewingId(reportId);
    try {
      const res = await fetch(`/api/reports/${reportId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewed: !currentlyReviewed }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toastRef.current({
          type: "error",
          title: (json as { error?: string }).error ?? "Failed to update",
        });
        return;
      }
      setLocalReports((prev) =>
        prev.map((r) =>
          r.id === reportId
            ? {
                ...r,
                reviewed_by: currentlyReviewed ? null : "me",
                reviewed_at: currentlyReviewed ? null : new Date().toISOString(),
              }
            : r
        )
      );
      toastRef.current({
        type: "success",
        title: currentlyReviewed ? "Review removed" : "Marked as reviewed",
      });
    } catch {
      toastRef.current({ type: "error", title: "Network error" });
    } finally {
      setReviewingId(null);
    }
  }

  const tabs = [
    { label: "Unreviewed", value: "false" as const },
    { label: "Reviewed", value: "true" as const },
    { label: "All", value: "all" as const },
  ];

  return (
    <div className="mt-10">
      {/* Filter controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex gap-[6px] flex-wrap">
          {tabs.map((tab) => {
            const isActive = currentFilter === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => handleFilterTab(tab.value)}
                aria-pressed={isActive}
                className={[
                  "min-h-[44px] px-4 text-sm font-semibold rounded-[10px] motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                  isActive
                    ? "bg-ima-primary text-white"
                    : "bg-white border border-ima-border text-ima-text hover:border-ima-border",
                ].join(" ")}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <select
          aria-label="Filter by student"
          value={currentStudentId}
          onChange={(e) => handleStudentFilter(e.target.value)}
          className="min-h-[44px] px-3 text-sm rounded-[10px] border border-ima-border bg-white text-ima-text focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 hover:border-ima-border motion-safe:transition-colors"
        >
          <option value="">All Students</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* Report list */}
      {localReports.length === 0 ? (
        <div className="bg-white border border-ima-border rounded-[14px] p-6">
          <EmptyState
            variant="compact"
            icon={<FileText className="h-5 w-5" aria-hidden="true" />}
            title="No reports found"
            description="Reports matching your filters will appear here."
          />
        </div>
      ) : (
        <div className="space-y-[10px]">
          {localReports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              studentName={studentMap[report.student_id] ?? "Unknown Student"}
              onToggleReview={handleToggleReview}
              isReviewing={reviewingId === report.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
