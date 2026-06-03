import Link from "next/link";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { COACH_CONFIG, ROADMAP_STEPS } from "@/lib/config";
import { getToday } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

type EnrichedStudent = {
  id: string;
  name: string;
  isNew: boolean;
  isAtRisk: boolean;
  atRiskReasons: string[];
  lastActiveLabel: string;
  todayReportSubmitted: boolean;
  currentRoadmapStep: number;
};

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function CoachStudentsPage() {
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
    console.error("[coach students] Failed to load students:", studentsError);
  }

  const studentList = students ?? [];
  const studentIds = studentList.map((s) => s.id);

  const [sessionsResult, reportsResult, roadmapResult] =
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
        ])
      : ([
          { data: null, error: null },
          { data: null, error: null },
          { data: null, error: null },
        ] as const);

  if (sessionsResult.error) {
    console.error("[coach students] Failed to load sessions:", sessionsResult.error);
  }
  if (reportsResult.error) {
    console.error("[coach students] Failed to load reports:", reportsResult.error);
  }
  if (roadmapResult.error) {
    console.error("[coach students] Failed to load roadmap:", roadmapResult.error);
  }

  // Build lookup maps
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

  for (const r of reportsResult.data ?? []) {
    if (r.date >= sevenDaysAgo && r.star_rating !== null) {
      const arr = recentRatings.get(r.student_id) ?? [];
      arr.push(r.star_rating);
      recentRatings.set(r.student_id, arr);
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
    };
  });

  enrichedStudents.sort((a, b) => {
    if (a.isAtRisk && !b.isAtRisk) return -1;
    if (!a.isAtRisk && b.isAtRisk) return 1;
    return a.name.localeCompare(b.name);
  });

  const atRiskCount = enrichedStudents.filter((s) => s.isAtRisk).length;
  const newCount = enrichedStudents.filter((s) => s.isNew).length;

  const stats = [
    {
      label: "Total Assigned",
      value: String(studentList.length),
      icon: Users,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
      valueColor: "text-ima-text",
    },
    {
      label: "At Risk",
      value: String(atRiskCount),
      icon: AlertTriangle,
      iconBg: "bg-ima-warning/10",
      iconColor: "text-ima-warning",
      valueColor: atRiskCount > 0 ? "text-ima-error" : "text-ima-text",
    },
    {
      label: "New",
      value: String(newCount),
      icon: Sparkles,
      iconBg: "bg-ima-surface-light",
      iconColor: "text-ima-text-secondary",
      valueColor: "text-ima-text",
    },
  ];

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Header */}
        <header className="motion-safe:animate-fadeIn">
          <p className="text-xs font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
            Roster
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight">
            My Students
          </h1>
          <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
            {studentList.length} student{studentList.length !== 1 ? "s" : ""} assigned to you
          </p>
        </header>

        {/* Stat strip */}
        {studentList.length > 0 && (
          <section
            aria-label="Roster overview"
            className="mt-9 grid grid-cols-1 sm:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
            style={{ animationDelay: "50ms" }}
          >
            {stats.map((s) => (
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
                    className={`text-2xl font-semibold leading-none tabular-nums ${s.valueColor}`}
                  >
                    {s.value}
                  </p>
                  <p className="mt-[6px] text-xs text-ima-text-secondary">{s.label}</p>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Students grid */}
        <section
          aria-label="My students"
          className="mt-10 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <h2 className="text-xs font-semibold tracking-[0.2em] text-ima-text-secondary uppercase">
            All Students
          </h2>

          {enrichedStudents.length === 0 ? (
            <div className="mt-4 bg-white border border-ima-border rounded-[14px] p-6">
              <EmptyState
                variant="compact"
                icon={<Users className="h-5 w-5" aria-hidden="true" />}
                title="No students assigned yet"
                description="Students will appear here once the owner assigns them to you."
                action={
                  <Link
                    href="/coach/invites"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
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

                    {/* Mini-stats */}
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
                            <CheckCircle2 className="h-[13px] w-[13px]" aria-hidden="true" />
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

                    {/* Risk reasons row */}
                    {atRisk && student.atRiskReasons.length > 0 && (
                      <p className="mt-5 text-[10px] font-medium text-ima-warning tracking-widest uppercase">
                        {student.atRiskReasons.join(" · ")}
                      </p>
                    )}
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
