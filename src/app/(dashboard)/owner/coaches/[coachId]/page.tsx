import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { COACH_CONFIG } from "@/lib/config";
import { getToday } from "@/lib/utils";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/Card";
import { StudentCard } from "@/components/coach/StudentCard";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";
import {
  ChevronLeft,
  Users,
  Star,
  FileText,
  AlertTriangle,
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
};

export default async function CoachDetailPage({
  params,
}: {
  params: Promise<{ coachId: string }>;
}) {
  await requireRole("owner");
  const { coachId } = await params;
  const admin = createAdminClient();

  // Fetch coach profile
  const { data: coach, error: coachError } = await admin
    .from("users")
    .select("id, name, email, status, joined_at")
    .eq("id", coachId)
    .eq("role", "coach")
    .single();

  if (coachError) {
    console.error("[owner coach detail] Failed to load coach:", coachError);
  }
  if (!coach) notFound();

  // Fetch assigned students
  const { data: students, error: studentsError } = await admin
    .from("users")
    .select("id, name, email, status, joined_at")
    .eq("role", "student")
    .eq("coach_id", coachId)
    .eq("status", "active");

  if (studentsError) {
    console.error(
      "[owner coach detail] Failed to load students:",
      studentsError
    );
  }

  const studentList = students ?? [];
  const studentIds = studentList.map((s) => s.id);

  // Parallel enrichment fetch
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
            .select("student_id, date, star_rating, reviewed_by, submitted_at")
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
    console.error(
      "[owner coach detail] Failed to load sessions:",
      sessionsResult.error
    );
  }
  if (reportsResult.error) {
    console.error(
      "[owner coach detail] Failed to load reports:",
      reportsResult.error
    );
  }
  if (roadmapResult.error) {
    console.error(
      "[owner coach detail] Failed to load roadmap:",
      roadmapResult.error
    );
  }

  // Build lookup maps
  const latestSessionMap = new Map<string, string>();
  for (const s of sessionsResult.data ?? []) {
    if (!latestSessionMap.has(s.student_id)) {
      latestSessionMap.set(s.student_id, s.date);
    }
  }

  const today = getToday();
  const nowMs = new Date(today + "T23:59:59Z").getTime();
  const sevenDaysAgo = new Date(
    nowMs - COACH_CONFIG.reportInboxDays * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  const latestReportMap = new Map<string, string>();
  const todayReportMap = new Map<string, boolean>();
  for (const r of reportsResult.data ?? []) {
    if (
      !latestReportMap.has(r.student_id) ||
      r.date > (latestReportMap.get(r.student_id) ?? "")
    ) {
      latestReportMap.set(r.student_id, r.date);
    }
    if (r.date === today) {
      todayReportMap.set(r.student_id, true);
    }
  }

  const recentRatings = new Map<string, number[]>();
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

  // Compute 4 coach-level stat cards
  // Avg student rating (7-day)
  const allRatings = [...recentRatings.values()].flat();
  const avgRatingStr =
    allRatings.length > 0
      ? (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(1)
      : "—";

  // Report review rate
  let submittedCount = 0;
  let reviewedCount = 0;
  const reportsData = reportsResult.data ?? [];
  for (const r of reportsData) {
    if (r.date >= sevenDaysAgo && r.submitted_at !== null) {
      submittedCount++;
      if (r.reviewed_by !== null) reviewedCount++;
    }
  }
  const reviewRate =
    submittedCount > 0 ? Math.round((reviewedCount / submittedCount) * 100) : 0;

  // Enrich students for StudentCard
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

  // Sort: at-risk first, then alphabetical
  enrichedStudents.sort((a, b) => {
    if (a.isAtRisk && !b.isAtRisk) return -1;
    if (!a.isAtRisk && b.isAtRisk) return 1;
    return a.name.localeCompare(b.name);
  });

  const atRiskCount = enrichedStudents.filter((s) => s.isAtRisk).length;
  const coachInitial = coach.name.charAt(0).toUpperCase();

  return (
    <div className="px-4">
      {/* Back link */}
      <Link href="/owner/coaches">
        <Button variant="ghost" size="sm">
          <ChevronLeft className="h-4 w-4 mr-1" aria-hidden="true" />
          Back to Coaches
        </Button>
      </Link>

      {/* Coach header */}
      <div className="flex items-center gap-4 mt-4">
        <div className="w-14 h-14 rounded-full bg-ima-primary flex items-center justify-center text-xl font-bold text-white shrink-0">
          {coachInitial}
        </div>
        <div>
          <h1 className="text-xl font-bold text-ima-text">{coach.name}</h1>
          <p className="text-sm text-ima-text-secondary">{coach.email}</p>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {/* Student Count */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-ima-primary/10 flex items-center justify-center shrink-0">
              <Users
                className="h-5 w-5 text-ima-primary"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums slashed-zero text-ima-text">
                {studentList.length}
              </p>
              <p className="text-xs text-ima-text-secondary">Students</p>
            </div>
          </CardContent>
        </Card>

        {/* Avg Rating */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-ima-primary/10 flex items-center justify-center shrink-0">
              <Star
                className="h-5 w-5 text-ima-primary"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums slashed-zero text-ima-text">{avgRatingStr}</p>
              <p className="text-xs text-ima-text-secondary">Avg Rating</p>
            </div>
          </CardContent>
        </Card>

        {/* Review Rate */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-ima-primary/10 flex items-center justify-center shrink-0">
              <FileText
                className="h-5 w-5 text-ima-primary"
                aria-hidden="true"
              />
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums slashed-zero text-ima-text">{reviewRate}%</p>
              <p className="text-xs text-ima-text-secondary">Review Rate</p>
            </div>
          </CardContent>
        </Card>

        {/* At-Risk */}
        <Card>
          <CardContent className="p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-ima-warning/10 flex items-center justify-center shrink-0">
              <AlertTriangle
                className="h-5 w-5 text-ima-warning"
                aria-hidden="true"
              />
            </div>
            <div>
              <p
                className={
                  atRiskCount > 0
                    ? "text-2xl font-bold tabular-nums slashed-zero text-ima-error"
                    : "text-2xl font-bold tabular-nums slashed-zero text-ima-text"
                }
              >
                {atRiskCount}
              </p>
              <p className="text-xs text-ima-text-secondary">At-Risk</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Assigned Students */}
      <div className="mt-6">
        <h2 className="text-base font-semibold text-ima-text mb-4">
          Assigned Students
        </h2>
        {enrichedStudents.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={<Users className="h-5 w-5" />}
            title="No students assigned"
            description="Assign students from the Assignments page."
            action={
              <Link href="/owner/assignments" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Manage Assignments
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrichedStudents.map((student) => (
              <StudentCard
                key={student.id}
                student={student}
                basePath="/owner/students"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
