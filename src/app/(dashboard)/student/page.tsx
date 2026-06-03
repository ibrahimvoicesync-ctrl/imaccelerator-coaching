import Link from "next/link";
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Mail,
  Map as MapIcon,
  Megaphone,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStreakInfo } from "@/lib/streak";
import { getWeeklyWorkLeaderboard } from "@/lib/leaderboard";
import { getWeeklyHoursByDay } from "@/lib/weekly-hours";
import { StreakCard } from "@/components/student/StreakCard";
import { WeeklyWorkLeaderboard } from "@/components/student/WeeklyWorkLeaderboard";
import { WeeklyHoursChart } from "@/components/student/WeeklyHoursChart";
import { KPI_TARGETS, ROADMAP_STEPS, WORK_TRACKER } from "@/lib/config";
import { cn, formatHoursMinutes, getToday } from "@/lib/utils";
import {
  dailyHoursRag,
  dailyOutreachRag,
  daysInProgram as computeDaysInProgram,
  lifetimeOutreachRag,
  type RagStatus,
} from "@/lib/kpi";
import type { Database } from "@/lib/types";

type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];

function ragText(r: RagStatus): string {
  switch (r) {
    case "green":
      return "text-ima-success";
    case "amber":
      return "text-ima-warning";
    case "red":
      return "text-ima-error";
    default:
      return "text-ima-text";
  }
}

function ragBg(r: RagStatus): string {
  switch (r) {
    case "green":
      return "bg-ima-success";
    case "amber":
      return "bg-ima-warning";
    case "red":
      return "bg-ima-error";
    default:
      return "bg-ima-surface-light";
  }
}

