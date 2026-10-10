import { FileText, Flame, Map as MapIcon } from "lucide-react";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStreakInfo } from "@/lib/streak";
import { getWeeklyEmailMomentum } from "@/lib/leaderboard";
import { getWeeklyHoursByDay } from "@/lib/weekly-hours";
import { getWeeklyEmailsByDay } from "@/lib/weekly-emails";
import { emailCountsFromReport } from "@/lib/emails";
import { getLatestCoachComment } from "@/lib/coach-comment";
import { AtAGlance } from "@/components/student/AtAGlance";
import { WeeklyMomentum } from "@/components/student/WeeklyMomentum";
import { CoachNoteCard } from "@/components/student/CoachNoteCard";
import { DashboardMetricView } from "@/components/student/DashboardMetricView";
import { NextActionButton } from "@/components/student/NextActionButton";
import { ROADMAP_STEPS, WORK_TRACKER } from "@/lib/config";
import { getToday } from "@/lib/utils";
import type { Database } from "@/lib/types";

type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];

function getNextAction(
  completedCount: number,
  totalMinutesWorked: number,
  activeSession: WorkSession | undefined,
  pausedSession: WorkSession | undefined,
  reportSubmitted: boolean,
): { label: string; href: string } {
  if (activeSession) return { label: "Go back to your timer", href: "/student/work" };
  if (pausedSession) return { label: "Carry on where you stopped", href: "/student/work" };
  if (totalMinutesWorked < WORK_TRACKER.dailyGoalHours * 60) {
    return {
      label: completedCount === 0 ? "Start working" : "Keep working",
      href: "/student/work",
    };
  }
  return {
    label: reportSubmitted ? "Change your daily report" : "Send your daily report",
    href: "/student/report",
  };
}

export default async function StudentDashboard() {
  const user = await requireRole("student");
  const admin = createAdminClient();
  const today = getToday();

  const [
    { data: sessions, error: sessionsError },
    { data: roadmapRows, error: roadmapError },
    reportResult,
    streakInfo,
    momentum,
    weeklyHours,
    weeklyEmails,
    coachNote,
  ] = await Promise.all([
    admin
      .from("work_sessions")
      .select("*")
      .eq("student_id", user.id)
      .eq("date", today)
      .order("cycle_number", { ascending: true }),
    admin
      .from("roadmap_progress")
      .select("step_number, status")
      .eq("student_id", user.id)
      .order("step_number", { ascending: true }),
    admin
      .from("daily_reports")
      .select("submitted_at, brands_contacted, influencers_contacted, outreach_count")
      .eq("student_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    getStreakInfo(user.id),
    getWeeklyEmailMomentum(user.id),
    getWeeklyHoursByDay(user.id),
    getWeeklyEmailsByDay(user.id),
    getLatestCoachComment(user.id),
  ]);

  if (sessionsError) console.error("[student dashboard] Failed to load sessions:", sessionsError);
  if (roadmapError) console.error("[student dashboard] Failed to load roadmap:", roadmapError);
  if (reportResult.error) console.error("[student dashboard] Failed to load report:", reportResult.error);

  const todayReport = reportResult.data;
  const reportSubmitted = Boolean(todayReport?.submitted_at);
  const todayEmails = emailCountsFromReport(todayReport);

  const todaySessions = (sessions ?? []) as WorkSession[];
  const completedCount = todaySessions.filter((s) => s.status === "completed").length;
  const totalMinutesWorked = todaySessions
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.duration_minutes, 0);
  const activeSession = todaySessions.find((s) => s.status === "in_progress");
  const pausedSession = todaySessions.find((s) => s.status === "paused");
  const dailyGoalMinutes = WORK_TRACKER.dailyGoalHours * 60;
  const rawPercent =
    dailyGoalMinutes > 0 ? Math.round((totalMinutesWorked / dailyGoalMinutes) * 100) : 0;
  const goalMet = rawPercent >= 100;
  const firstName = user.name.split(" ")[0];

  const nextAction = getNextAction(
    completedCount,
    totalMinutesWorked,
    activeSession,
    pausedSession,
    reportSubmitted,
  );

  const roadmapCompleted = (roadmapRows ?? []).filter((r) => r.status === "completed").length;
  const activeRoadmapStep = (roadmapRows ?? []).find((r) => r.status === "active");
  const allRoadmapDone =
    roadmapCompleted === ROADMAP_STEPS.length &&
    roadmapRows != null &&
    roadmapRows.length > 0;
  const activeStepConfig = activeRoadmapStep
    ? ROADMAP_STEPS.find((s) => s.step === activeRoadmapStep.step_number)
    : undefined;

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[880px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Masthead */}
        <header className="motion-safe:animate-riseIn">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Home
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Assalamu &apos;alaykum, {firstName}.
          </h1>
          <div className="mt-3 h-[3px] w-10 rounded-full bg-ima-primary" aria-hidden="true" />
          <p className="mt-3 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Here&apos;s your day. Start with the big blue button.
          </p>
        </header>

        <DashboardMetricView
          emails={todayEmails}
          weeklyEmails={weeklyEmails}
          totalMinutes={totalMinutesWorked}
          hoursGoalMet={goalMet}
          completedSessions={completedCount}
          weeklyHours={weeklyHours}
          logEmailsHref="/student/work#log-emails"
          nextAction={<NextActionButton href={nextAction.href} label={nextAction.label} />}
          coachNote={
            coachNote && (
              <div
                className="mt-[14px] motion-safe:animate-riseIn"
                style={{ animationDelay: "120ms" }}
              >
                <CoachNoteCard note={coachNote} basePath="/student" />
              </div>
            )
          }
        />

        {/* Everything else, one line each */}
        <div
          className="mt-[14px] motion-safe:animate-riseIn"
          style={{ animationDelay: "200ms" }}
        >
          <AtAGlance
            rows={[
              {
                icon: FileText,
                label: "Daily report",
                detail: reportSubmitted
                  ? "Sent — you can still change it"
                  : "Takes about 2 minutes · due by 11 PM",
                status: reportSubmitted
                  ? { text: "Sent", tone: "done" }
                  : { text: "Not yet", tone: "todo" },
                href: "/student/report",
              },
              {
                icon: MapIcon,
                label: "My steps",
                detail: allRoadmapDone
                  ? "All steps done"
                  : activeStepConfig
                    ? `Step ${activeStepConfig.step}: ${activeStepConfig.title}`
                    : "Your first step is ready",
                status: { text: `${roadmapCompleted}/${ROADMAP_STEPS.length}`, tone: allRoadmapDone ? "done" : "neutral" },
                href: "/student/roadmap",
              },
              {
                icon: Flame,
                label: "Streak",
                detail:
                  streakInfo.current > 0
                    ? `${streakInfo.current} day${streakInfo.current === 1 ? "" : "s"} in a row${
                        streakInfo.activeToday ? " — today counts" : " — work today to keep it"
                      }`
                    : "Work today to start one",
                status: streakInfo.activeToday ? { text: "Today ✓", tone: "done" } : undefined,
              },
            ]}
          />
        </div>

        {/* Weekly leaderboard — community motivation */}
        <div
          className="mt-[14px] motion-safe:animate-riseIn"
          style={{ animationDelay: "300ms" }}
        >
          <WeeklyMomentum metric="emails" data={momentum} />
        </div>

      </div>
    </div>
  );
}
