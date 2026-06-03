"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Trophy } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { StudentDetailTabs, type TabKey } from "@/components/coach/StudentDetailTabs";
import { CalendarTab } from "@/components/coach/CalendarTab";
import { RoadmapTab } from "@/components/coach/RoadmapTab";
import { DealsTab } from "@/components/coach/DealsTab";
import type { Database } from "@/lib/types";
import { StudentKpiSummary } from "@/components/student/StudentKpiSummary";
import type { LoggedByUser } from "@/lib/deals-attribution";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

interface OwnerStudentDetailClientProps {
  student: {
    name: string;
    email: string;
    joined_at: string;
    status: string;
  };
  role: "student" | "student_diy";
  isAtRisk: boolean;
  atRiskReasons: string[];
  calendarSessions: {
    id: string;
    date: string;
    cycle_number: number;
    status: string;
    duration_minutes: number;
    session_minutes: number;
  }[];
  calendarReports: {
    id: string;
    date: string;
    hours_worked: number;
    star_rating: number | null;
    brands_contacted: number;
    influencers_contacted: number;
    calls_joined: number;
    wins: string | null;
    improvements: string | null;
    reviewed_by: string | null;
  }[];
  calendarComments: Record<string, { comment: string }>;
  currentMonth: string;
  roadmap: {
    step_number: number;
    status: "locked" | "active" | "completed";
    completed_at: string | null;
  }[];
  initialTab?: string;
  studentId: string;
  coaches: { id: string; name: string; studentCount: number }[];
  currentCoachId: string | null;
  kpiData: {
    lifetimeOutreach: number;
    dailyOutreach: number;
    dailyMinutesWorked: number;
    joinedAt: string;
    currentStepNumber: number | null;
  };
  milestone: { totalHours: number; days: number } | null;
  skippedDays: number;
  deals: Deal[];
  viewerId: string;
  userMap: Record<string, LoggedByUser>;
}

