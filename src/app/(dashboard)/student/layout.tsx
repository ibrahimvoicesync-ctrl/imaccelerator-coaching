import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProgressBanner } from "@/components/student/ProgressBanner";
import { getTodayUTC } from "@/lib/utils";
import { emailCountsFromReport } from "@/lib/emails";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("student");
  const admin = createAdminClient();
  const today = getTodayUTC();

  // Four parallel queries for banner data
  const [lifetimeResult, todayReportResult, userResult, step7Result] = await Promise.all([
    // Lifetime outreach + revenue/profit — fetch all report totals and sum in JS
    admin
      .from("daily_reports")
      .select("brands_contacted, influencers_contacted, outreach_count, revenue, profit")
      .eq("student_id", user.id),

    // Today's report — for daily KPIs
    admin
      .from("daily_reports")
      .select("brands_contacted, influencers_contacted, outreach_count, calls_joined")
      .eq("student_id", user.id)
      .eq("date", today)
      .maybeSingle(),

    // User joined_at — for pace-based RAG calculation
    admin
      .from("users")
      .select("joined_at")
      .eq("id", user.id)
      .single(),

    // Step 7 completion — RAG colors activate only after outreach prep is done
    admin
      .from("roadmap_progress")
      .select("status")
      .eq("student_id", user.id)
      .eq("step_number", 7)
      .maybeSingle(),
  ]);

  if (lifetimeResult.error) {
    console.error("[student layout] Failed to load lifetime KPIs:", lifetimeResult.error);
  }
  if (todayReportResult.error) {
    console.error("[student layout] Failed to load today's report:", todayReportResult.error);
  }
  if (userResult.error) {
    console.error("[student layout] Failed to load user:", userResult.error);
  }

  const allReports = lifetimeResult.data ?? [];
  const lifetimeOutreach = allReports.reduce(
    (sum, r) => sum + emailCountsFromReport(r).total,
    0,
  );
  const lifetimeRevenue = allReports.reduce((sum, r) => sum + Number(r.revenue ?? 0), 0);
  const lifetimeProfit = allReports.reduce((sum, r) => sum + Number(r.profit ?? 0), 0);
  const todayReport = todayReportResult.data;
  const userRow = userResult.data;

  // Lifetime + today's minutes. A long-tenured student can exceed PostgREST's
  // max_rows (1000) cap on completed sessions, which would silently truncate
  // the lifetime-hours sum. Page through all rows (stable order by `id`) so the
  // lifetime total is complete.
  const SESSION_PAGE = 1000;
  const sessions: { duration_minutes: number; date: string }[] = [];
  let sessionsError: unknown = null;
  for (let from = 0; ; from += SESSION_PAGE) {
    const { data, error } = await admin
      .from("work_sessions")
      .select("duration_minutes, date")
      .eq("student_id", user.id)
      .eq("status", "completed")
      .order("id", { ascending: true })
      .range(from, from + SESSION_PAGE - 1);
    if (error) {
      sessionsError = error;
      break;
    }
    sessions.push(...(data ?? []));
    if (!data || data.length < SESSION_PAGE) break;
  }

  if (sessionsError) {
    console.error("[student layout] Failed to load sessions:", sessionsError);
  }
  const dailyMinutesWorked = sessions
    .filter((s) => s.date === today)
    .reduce((sum, s) => sum + s.duration_minutes, 0);
  const lifetimeMinutesWorked = sessions.reduce(
    (sum, s) => sum + s.duration_minutes,
    0,
  );

  return (
    <>
      <ProgressBanner
        lifetimeOutreach={lifetimeOutreach}
        lifetimeMinutesWorked={lifetimeMinutesWorked}
        dailyOutreach={emailCountsFromReport(todayReport).total}
        dailyMinutesWorked={dailyMinutesWorked}
        callsJoined={todayReport?.calls_joined ?? 0}
        lifetimeRevenue={lifetimeRevenue}
        lifetimeProfit={lifetimeProfit}
        joinedAt={userRow?.joined_at ?? new Date().toISOString()}
        outreachStarted={step7Result.data?.status === "completed"}
      />
      {children}
    </>
  );
}