function getNextAction(
  completedCount: number,
  totalMinutesWorked: number,
  activeSession: WorkSession | undefined,
  pausedSession: WorkSession | undefined,
  reportSubmitted: boolean,
): { label: string; href: string } {
  if (activeSession) return { label: "Continue session", href: "/student/work" };
  if (pausedSession) return { label: "Resume session", href: "/student/work" };
  if (totalMinutesWorked < WORK_TRACKER.dailyGoalHours * 60) {
    return {
      label: `Begin session ${String(completedCount + 1).padStart(2, "0")}`,
      href: "/student/work",
    };
  }
  return {
    label: reportSubmitted ? "Update daily report" : "Submit daily report",
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
    lifetimeResult,
    userResult,
    { data: deals, error: dealsError },
    streakInfo,
    leaderboard,
    weeklyHours,
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
      .select("submitted_at, brands_contacted, influencers_contacted")
      .eq("student_id", user.id)
      .eq("date", today)
      .maybeSingle(),
    admin
      .from("daily_reports")
      .select("brands_contacted, influencers_contacted")
      .eq("student_id", user.id),
    admin.from("users").select("joined_at").eq("id", user.id).single(),
    admin.from("deals").select("revenue, profit").eq("student_id", user.id),
    getStreakInfo(user.id),
    getWeeklyWorkLeaderboard(5),
    getWeeklyHoursByDay(user.id),
  ]);

  if (sessionsError) console.error("[student dashboard] Failed to load sessions:", sessionsError);
  if (roadmapError) console.error("[student dashboard] Failed to load roadmap:", roadmapError);
  if (reportResult.error) console.error("[student dashboard] Failed to load report:", reportResult.error);
  if (lifetimeResult.error) console.error("[student dashboard] Failed to load lifetime KPIs:", lifetimeResult.error);
  if (userResult.error) console.error("[student dashboard] Failed to load user joined_at:", userResult.error);
  if (dealsError) console.error("[student dashboard] Failed to load deals:", dealsError);

  const todayReport = reportResult.data;
  const reportSubmitted = Boolean(todayReport?.submitted_at);

  const dealsData = deals ?? [];
  const dealsClosed = dealsData.length;
  const totalRevenue = dealsData.reduce((sum, d) => sum + Number(d.revenue), 0);
  const totalProfit = dealsData.reduce((sum, d) => sum + Number(d.profit), 0);
  const hasDeals = dealsClosed > 0;

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
  const progressBarWidth = Math.min(100, rawPercent);
  const goalMet = rawPercent >= 100;
  const firstName = user.name.split(" ")[0];

  const nextAction = getNextAction(
    completedCount,
    totalMinutesWorked,
    activeSession,
    pausedSession,
    reportSubmitted,
  );

  const allReports = lifetimeResult.data ?? [];
  const lifetimeOutreach = allReports.reduce(
    (sum, r) => sum + (r.brands_contacted ?? 0) + (r.influencers_contacted ?? 0),
    0,
  );
  const days = computeDaysInProgram(userResult.data?.joined_at ?? new Date().toISOString());
  const dailyOutreachTotal =
    (todayReport?.brands_contacted ?? 0) + (todayReport?.influencers_contacted ?? 0);

  const lifetimeRag = lifetimeOutreachRag(lifetimeOutreach, days);
  const dailyOutRag = dailyOutreachRag(dailyOutreachTotal, days);
  const hoursRag = dailyHoursRag(totalMinutesWorked, days);

  const lifetimePercent = Math.min(
    100,
    Math.round((lifetimeOutreach / KPI_TARGETS.lifetimeOutreach) * 100),
  );
  const dailyOutreachPercent = Math.min(
    100,
    Math.round((dailyOutreachTotal / KPI_TARGETS.dailyOutreach) * 100),
  );

  const roadmapCompleted = (roadmapRows ?? []).filter((r) => r.status === "completed").length;
  const activeRoadmapStep = (roadmapRows ?? []).find((r) => r.status === "active");
  const allRoadmapDone =
    roadmapCompleted === ROADMAP_STEPS.length &&
    roadmapRows != null &&
    roadmapRows.length > 0;
  const roadmapPercent =
    roadmapRows && roadmapRows.length > 0
      ? Math.round((roadmapCompleted / ROADMAP_STEPS.length) * 100)
      : 0;

  const currencyFormat = (value: number) =>
    `$${value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Dashboard
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Assalamu3leikum, {firstName}.
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Here&apos;s how today is tracking.
          </p>
        </header>

        {/* Hero — Today's Work */}
        <section
          aria-labelledby="todays-work-label"
          className="mt-9 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <div className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8">
            <div className="flex items-center justify-between gap-3">
              <p
                id="todays-work-label"
                className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
              >
                Today&apos;s Work
              </p>
              {goalMet ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Goal Reached
                </span>
              ) : (
                <span
                  className="text-[10px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase tabular-nums"
                >
                  {completedCount} Session{completedCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            <div className="mt-6 flex items-end gap-3 flex-wrap">
              <span
                className={cn(
                  "text-6xl md:text-7xl font-semibold tabular-nums tracking-tight leading-[0.95]",
                  goalMet ? "text-ima-success" : "text-ima-primary",
                )}
              >
                {formatHoursMinutes(totalMinutesWorked)}
              </span>
              <span className="pb-2 text-[15px] font-medium text-ima-text-secondary tabular-nums">
                / {WORK_TRACKER.dailyGoalHours}h
              </span>
            </div>

            <div
              className="mt-5 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
              role="progressbar"
              aria-valuenow={totalMinutesWorked}
              aria-valuemin={0}
              aria-valuemax={dailyGoalMinutes}
              aria-label={`Daily hours progress: ${formatHoursMinutes(totalMinutesWorked)} of ${WORK_TRACKER.dailyGoalHours}h`}
            >
              <div
                className={cn(
                  "h-full rounded-full motion-safe:transition-[width] duration-700 ease-out",
                  goalMet ? "bg-ima-success" : "bg-ima-primary",
                )}
                style={{ width: `${progressBarWidth}%` }}
              />
            </div>
          </div>

          <Link
            href={nextAction.href}
            className="group mt-5 inline-flex items-center justify-center gap-3 w-full rounded-[14px] bg-ima-primary text-white text-[15px] md:text-[17px] font-bold tracking-tight min-h-[60px] md:min-h-[64px] px-6 motion-safe:transition-all motion-safe:duration-200 ease-out hover:bg-ima-primary-hover hover:shadow-[0_14px_32px_-14px_rgba(37,99,235,0.65)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
          >
            {nextAction.label}
            <ArrowRight
              className="h-5 w-5 motion-safe:transition-transform duration-200 ease-out group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </section>

        {/* Consistency streak — a calm reason to return daily */}
        <div
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "130ms" }}
        >
          <StreakCard info={streakInfo} />
        </div>

        {/* KPI tracking — compact cards with progress bars */}
        <section
          aria-label="KPI tracking"
          className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "150ms" }}
        >
          <KpiCard
            icon={Megaphone}
            iconBg="bg-ima-surface-accent"
            iconColor="text-ima-primary"
            label="Lifetime Outreach"
            value={lifetimeOutreach.toLocaleString()}
            target={`Target ${KPI_TARGETS.lifetimeOutreach.toLocaleString()}`}
            percent={lifetimePercent}
            rag={lifetimeRag}
          />
          <KpiCard
            icon={Mail}
            iconBg="bg-ima-warning/10"
            iconColor="text-ima-warning"
            label="Daily Outreach"
            value={String(dailyOutreachTotal)}
            target={`Target ${KPI_TARGETS.dailyOutreach}/day`}
            percent={dailyOutreachPercent}
            rag={dailyOutRag}
          />
          <KpiCard
            icon={Clock}
            iconBg="bg-ima-surface-light"
            iconColor="text-ima-text-secondary"
            label="Hours Today"
            value={formatHoursMinutes(totalMinutesWorked)}
            target={`Target ${WORK_TRACKER.dailyGoalHours}h/day`}
            percent={progressBarWidth}
            rag={hoursRag}
          />
        </section>

        {/* Hours this week — visual */}
        <div
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "175ms" }}
        >
          <WeeklyHoursChart data={weeklyHours} />
        </div>

        {/* Roadmap + Daily Report */}
        <section
          aria-label="Roadmap and daily report"
          className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "200ms" }}
        >
          {/* Roadmap */}
          <div className="bg-white border border-ima-border rounded-[14px] p-6 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-[8px] bg-ima-surface-accent flex items-center justify-center shrink-0">
                  <MapIcon className="h-[18px] w-[18px] text-ima-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ima-text leading-tight">
                    Roadmap
                  </p>
                  <p className="mt-[3px] text-[12px] text-ima-text-secondary">
                    {allRoadmapDone
                      ? "All steps completed"
                      : activeRoadmapStep
                        ? `Currently on step ${activeRoadmapStep.step_number}`
                        : "Start your journey"}
                  </p>
                </div>
              </div>
              <span
                className="text-[12px] font-semibold tabular-nums text-ima-text shrink-0"
              >
                {roadmapCompleted}/{ROADMAP_STEPS.length}
              </span>
            </div>

            <div
              className="mt-5 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
              role="progressbar"
              aria-valuenow={roadmapCompleted}
              aria-valuemin={0}
              aria-valuemax={ROADMAP_STEPS.length}
              aria-label={`Roadmap progress: ${roadmapCompleted} of ${ROADMAP_STEPS.length}`}
            >
              <div
                className={cn(
                  "h-full rounded-full motion-safe:transition-[width] duration-700 ease-out",
                  allRoadmapDone ? "bg-ima-success" : "bg-ima-primary",
                )}
                style={{ width: `${roadmapPercent}%` }}
              />
            </div>

            <Link
              href="/student/roadmap"
              aria-label={
                allRoadmapDone
                  ? "View roadmap"
                  : activeRoadmapStep
                    ? `Continue step ${activeRoadmapStep.step_number}`
                    : "View roadmap"
              }
              className="group mt-auto pt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ima-primary hover:text-ima-primary-hover min-h-[44px] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md"
            >
              {allRoadmapDone
                ? "View roadmap"
                : activeRoadmapStep
                  ? `Continue step ${activeRoadmapStep.step_number}`
                  : "View roadmap"}
              <ArrowRight
                className="h-3.5 w-3.5 motion-safe:transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>

          {/* Daily Report */}
          <div className="bg-white border border-ima-border rounded-[14px] p-6 flex flex-col">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-[8px] bg-ima-surface-light flex items-center justify-center shrink-0">
                  <FileText className="h-[18px] w-[18px] text-ima-text-secondary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ima-text leading-tight">
                    Daily Report
                  </p>
                  <p className="mt-[3px] text-[12px] text-ima-text-secondary">
                    {reportSubmitted
                      ? "Submitted — you can still update it."
                      : "Close today's loop before 11 PM."}
                  </p>
                </div>
              </div>
              {reportSubmitted ? (
                <span className="inline-flex items-center gap-1 px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success shrink-0">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Submitted
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-warning/10 border border-ima-warning/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-warning shrink-0">
                  <span
                    className="inline-block h-[6px] w-[6px] rounded-full bg-ima-warning"
                    aria-hidden="true"
                  />
                  Pending
                </span>
              )}
            </div>

            <div className="mt-5 flex items-center gap-3">
              <span
                className="text-[10px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
              >
                Due
              </span>
              <span className="text-[13px] font-semibold tabular-nums text-ima-text">
                11:00 PM
              </span>
            </div>

            <Link
              href="/student/report"
              aria-label={reportSubmitted ? "Update report" : "Submit report"}
              className="group mt-auto pt-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ima-primary hover:text-ima-primary-hover min-h-[44px] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md"
            >
              {reportSubmitted ? "Update report" : "Submit report"}
              <ArrowRight
                className="h-3.5 w-3.5 motion-safe:transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </div>
        </section>

        {/* Deals — compact horizontal stat cards (matches coach Row A) */}
        <section
          aria-label="Deals summary"
          className="mt-[14px] grid grid-cols-1 sm:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "250ms" }}
        >
          <CompactStat
            icon={Briefcase}
            iconBg="bg-ima-warning/10"
            iconColor="text-ima-warning"
            value={String(dealsClosed)}
            label={hasDeals ? "Deals Closed — all time" : "Deals Closed — none yet"}
          />
          <CompactStat
            icon={DollarSign}
            iconBg="bg-ima-surface-accent"
            iconColor="text-ima-primary"
            value={currencyFormat(totalRevenue)}
            label={`Revenue — ${dealsClosed} deal${dealsClosed !== 1 ? "s" : ""}`}
          />
          <CompactStat
            icon={TrendingUp}
            iconBg="bg-ima-success/10"
            iconColor="text-ima-success"
            value={currencyFormat(totalProfit)}
            label={hasDeals ? "Profit — all time" : "Profit — none yet"}
          />
        </section>

        {/* Weekly leaderboard — community motivation */}
        <div
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "300ms" }}
        >
          <WeeklyWorkLeaderboard rows={leaderboard} currentStudentId={user.id} />
        </div>

      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  target,
  percent,
  rag,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  target: string;
  percent: number;
  rag: RagStatus;
}) {
  return (
    <div className="bg-white border border-ima-border rounded-[14px] p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={cn(
              "w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0",
              iconBg,
            )}
          >
            <Icon className={cn("h-[18px] w-[18px]", iconColor)} aria-hidden="true" />
          </div>
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            {label}
          </p>
        </div>
        <span
          className={cn("inline-block h-[8px] w-[8px] rounded-full shrink-0", ragBg(rag))}
          aria-hidden="true"
        />
      </div>

      <div className="mt-5 flex items-baseline justify-between gap-3">
        <p
          className={cn(
            "text-[28px] md:text-[30px] font-semibold tabular-nums tracking-tight leading-none",
            ragText(rag),
          )}
        >
          {value}
        </p>
        <p
          className="text-[11px] font-semibold tabular-nums text-ima-text-secondary"
        >
          {percent}%
        </p>
      </div>

      <p className="mt-[10px] text-[12px] text-ima-text-secondary">{target}</p>

      <div
        className="mt-4 h-[4px] rounded-full bg-ima-surface-light overflow-hidden"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${percent}%`}
      >
        <div
          className={cn(
            "h-full rounded-full motion-safe:transition-[width] duration-700 ease-out",
            ragBg(rag),
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function CompactStat({
  icon: Icon,
  iconBg,
  iconColor,
  value,
  label,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]">
      <div
        className={cn(
          "w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0",
          iconBg,
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", iconColor)} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[24px] md:text-[26px] font-semibold leading-none tabular-nums tracking-tight text-ima-text">
          {value}
        </p>
        <p className="mt-[6px] text-[12px] text-ima-text-secondary">{label}</p>
      </div>
    </div>
  );
}
