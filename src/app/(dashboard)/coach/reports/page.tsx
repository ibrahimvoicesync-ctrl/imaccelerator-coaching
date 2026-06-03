import Link from "next/link";
import { FileText, Clock, CheckCircle, Timer } from "lucide-react";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { COACH_CONFIG } from "@/lib/config";
import { getToday } from "@/lib/utils";
import { CoachReportsClient } from "@/components/coach/CoachReportsClient";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";

export default async function CoachReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ reviewed?: string; student_id?: string }>;
}) {
  const user = await requireRole("coach");
  const admin = createAdminClient();
  const today = getToday();

  const nowMs = new Date(today + "T23:59:59Z").getTime();
  const sevenDaysAgo = new Date(
    nowMs - COACH_CONFIG.reportInboxDays * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .split("T")[0];

  const { data: students, error: studentsError } = await admin
    .from("users")
    .select("id, name")
    .eq("role", "student")
    .eq("coach_id", user.id)
    .eq("status", "active");

  if (studentsError) {
    console.error("[coach/reports] Failed to load students:", studentsError);
  }

  const studentList = students ?? [];
  const studentIds = studentList.map((s) => s.id);

  const shellHeader = (
    <header className="motion-safe:animate-fadeIn">
      <p className="text-xs font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
        Inbox
      </p>
      <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight">
        Reports
      </h1>
      <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
        Review student reports from the last 7 days
      </p>
    </header>
  );

  if (studentIds.length === 0) {
    return (
      <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
        <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
          {shellHeader}
          <div
            className="mt-10 bg-white border border-ima-border rounded-[14px] p-6 motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <EmptyState
              variant="compact"
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              title="No students assigned yet"
              description="Reports will appear here once students are assigned to you."
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
        </div>
      </div>
    );
  }

  const { data: reports, error: reportsError } = await admin
    .from("daily_reports")
    .select(
      "id, student_id, date, hours_worked, star_rating, outreach_count, wins, improvements, submitted_at, reviewed_by, reviewed_at"
    )
    .in("student_id", studentIds)
    .gte("date", sevenDaysAgo)
    .not("submitted_at", "is", null)
    .order("date", { ascending: false });

  if (reportsError) {
    console.error("[coach/reports] Failed to load reports:", reportsError);
  }

  const allReports = reports ?? [];

  const reportIds = allReports.map((r) => r.id);
  const { data: commentsData } = reportIds.length > 0
    ? await admin
        .from("report_comments")
        .select("report_id, comment")
        .in("report_id", reportIds)
    : { data: [] };

  const commentMap: Record<string, string> = {};
  for (const c of commentsData ?? []) {
    commentMap[c.report_id] = c.comment;
  }

  const totalReports = allReports.length;
  const pendingCount = allReports.filter((r) => r.reviewed_by === null).length;
  const reviewedCount = allReports.filter((r) => r.reviewed_by !== null).length;
  const avgHours =
    allReports.length > 0
      ? allReports.reduce((sum, r) => sum + (r.hours_worked ?? 0), 0) /
        allReports.length
      : 0;

  const sp = await searchParams;
  const filter = sp.reviewed ?? "false";

  let filteredReports = allReports;
  if (filter === "false") {
    filteredReports = allReports.filter((r) => r.reviewed_by === null);
  } else if (filter === "true") {
    filteredReports = allReports.filter((r) => r.reviewed_by !== null);
  }
  if (sp.student_id) {
    filteredReports = filteredReports.filter(
      (r) => r.student_id === sp.student_id
    );
  }

  const reportsWithComments = filteredReports.map((r) => ({
    ...r,
    existingComment: commentMap[r.id] ?? null,
  }));

  const studentMap: Record<string, string> = {};
  for (const s of studentList) {
    studentMap[s.id] = s.name;
  }

  const stats = [
    {
      label: "Total Reports",
      value: String(totalReports),
      icon: FileText,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
      valueColor: "text-ima-text",
    },
    {
      label: "Pending",
      value: String(pendingCount),
      icon: Clock,
      iconBg: "bg-ima-warning/10",
      iconColor: "text-ima-warning",
      valueColor: pendingCount > 0 ? "text-ima-warning" : "text-ima-text",
    },
    {
      label: "Reviewed",
      value: String(reviewedCount),
      icon: CheckCircle,
      iconBg: "bg-ima-success/10",
      iconColor: "text-ima-success",
      valueColor: "text-ima-text",
    },
    {
      label: "Avg Hours",
      value: avgHours.toFixed(1),
      icon: Timer,
      iconBg: "bg-ima-surface-light",
      iconColor: "text-ima-text-secondary",
      valueColor: "text-ima-text",
    },
  ];

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {shellHeader}

        {/* Stats row */}
        <section
          aria-label="Report totals"
          className="mt-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px] motion-safe:animate-fadeIn"
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
                <p className={`text-2xl font-semibold leading-none tabular-nums tracking-tight ${s.valueColor}`}>
                  {s.value}
                </p>
                <p className="mt-[6px] text-xs text-ima-text-secondary">{s.label}</p>
              </div>
            </div>
          ))}
        </section>

        <div
          className="motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <CoachReportsClient
            key={`${filter}-${sp.student_id ?? ""}`}
            reports={reportsWithComments}
            students={studentList}
            studentMap={studentMap}
            currentFilter={filter}
            currentStudentId={sp.student_id ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