export function OwnerStudentDetailClient({
  student,
  role,
  isAtRisk,
  atRiskReasons,
  calendarSessions,
  calendarReports,
  calendarComments,
  currentMonth,
  roadmap,
  initialTab,
  studentId,
  coaches,
  currentCoachId,
  kpiData,
  milestone,
  skippedDays,
  deals,
  viewerId,
  userMap,
}: OwnerStudentDetailClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Stable refs to prevent dep churn in callbacks
  const routerRef = useRef(router);
  const toastRef = useRef(toast);
  routerRef.current = router;
  toastRef.current = toast;

  const validTabs: TabKey[] = ["calendar", "roadmap", "deals"];
  const [activeTab, setActiveTab] = useState<TabKey>(
    validTabs.includes(initialTab as TabKey) ? (initialTab as TabKey) : "calendar"
  );
  const [assignedCoachId, setAssignedCoachId] = useState<string | null>(currentCoachId);
  const [isSaving, setIsSaving] = useState(false);

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `/owner/students/${studentId}?tab=${tab}`);
  }

  const handleAssign = useCallback(async (newCoachId: string | null) => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/assignments?studentId=${studentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coach_id: newCoachId }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toastRef.current({ type: "error", title: (json as { error?: string }).error ?? "Failed to update assignment" });
        setAssignedCoachId(currentCoachId); // revert on error
        return;
      }
      setAssignedCoachId(newCoachId);
      toastRef.current({ type: "success", title: newCoachId ? "Student assigned to coach" : "Student unassigned" });
      routerRef.current.refresh();
    } catch (err) {
      console.error("[OwnerStudentDetailClient] assignment error:", err);
      toastRef.current({ type: "error", title: "Something went wrong" });
      setAssignedCoachId(currentCoachId); // revert on error
    } finally {
      setIsSaving(false);
    }
  }, [studentId, currentCoachId]);

  const initial = student.name.charAt(0).toUpperCase();
  const joinDate = new Date(student.joined_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="px-4 space-y-6">
      {/* Inline owner student header — uses /owner/students back link */}
      <div className="flex flex-col gap-4">
        {/* Back button */}
        <Link href="/owner/students">
          <Button variant="ghost" size="sm">
            <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Back to Students
          </Button>
        </Link>

        {/* Student info */}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Avatar */}
          <div className="w-14 h-14 rounded-full bg-ima-primary flex items-center justify-center text-xl font-semibold text-white shrink-0">
            {initial}
          </div>

          {/* Name and join date */}
          <div className="flex-1">
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-ima-text">
              {student.name}
            </h1>
            <p className="mt-[2px] text-sm text-ima-text-secondary">{student.email}</p>
            <p className="mt-[2px] text-sm tabular-nums slashed-zero text-ima-text-secondary">
              Joined {joinDate}
            </p>
            {student.status === "suspended" && (
              <Badge variant="warning" size="sm" className="mt-1">Suspended</Badge>
            )}
          </div>

          {/* Coach Assignment */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="coach-assign"
              className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
            >
              Assigned Coach
            </label>
            <div className="flex items-center gap-2">
              <select
                id="coach-assign"
                value={assignedCoachId ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? null : e.target.value;
                  setAssignedCoachId(val);
                  handleAssign(val);
                }}
                disabled={isSaving}
                className="rounded-lg border border-ima-border bg-white px-3 py-2 text-sm text-ima-text min-h-[44px] min-w-[200px] focus:outline-none focus:ring-2 focus:ring-ima-primary disabled:opacity-50"
                aria-label="Assign student to coach"
              >
                <option value="">Unassigned</option>
                {coaches.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.studentCount} student{c.studentCount !== 1 ? "s" : ""})
                  </option>
                ))}
              </select>
              {isSaving && (
                <span className="text-xs text-ima-text-secondary">Saving...</span>
              )}
            </div>
          </div>

          {/* Skip badge */}
          {skippedDays > 0 && (
            <Badge variant="warning" size="sm">{skippedDays} skipped this week</Badge>
          )}

          {/* At-risk badge */}
          {isAtRisk && (
            <div className="flex flex-col items-start sm:items-end gap-1">
              <Badge variant="error">At Risk</Badge>
              <p className="text-sm text-ima-text-secondary">
                {atRiskReasons.join(", ")}
              </p>
            </div>
          )}
        </div>
      </div>

      {milestone && (
        <div className="flex items-center gap-3 rounded-lg bg-ima-success/10 border border-ima-success/20 p-4">
          <div className="w-10 h-10 rounded-lg bg-ima-success/20 flex items-center justify-center shrink-0">
            <Trophy className="h-5 w-5 text-ima-success" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[-0.005em] text-ima-text">
              100+ Hours Milestone
            </p>
            <p className="mt-[2px] text-xs tabular-nums slashed-zero text-ima-text-secondary">
              {milestone.totalHours} hours reached in {milestone.days} days
            </p>
          </div>
        </div>
      )}

      <StudentKpiSummary
        lifetimeOutreach={kpiData.lifetimeOutreach}
        dailyOutreach={kpiData.dailyOutreach}
        dailyMinutesWorked={kpiData.dailyMinutesWorked}
        joinedAt={kpiData.joinedAt}
        currentStepNumber={kpiData.currentStepNumber}
        role={role}
      />

      <StudentDetailTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />

      {activeTab === "calendar" && (
        <CalendarTab
          sessions={calendarSessions}
          reports={calendarReports}
          comments={calendarComments}
          currentMonth={currentMonth}
          studentId={studentId}
          viewerRole="owner"
          studentRole={role}
        />
      )}
      {activeTab === "roadmap" && <RoadmapTab roadmap={roadmap} joinedAt={student.joined_at} studentId={studentId} />}
      {activeTab === "deals" && (
        <DealsTab
          deals={deals}
          studentId={studentId}
          studentName={student.name}
          viewerRole="owner"
          viewerId={viewerId}
          userMap={userMap}
        />
      )}
    </div>
  );
}
