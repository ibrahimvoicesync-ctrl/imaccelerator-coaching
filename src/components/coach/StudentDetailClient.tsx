"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { StudentHeader } from "./StudentHeader";
import { StudentDetailTabs, type TabKey } from "./StudentDetailTabs";
import { CalendarTab } from "./CalendarTab";
import { RoadmapTab } from "./RoadmapTab";
import { DealsTab } from "./DealsTab";
import type { Database } from "@/lib/types";
import { StudentKpiSummary } from "@/components/student/StudentKpiSummary";
import type { LoggedByUser } from "@/lib/deals-attribution";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

interface StudentDetailClientProps {
  student: {
    name: string;
    email: string;
    joined_at: string;
    status: string;
  };
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
  kpiData: {
    lifetimeOutreach: number;
    dailyOutreach: number;
    dailyMinutesWorked: number;
    joinedAt: string;
    currentStepNumber: number | null;
  };
  milestone: { totalHours: number; days: number } | null;
  deals: Deal[];
  viewerId: string;
  userMap: Record<string, LoggedByUser>;
}

export function StudentDetailClient({
  student,
  isAtRisk,
  atRiskReasons,
  calendarSessions,
  calendarReports,
  calendarComments,
  currentMonth,
  roadmap,
  initialTab,
  studentId,
  kpiData,
  milestone,
  deals,
  viewerId,
  userMap,
}: StudentDetailClientProps) {
  const validTabs: TabKey[] = ["calendar", "roadmap", "deals"];
  const [activeTab, setActiveTab] = useState<TabKey>(
    validTabs.includes(initialTab as TabKey) ? (initialTab as TabKey) : "calendar"
  );

  function handleTabChange(tab: TabKey) {
    setActiveTab(tab);
    window.history.replaceState(null, "", `/coach/students/${studentId}?tab=${tab}`);
  }

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16 space-y-8">
        <StudentHeader
          student={student}
          isAtRisk={isAtRisk}
          atRiskReasons={atRiskReasons}
        />

        {milestone && (
          <section
            aria-label="100 hour milestone"
            className="motion-safe:animate-fadeIn"
            style={{ animationDelay: "50ms" }}
          >
            <div className="flex items-center gap-4 bg-white border border-ima-border rounded-[14px] shadow-card px-6 py-5 min-h-[72px]">
              <div className="w-10 h-10 rounded-[8px] bg-ima-success/10 flex items-center justify-center shrink-0">
                <Trophy className="h-[18px] w-[18px] text-ima-success" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ima-text leading-tight">
                  100+ Hours Milestone
                </p>
                <p className="mt-1 text-xs text-ima-text-secondary">
                  {milestone.totalHours} hours reached in {milestone.days} days
                </p>
              </div>
            </div>
          </section>
        )}

        <div
          className="motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <StudentKpiSummary
            lifetimeOutreach={kpiData.lifetimeOutreach}
            dailyOutreach={kpiData.dailyOutreach}
            dailyMinutesWorked={kpiData.dailyMinutesWorked}
            joinedAt={kpiData.joinedAt}
            currentStepNumber={kpiData.currentStepNumber}
          />
        </div>

        <div
          className="motion-safe:animate-fadeIn"
          style={{ animationDelay: "150ms" }}
        >
          <StudentDetailTabs
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </div>

        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="motion-safe:animate-fadeIn"
          style={{ animationDelay: "200ms" }}
        >
          {activeTab === "calendar" && (
            <CalendarTab
              sessions={calendarSessions}
              reports={calendarReports}
              comments={calendarComments}
              currentMonth={currentMonth}
              studentId={studentId}
              viewerRole="coach"
            />
          )}
          {activeTab === "roadmap" && (
            <RoadmapTab roadmap={roadmap} joinedAt={student.joined_at} studentId={studentId} />
          )}
          {activeTab === "deals" && (
            <DealsTab
              deals={deals}
              studentId={studentId}
              studentName={student.name}
              viewerRole="coach"
              viewerId={viewerId}
              userMap={userMap}
            />
          )}
        </div>
      </div>
    </div>
  );
}
