import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { COACH_CONFIG } from "@/lib/config";
import { getToday } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";
import { Users, Shield, UserSquare2 } from "lucide-react";
import Link from "next/link";
import { CoachCard } from "@/components/owner/CoachCard";
import { PaginationControls } from "@/components/ui/PaginationControls";


const PAGE_SIZE = 25;

export default async function OwnerCoachesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requireRole("owner");
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const admin = createAdminClient();
  const today = getToday();
  const nowMs = new Date(today + "T23:59:59Z").getTime();
  const sevenDaysAgo = new Date(
    nowMs - COACH_CONFIG.reportInboxDays * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  // Paginated coaches + global active-student count in parallel
  const [coachesResult, studentCountResult] = await Promise.all([
    admin
      .from("users")
      .select("id, name, email, status, joined_at", { count: "estimated" })
      .eq("role", "coach")
      .order("name")
      .range(from, to),
    admin
      .from("users")
      .select("id", { count: "exact", head: true })
      .in("role", ["student", "student_diy"])
      .eq("status", "active"),
  ]);

  if (coachesResult.error) {
    console.error("[owner coaches] Failed to load coaches:", coachesResult.error);
  }
  if (studentCountResult.error) {
    console.error(
      "[owner coaches] Failed to load student count:",
      studentCountResult.error,
    );
  }

  const { data: coaches, count } = coachesResult;
  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const coachList = coaches ?? [];
  const totalStudents = studentCountResult.count ?? 0;
  const totalCoaches = count ?? 0;

  // Only fetch enrichment data if we have coaches on this page
  let enrichedCoaches: Array<{
    id: string;
    name: string;
    email: string;
    status: string;
    joined_at: string;
    studentCount: number;
    avgRating: number | null;
  }> = [];

  if (coachList.length > 0) {
    const coachIds = coachList.map((c) => c.id);

    const [studentsResult, reportsResult] = await Promise.all([
      admin
        .from("users")
        .select("id, coach_id")
        .eq("role", "student")
        .eq("status", "active")
        .in("coach_id", coachIds),
      admin
        .from("daily_reports")
        .select("student_id, star_rating")
        .gte("date", sevenDaysAgo)
        .not("star_rating", "is", null),
    ]);

    if (studentsResult.error) {
      console.error("[owner coaches] Failed to load students:", studentsResult.error);
    }
    if (reportsResult.error) {
      console.error("[owner coaches] Failed to load reports:", reportsResult.error);
    }

    // Build lookup maps
    const studentsByCoach = new Map<string, number>();
    const studentCoachMap = new Map<string, string>();

    for (const student of studentsResult.data ?? []) {
      if (student.coach_id) {
        studentsByCoach.set(
          student.coach_id,
          (studentsByCoach.get(student.coach_id) ?? 0) + 1
        );
        studentCoachMap.set(student.id, student.coach_id);
      }
    }

    const coachRatings = new Map<string, number[]>();
    for (const report of reportsResult.data ?? []) {
      const coachId = studentCoachMap.get(report.student_id);
      if (coachId && report.star_rating !== null) {
        const arr = coachRatings.get(coachId) ?? [];
        arr.push(report.star_rating);
        coachRatings.set(coachId, arr);
      }
    }

    enrichedCoaches = coachList.map((coach) => ({
      ...coach,
      studentCount: studentsByCoach.get(coach.id) ?? 0,
      avgRating: (() => {
        const ratings = coachRatings.get(coach.id);
        if (!ratings || ratings.length === 0) return null;
        return ratings.reduce((a, b) => a + b, 0) / ratings.length;
      })(),
    }));
  }

  const statCards = [
    {
      label: "Total Coaches",
      value: String(totalCoaches),
      icon: Shield,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
    },
    {
      label: "Active Students",
      value: String(totalStudents),
      icon: Users,
      iconBg: "bg-ima-success/10",
      iconColor: "text-ima-success",
    },
    {
      label: "Max Per Coach",
      value: String(COACH_CONFIG.maxStudentsPerCoach),
      icon: UserSquare2,
      iconBg: "bg-ima-surface-light",
      iconColor: "text-ima-text-secondary",
    },
  ];

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
          >
            Coaches
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            The team on the ground
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            ~{totalCoaches} coach{totalCoaches !== 1 ? "es" : ""} on the platform
          </p>
        </header>

        {/* Stats row */}
        <section
          aria-label="Coach overview"
          className="mt-9 grid grid-cols-1 sm:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          {statCards.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]"
            >
              <div
                className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${s.iconBg}`}
              >
                <s.icon
                  className={`h-[18px] w-[18px] ${s.iconColor}`}
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[24px] font-semibold leading-none tabular-nums slashed-zero tracking-[-0.01em] text-ima-text">
                  {s.value}
                </p>
                <p
                  className="mt-[6px] text-[10px] font-semibold uppercase tracking-[0.14em] text-ima-text-secondary"
                >
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Coach list */}
        {enrichedCoaches.length === 0 ? (
          <div
            className="mt-8 bg-white border border-ima-border rounded-[14px] p-6 motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <EmptyState
              icon={<Users className="h-6 w-6" aria-hidden="true" />}
              title="No coaches yet"
              description="Coaches will appear here once invited and registered."
              action={
                <Link
                  href="/owner/invites"
                  className={buttonVariants({ variant: "primary" })}
                >
                  Invite Coaches
                </Link>
              }
            />
          </div>
        ) : (
          <div
            className="motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-[14px]">
              {enrichedCoaches.map((coach) => (
                <CoachCard key={coach.id} coach={coach} />
              ))}
            </div>
            <PaginationControls
              page={page}
              totalPages={totalPages}
              basePath="/owner/coaches"
            />
          </div>
        )}
      </div>
    </div>
  );
}
