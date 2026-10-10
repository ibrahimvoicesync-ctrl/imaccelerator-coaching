import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeekStart } from "@/lib/utils";
import { emailCountsFromReport } from "@/lib/emails";

export type WeeklyMomentum = {
  /** Total completed work minutes across the whole cohort since Monday. */
  cohortMinutes: number;
  /** How many students logged any work this week. */
  activeStudents: number;
  /** This student's own completed minutes this week. */
  myMinutes: number;
};

/**
 * Weekly community momentum — the cohort's collective effort since Monday plus
 * the student's own contribution. Deliberately NOT a ranked leaderboard: the
 * brand is calm and anti-gamified, so this serves belonging (we're all putting
 * in work) and personal progress (here's your share) without the comparison
 * dread of public ranking. Spans both student lanes ('student', 'student_diy').
 * Server-only (admin client).
 */
export async function getWeeklyMomentum(studentId: string): Promise<WeeklyMomentum> {
  const admin = createAdminClient();
  const weekStart = getWeekStart();

  // Cohort-wide completed sessions since Monday can exceed PostgREST's
  // max_rows (1000) cap. An unbounded select would silently truncate, so the
  // sum would undercount cohort minutes and the active-student count. Page
  // through every row with a stable order (`id`) so the aggregate is complete
  // and deterministic.
  const PAGE_SIZE = 1000;
  async function fetchAllWeeklySessions() {
    const rows: { student_id: string; duration_minutes: number }[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("work_sessions")
        .select("student_id, duration_minutes")
        .eq("status", "completed")
        .gte("date", weekStart)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { data: null, error };
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return { data: rows, error: null };
  }

  const [sessionsRes, studentsRes] = await Promise.all([
    fetchAllWeeklySessions(),
    admin.from("users").select("id").in("role", ["student", "student_diy"]),
  ]);

  if (sessionsRes.error) {
    console.error("[momentum] Failed to load sessions:", sessionsRes.error);
    return { cohortMinutes: 0, activeStudents: 0, myMinutes: 0 };
  }
  if (studentsRes.error) {
    console.error("[momentum] Failed to load students:", studentsRes.error);
    return { cohortMinutes: 0, activeStudents: 0, myMinutes: 0 };
  }

  const studentIds = new Set((studentsRes.data ?? []).map((s) => s.id));
  const minutesById = new Map<string, number>();
  for (const row of sessionsRes.data ?? []) {
    if (!studentIds.has(row.student_id)) continue; // count students only
    minutesById.set(
      row.student_id,
      (minutesById.get(row.student_id) ?? 0) + (row.duration_minutes ?? 0),
    );
  }

  let cohortMinutes = 0;
  let activeStudents = 0;
  for (const minutes of minutesById.values()) {
    if (minutes <= 0) continue;
    cohortMinutes += minutes;
    activeStudents += 1;
  }

  return {
    cohortMinutes,
    activeStudents,
    myMinutes: minutesById.get(studentId) ?? 0,
  };
}

export type WeeklyEmailMomentum = {
  /** Total emails sent across the cohort since Monday (drafts included). */
  cohortEmails: number;
  /** How many students sent any email this week. */
  activeStudents: number;
  /** This student's own emails this week. */
  myEmails: number;
};

/**
 * Same belonging-not-ranking idea as getWeeklyMomentum, measured in emails
 * sent. Only the 'student' lane logs emails (daily reports / quick log), so
 * DIY students aren't counted. Server-only (admin client).
 */
export async function getWeeklyEmailMomentum(studentId: string): Promise<WeeklyEmailMomentum> {
  const admin = createAdminClient();
  const weekStart = getWeekStart();
  const empty = { cohortEmails: 0, activeStudents: 0, myEmails: 0 };

  // Paged for the same PostgREST max_rows reason as getWeeklyMomentum.
  const PAGE_SIZE = 1000;
  type Row = {
    student_id: string;
    brands_contacted: number;
    influencers_contacted: number;
    outreach_count: number;
  };
  async function fetchAllWeeklyReports() {
    const rows: Row[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await admin
        .from("daily_reports")
        .select("student_id, brands_contacted, influencers_contacted, outreach_count")
        .gte("date", weekStart)
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) return { data: null, error };
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return { data: rows, error: null };
  }

  const [reportsRes, studentsRes] = await Promise.all([
    fetchAllWeeklyReports(),
    admin.from("users").select("id").eq("role", "student"),
  ]);

  if (reportsRes.error) {
    console.error("[momentum] Failed to load reports:", reportsRes.error);
    return empty;
  }
  if (studentsRes.error) {
    console.error("[momentum] Failed to load students:", studentsRes.error);
    return empty;
  }

  const studentIds = new Set((studentsRes.data ?? []).map((s) => s.id));
  const emailsById = new Map<string, number>();
  for (const row of reportsRes.data ?? []) {
    if (!studentIds.has(row.student_id)) continue;
    emailsById.set(
      row.student_id,
      (emailsById.get(row.student_id) ?? 0) + emailCountsFromReport(row).total,
    );
  }

  let cohortEmails = 0;
  let activeStudents = 0;
  for (const emails of emailsById.values()) {
    if (emails <= 0) continue;
    cohortEmails += emails;
    activeStudents += 1;
  }

  return { cohortEmails, activeStudents, myEmails: emailsById.get(studentId) ?? 0 };
}
