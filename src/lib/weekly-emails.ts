import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeekStart } from "@/lib/utils";
import { emailCountsFromReport, type EmailCounts } from "@/lib/emails";

export type DailyEmails = { day: string } & EmailCounts;

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * This week's emails sent for one student, bucketed Monday→Sunday from
 * daily_reports (drafts included — see lib/emails). Days with nothing logged
 * return zeros so the chart always shows a full week. Server-only.
 */
export async function getWeeklyEmailsByDay(studentId: string): Promise<DailyEmails[]> {
  const admin = createAdminClient();
  const weekStart = getWeekStart();

  const { data, error } = await admin
    .from("daily_reports")
    .select("date, brands_contacted, influencers_contacted, outreach_count")
    .eq("student_id", studentId)
    .gte("date", weekStart);
  if (error) {
    console.error("[weekly-emails] failed to load reports:", error);
  }

  const byDate = new Map<string, EmailCounts>();
  for (const r of data ?? []) byDate.set(r.date, emailCountsFromReport(r));

  const start = new Date(`${weekStart}T00:00:00`);
  const buckets: DailyEmails[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    const counts = byDate.get(dateStr) ?? { brands: 0, influencers: 0, total: 0 };
    buckets.push({ day: DOW[d.getDay()], ...counts });
  }
  return buckets;
}
