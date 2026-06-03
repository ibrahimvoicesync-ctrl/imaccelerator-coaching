import { unstable_cache } from "next/cache";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { COACH_CONFIG } from "@/lib/config";
import { getToday, getTodayUTC } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";
import { fetchCoachDashboard, coachDashboardTag } from "@/lib/rpc/coach-dashboard";
import { ROADMAP_STEPS } from "@/lib/config";
import {
  Users,
  AlertTriangle,
  FileText,
  ArrowRight,
  Briefcase,
  DollarSign,
  Map as MapIcon,
  Mail,
  Star,
  Trophy,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

type EnrichedStudent = {
  id: string;
  name: string;
  isNew: boolean;
  isAtRisk: boolean;
  atRiskReasons: string[];
  lastActiveLabel: string;
  todayReportSubmitted: boolean;
  currentRoadmapStep: number;
  skippedDays?: number;
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatRelative(iso: string, nowMs: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diffMs = nowMs - t;
  if (diffMs < 60_000) return "JUST NOW";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}M AGO`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}H AGO`;
  if (hours < 48) return "YESTERDAY";
  return new Date(iso)
    .toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })
    .toUpperCase();
}

function formatHoursLabel(minutes: number): string {
  const safe = Number.isFinite(minutes) && minutes > 0 ? Math.floor(minutes) : 0;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m}m`;
}

export default async function CoachDashboard() {
  // Step 1 — Auth + fetch assigned students
  const user = await requireRole("coach");
  const admin = createAdminClient();
  const today = getToday();

  const { data: students, error: studentsError } = await admin
    .from("users")
    .select("id, name, email, status, joined_at")
    .eq("role", "student")
    .eq("coach_id", user.id)
    .eq("status", "active");

  if (studentsError) {
    console.error("[coach dashboard] Failed to load students:", studentsError);
  }

  const studentList = students ?? [];
  const studentIds = studentList.map((s) => s.id);

  const getCachedCoachDashboard = unstable_cache(
    async (coachId: string, t: string) => fetchCoachDashboard(coachId, t),
    ["coach-dashboard", user.id],
    { revalidate: 60, tags: [coachDashboardTag(user.id)] },
  );
  const dashboard = await getCachedCoachDashboard(user.id, today);

  const intFormat = new Intl.NumberFormat("en-US");
  const currencyFormat = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
  const dealsClosedLabel = intFormat.format(dashboard.stats.deals_closed ?? 0);
  const revenueLabel = currencyFormat.format(Number(dashboard.stats.revenue ?? 0));
  const avgStepLabel = Number(dashboard.stats.avg_roadmap_step ?? 0).toFixed(1);
  const emailsSentLabel = intFormat.format(dashboard.stats.emails_sent ?? 0);

  const dashboardNowMs = new Date(today + "T23:59:59Z").getTime();

  const [sessionsResult, reportsResult, roadmapResult, skipResult] =
    studentIds.length > 0
      ? await Promise.all([
          admin
            .from("work_sessions")
            .select("student_id, date")
            .in("student_id", studentIds)
            .order("date", { ascending: false }),
          admin
            .from("daily_reports")
            .select("student_id, date, star_rating, reviewed_by")
            .in("student_id", studentIds),
          admin
            .from("roadmap_progress")
            .select("student_id, step_number, status")
            .in("student_id", studentIds),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (admin as any).rpc("get_weekly_skip_counts", {
            p_student_ids: studentIds,
            p_today: getTodayUTC(),
            p_current_hour: new Date().getUTCHours(),
          }),
        ])
      : ([
          { data: null, error: null },
          { data: null, error: null },
          { data: null, error: null },
          { data: null, error: null },
        ] as const);

  if (sessionsResult.error) {
    console.error("[coach dashboard] Failed to load sessions:", sessionsResult.error);
  }
  if (reportsResult.error) {
    console.error("[coach dashboard] Failed to load reports:", reportsResult.error);
  }
  if (roadmapResult.error) {
    console.error("[coach dashboard] Failed to load roadmap:", roadmapResult.error);
  }
  if (skipResult.error) {
    console.error("[coach dashboard] Failed to load skip counts:", skipResult.error);
  }

  const latestSessionMap = new Map<string, string>();
  for (const s of sessionsResult.data ?? []) {
    if (!latestSessionMap.has(s.student_id)) {
      latestSessionMap.set(s.student_id, s.date);
    }
  }

  const latestReportMap = new Map<string, string>();
  const todayReportMap = new Map<string, boolean>();
  for (const r of reportsResult.data ?? []) {
    if (!latestReportMap.has(r.student_id) || r.date > (latestReportMap.get(r.student_id) ?? "")) {
      latestReportMap.set(r.student_id, r.date);
    }
    if (r.date === today) {
      todayReportMap.set(r.student_id, true);
    }
  }

  const recentRatings = new Map<string, number[]>();
  const nowMs = new Date(today + "T23:59:59Z").getTime();
  const sevenDaysAgo = new Date(
    nowMs - COACH_CONFIG.reportInboxDays * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  let pendingReviewCount = 0;
  for (const r of reportsResult.data ?? []) {
    if (r.date >= sevenDaysAgo && r.star_rating !== null) {
      const arr = recentRatings.get(r.student_id) ?? [];
      arr.push(r.star_rating);
      recentRatings.set(r.student_id, arr);
    }
    if (r.date >= sevenDaysAgo && r.reviewed_by === null) {
      pendingReviewCount++;
    }
  }

  const roadmapStepMap = new Map<string, number>();
  for (const r of roadmapResult.data ?? []) {
    const current = roadmapStepMap.get(r.student_id) ?? 0;
    if (
      (r.status === "completed" || r.status === "active") &&
      r.step_number > current
    ) {
      roadmapStepMap.set(r.student_id, r.step_number);
    }
  }

  const skipCountMap = new Map<string, number>();
  const skipData = (skipResult?.data ?? {}) as Record<string, number>;
  for (const [id, count] of Object.entries(skipData)) {
    if (typeof count === "number" && count > 0) {
      skipCountMap.set(id, count);
    }
  }

  const enrichedStudents: EnrichedStudent[] = studentList.map((student) => {
    const latestSession = latestSessionMap.get(student.id) ?? null;
    const latestReport = latestReportMap.get(student.id) ?? null;
    const lastActiveDateStr =
      [latestSession, latestReport].filter(Boolean).sort().at(-1) ?? null;
    const hasActivity = latestSession !== null || latestReport !== null;
    const joinedDaysAgo = Math.floor(
      (nowMs - new Date(student.joined_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (!hasActivity && joinedDaysAgo < COACH_CONFIG.atRiskInactiveDays) {
      return {
        id: student.id,
        name: student.name,
        isNew: true,
        isAtRisk: false,
        atRiskReasons: [],
        lastActiveLabel: "New",
        todayReportSubmitted: todayReportMap.has(student.id),
        currentRoadmapStep: roadmapStepMap.get(student.id) ?? 1,
        skippedDays: skipCountMap.get(student.id) ?? 0,
      };
    }

    const reasons: string[] = [];

    if (lastActiveDateStr) {
      const daysInactive = Math.floor(
        (nowMs - new Date(lastActiveDateStr + "T00:00:00Z").getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (daysInactive >= COACH_CONFIG.atRiskInactiveDays) {
        reasons.push(`Kaslan ${daysInactive}d`);
      }
    } else if (joinedDaysAgo >= COACH_CONFIG.atRiskInactiveDays) {
      reasons.push(`Kaslan ${joinedDaysAgo}d`);
    }

    const ratings = recentRatings.get(student.id);
    if (ratings && ratings.length > 0) {
      const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
      if (avg < COACH_CONFIG.atRiskRatingThreshold) {
        reasons.push(`Avg rating ${avg.toFixed(1)}`);
      }
    }

    let lastActiveLabel = "Never";
    if (lastActiveDateStr) {
      lastActiveLabel = new Date(
        lastActiveDateStr + "T00:00:00Z"
      ).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      });
    }

    return {
      id: student.id,
      name: student.name,
      isNew: false,
      isAtRisk: reasons.length > 0,
      atRiskReasons: reasons,
      lastActiveLabel,
      todayReportSubmitted: todayReportMap.has(student.id),
      currentRoadmapStep: roadmapStepMap.get(student.id) ?? 1,
      skippedDays: skipCountMap.get(student.id) ?? 0,
    };
  });

  enrichedStudents.sort((a, b) => {
    if (a.isAtRisk && !b.isAtRisk) return -1;
    if (!a.isAtRisk && b.isAtRisk) return 1;
    return a.name.localeCompare(b.name);
  });

  const atRiskStudents = enrichedStudents.filter((s) => s.isAtRisk);
  const firstName = user.name.split(" ")[0];
  const greeting = "Assalamu3leikum";
  const eyebrow = "Dashboard";

  const statA = [
    {
      label: "Total Students",
      value: String(studentList.length),
      icon: Users,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
      valueColor: "text-ima-text",
    },
    {
      label: "At Risk",
      value: String(atRiskStudents.length),
      icon: AlertTriangle,
      iconBg: "bg-ima-warning/10",
      iconColor: "text-ima-warning",
      valueColor: atRiskStudents.length > 0 ? "text-ima-error" : "text-ima-text",
    },
    {
      label: "Reports Pending",
      value: String(pendingReviewCount),
      icon: FileText,
      iconBg: "bg-ima-surface-light",
      iconColor: "text-ima-text-secondary",
      valueColor: "text-ima-text",
    },
  ];

  const statB = [
    {
      label: "Deals Closed",
      value: dealsClosedLabel,
      icon: Briefcase,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
      href: "/coach/analytics#deals",
    },
    {
      label: "Revenue Generated",
      value: revenueLabel,
      icon: DollarSign,
      iconBg: "bg-ima-success/10",
      iconColor: "text-ima-success",
      href: "/coach/analytics#revenue",
    },
    {
      label: "Avg Roadmap Step",
      value: avgStepLabel,
      icon: MapIcon,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
      href: "/coach/analytics#roadmap",
    },
    {
      label: "Emails Sent",
      value: emailsSentLabel,
      icon: Mail,
      iconBg: "bg-ima-warning/10",
      iconColor: "text-ima-warning",
      href: "/coach/analytics#emails",
    },
  ];

  return (
    <div
      className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg"
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Greeting */}
        <header className="motion-safe:animate-fadeIn">
          <p className="text-xs font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
            {eyebrow.toUpperCase()}
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight">
            {greeting}, {firstName}!
          </h1>
          <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
            Here&apos;s how your students are doing
          </p>
        </header>

        {/* Stats Row A — 3 compact cards */}
        <section
          aria-label="Student overview"
          className="mt-9 grid grid-cols-1 sm:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          {statA.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]"
            >
              <div
                className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${s.iconBg}`}
              >
                <s.icon className={`h-[18px] w-[18px] ${s.iconColor}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p
                  className={`text-2xl font-semibold leading-none tabular-nums tracking-tight ${s.valueColor}`}
                >
                  {s.value}
                </p>
                <p className="mt-[6px] text-xs text-ima-text-secondary">{s.label}</p>
              </div>
            </div>
          ))}
        </section>

        {/* Stats Row B — 4 compact cards */}
        <section
          aria-label="Performance metrics"
          className="mt-[14px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          {statB.map((s) => (
            <Link
              key={s.label}
              href={s.href}
              aria-label={`${s.label}: ${s.value}. View in analytics.`}
              className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px] motion-safe:transition-[transform,border-color] hover:-translate-y-[1px] hover:border-ima-border focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
            >
              <div
                className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${s.iconBg}`}
              >
                <s.icon className={`h-[18px] w-[18px] ${s.iconColor}`} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none tabular-nums tracking-tight text-ima-text">
                  {s.value}
                </p>
                <p className="mt-[6px] text-xs text-ima-text-secondary">{s.label}</p>
              </div>
            </Link>
          ))}
        </section>

        {/* Feed row — Recent Submissions (1.15fr) + Top 3 (1fr) */}
        <section
          aria-label="Activity feed"
          className="mt-10 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "150ms" }}
        >
          {/* Recent Submissions */}
          <div className="bg-white border border-ima-border rounded-[14px] p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-ima-text leading-tight">
                  Recent Submissions
                </h2>
                <p className="mt-1 text-xs text-ima-text-secondary">
                  3 most recent reports from your students
                </p>
              </div>
              <Link
                href="/coach/reports"
                className="inline-flex items-center gap-1 text-xs font-medium text-ima-primary hover:text-ima-primary-hover min-h-[44px] shrink-0 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md px-1"
              >
                See all reports
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
            <div className="h-px bg-ima-surface-light mt-4" aria-hidden="true" />

            {dashboard.recent_reports.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  variant="compact"
                  icon={<FileText className="h-5 w-5" aria-hidden="true" />}
                  title="No submissions yet"
                  description="Reports from your students will appear here as soon as they log their day."
                />
              </div>
            ) : (
              <ul className="mt-1" role="list">
                {dashboard.recent_reports.map((r, i, arr) => {
                  const rating = r.star_rating ?? 0;
                  const rel = formatRelative(r.submitted_at, dashboardNowMs);
                  const isLast = i === arr.length - 1;
                  return (
                    <li key={r.id} className={!isLast ? "border-b border-ima-surface-light" : ""}>
                      <Link
                        href={`/coach/reports#${r.id}`}
                        aria-label={`${r.student_name} submitted a report, rated ${rating} of 5 stars, ${rel.toLowerCase()}`}
                        className="flex items-center gap-3 py-3 min-h-[52px] motion-safe:transition-colors hover:bg-ima-bg -mx-2 px-2 rounded-md focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                      >
                        <div className="w-8 h-8 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center text-xs font-semibold text-ima-text-secondary shrink-0">
                          {initials(r.student_name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-ima-text truncate leading-tight">
                            {r.student_name}
                          </p>
                          <p className="mt-[3px] text-[10px] font-medium text-ima-text-secondary tracking-widest uppercase">
                            {rel}
                          </p>
                        </div>
                        <div
                          className="flex items-center gap-[2px] shrink-0"
                          aria-hidden="true"
                        >
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star
                              key={n}
                              className={
                                n <= rating
                                  ? "h-[13px] w-[13px] text-ima-warning fill-ima-warning"
                                  : "h-[13px] w-[13px] text-ima-text-secondary"
                              }
                              aria-hidden="true"
                            />
                          ))}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Top 3 This Week */}
          <div className="bg-white border border-ima-border rounded-[14px] p-6">
            <h2 className="text-sm font-semibold text-ima-text leading-tight">
              Top 3 This Week
            </h2>
            <p className="mt-1 text-xs text-ima-text-secondary">Hours worked since Monday</p>
            <div className="h-px bg-ima-surface-light mt-4" aria-hidden="true" />

            {dashboard.top_hours_week.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  variant="compact"
                  icon={<Trophy className="h-5 w-5" aria-hidden="true" />}
                  title="No hours logged this week"
                  description="Once your students start work sessions, the weekly leader will appear here."
                />
              </div>
            ) : (
              <ul className="mt-2" role="list">
                {dashboard.top_hours_week.map((r, i) => {
                  const rank = i + 1;
                  const hoursLabel = formatHoursLabel(r.minutes);
                  return (
                    <li key={r.student_id}>
                      <Link
                        href={`/coach/students/${r.student_id}`}
                        aria-label={`View ${r.student_name} — ${hoursLabel}`}
                        className="flex items-center gap-3 py-3 min-h-[52px] -mx-2 px-2 rounded-md motion-safe:transition-colors hover:bg-ima-bg focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                      >
                        <span className="inline-flex items-center justify-center rounded-[6px] bg-ima-primary text-white text-[10px] font-semibold tracking-wider px-[7px] py-[3px] shrink-0 tabular-nums">
                          #{rank}
                        </span>
                        <div className="w-8 h-8 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center text-xs font-semibold text-ima-text-secondary shrink-0">
                          {initials(r.student_name)}
                        </div>
                        <p className="text-sm font-semibold text-ima-text truncate flex-1 leading-tight">
                          {r.student_name}
                        </p>
                        <p className="text-sm font-semibold text-ima-text tabular-nums shrink-0">
                          {hoursLabel}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Needs Attention Banner */}
        {atRiskStudents.length > 0 && (
          <section
            role="alert"
            aria-label="Students needing attention"
            className="mt-8 motion-safe:animate-fadeIn"
            style={{ animationDelay: "200ms" }}
          >
            <div className="bg-white border border-ima-border rounded-[14px] p-6">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-[8px] bg-ima-warning/10 flex items-center justify-center shrink-0">
                  <AlertTriangle
                    className="h-[18px] w-[18px] text-ima-warning"
                    aria-hidden="true"
                  />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-ima-text leading-tight">
                    {atRiskStudents.length} Student
                    {atRiskStudents.length !== 1 ? "s" : ""} Needing Attention
                  </h2>
                  <p className="mt-1 text-xs text-ima-text-secondary">
                    Review and reach out before they fall behind
                  </p>
                </div>
              </div>

              <ul className="mt-5 space-y-2" role="list">
                {atRiskStudents.map((student) => (
                  <li key={student.id}>
                    <Link
                      href={`/coach/students/${student.id}`}
                      className="group flex items-center gap-3 bg-ima-surface-light border border-ima-warning/10 rounded-[10px] px-4 py-3 min-h-[56px] motion-safe:transition-[transform,background-color,border-color] hover:translate-x-[2px] hover:bg-ima-warning/10 hover:border-ima-warning/10 focus-visible:outline-2 focus-visible:outline-ima-warning focus-visible:outline-offset-2"
                    >
                      <div className="w-10 h-10 rounded-full bg-white border border-ima-warning/10 flex items-center justify-center text-xs font-semibold text-ima-warning shrink-0">
                        {initials(student.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ima-text truncate leading-tight">
                          {student.name}
                        </p>
                        <p className="mt-[3px] text-[10px] font-medium text-ima-warning tracking-widest uppercase">
                          {student.atRiskReasons.join(" · ")}
                        </p>
                      </div>
                      <span className="inline-flex items-center px-2 py-[3px] rounded-full bg-ima-error/10 border border-ima-error/10 text-[10px] font-semibold uppercase tracking-wider text-ima-error shrink-0">
                        At Risk
                      </span>
                      <ArrowRight
                        className="h-[16px] w-[16px] text-ima-warning shrink-0 motion-safe:transition-transform group-hover:translate-x-[2px]"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {/* My Students */}
        <section
          aria-label="My students"
          className="mt-10 motion-safe:animate-fadeIn"
          style={{ animationDelay: "250ms" }}
        >
          <h2 className="text-xs font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
            My Students
          </h2>
          {enrichedStudents.length === 0 ? (
            <div className="mt-4 bg-white border border-ima-border rounded-[14px] p-6">
              <EmptyState
                variant="compact"
                icon={<Users className="h-5 w-5" />}
                title="No students assigned yet"
                description="Students will appear here once the owner assigns them to you."
                action={
                  <Link href="/coach/invites" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Invite Students
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-[14px]">
              {enrichedStudents.map((student) => {
                const atRisk = student.isAtRisk;
                return (
                  <Link
                    key={student.id}
                    href={`/coach/students/${student.id}`}
                    aria-label={`${student.name} — ${atRisk ? "at risk, " : ""}roadmap step ${student.currentRoadmapStep} of ${ROADMAP_STEPS.length}`}
                    className={[
                      "block rounded-[14px] border p-6 min-h-[160px] motion-safe:transition-[transform,border-color,background-color] hover:-translate-y-[1px] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                      atRisk
                        ? "bg-ima-surface-light border-ima-warning/10 hover:border-ima-warning/10"
                        : "bg-white border-ima-border hover:border-ima-border",
                    ].join(" ")}
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={[
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 border",
                            atRisk
                              ? "bg-white border-ima-warning/10 text-ima-warning"
                              : "bg-ima-surface-light border-ima-border text-ima-text-secondary",
                          ].join(" ")}
                        >
                          {initials(student.name)}
                        </div>
                        <p className="text-sm font-semibold text-ima-text truncate">
                          {student.name}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {(student.skippedDays ?? 0) > 0 && (
                          <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-ima-warning/10 border border-ima-warning/10 text-[10px] font-semibold uppercase tracking-wider text-ima-warning">
                            {student.skippedDays} skipped
                          </span>
                        )}
                        {student.isNew ? (
                          <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-ima-surface-accent border border-ima-primary/20 text-[10px] font-semibold uppercase tracking-wider text-ima-primary">
                            New
                          </span>
                        ) : atRisk ? (
                          <span className="inline-flex items-center px-2 py-[2px] rounded-full bg-ima-error/10 border border-ima-error/10 text-[10px] font-semibold uppercase tracking-wider text-ima-error">
                            At Risk
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Divider */}
                    <div
                      className={`h-px mt-5 ${atRisk ? "bg-ima-warning/10" : "bg-ima-surface-light"}`}
                      aria-hidden="true"
                    />

                    {/* Mini-stats grid */}
                    <div className="mt-5 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
                          Last Active
                        </p>
                        <p className="mt-[6px] text-sm font-semibold text-ima-text tabular-nums">
                          {student.lastActiveLabel}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
                          Today&apos;s Report
                        </p>
                        {student.todayReportSubmitted ? (
                          <p className="mt-[6px] flex items-center gap-[5px] text-sm font-semibold text-ima-success">
                            <CheckCircle2
                              className="h-[13px] w-[13px]"
                              aria-hidden="true"
                            />
                            Submitted
                          </p>
                        ) : (
                          <p className="mt-[6px] flex items-center gap-[6px] text-sm font-semibold text-ima-warning">
                            <span
                              className="inline-block h-[7px] w-[7px] rounded-full bg-ima-warning"
                              aria-hidden="true"
                            />
                            Pending
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
                          Roadmap
                        </p>
                        <p className="mt-[6px] text-sm font-semibold text-ima-text tabular-nums">
                          Step {student.currentRoadmapStep}
                          <span className="text-ima-text-secondary">/{ROADMAP_STEPS.length}</span>
                        </p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
