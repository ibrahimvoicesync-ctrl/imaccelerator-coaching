import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeekStart } from "@/lib/utils";

export type DailyHours = { day: string; hours: number };

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * This week's completed work hours for one student, bucketed Monday→Sunday
 * (rounded to 0.1h). Days with no work return 0 so the chart always shows a
 * full week. Server-only (admin client).
 */
export async function getWeeklyHoursByDay(studentId: string): Promise<DailyHours[]> {
  const admin = createAdminClient();
  const weekStart = getWeekStart();

  const { data, error } = await admin
    .from("work_sessions")
    .select("date, duration_minutes")
    .eq("student_id", studentId)
    .eq("status", "completed")
    .gte("date", weekStart);
  if (error) {
    console.error("[weekly-hours] failed to load sessions:", error);
  }

  const minutesByDate = new Map<string, number>();
  for (const r of data ?? []) {
    minutesByDate.set(r.date, (minutesByDate.get(r.date) ?? 0) + (r.duration_minutes ?? 0));
  }

  const start = new Date(`${weekStart}T00:00:00`);
  const buckets: DailyHours[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
    const mins = minutesByDate.get(dateStr) ?? 0;
    buckets.push({ day: DOW[d.getDay()], hours: Math.round((mins / 60) * 10) / 10 });
  }
  return buckets;
}
