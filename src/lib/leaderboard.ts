import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeekStart } from "@/lib/utils";

export type LeaderboardRow = {
  student_id: string;
  name: string;
  minutes: number;
};

/**
 * Weekly work leaderboard — total completed work-session minutes per student
 * since Monday, highest first. Spans both student lanes ('student' and
 * 'student_diy'); only those roles are ranked. Server-only (admin client).
 */
export async function getWeeklyWorkLeaderboard(limit = 5): Promise<LeaderboardRow[]> {
  const admin = createAdminClient();
  const weekStart = getWeekStart();

  const [sessionsRes, studentsRes] = await Promise.all([
    admin
      .from("work_sessions")
      .select("student_id, duration_minutes")
      .eq("status", "completed")
      .gte("date", weekStart),
    admin.from("users").select("id, name").in("role", ["student", "student_diy"]),
  ]);

  if (sessionsRes.error) {
    console.error("[leaderboard] Failed to load sessions:", sessionsRes.error);
    return [];
  }
  if (studentsRes.error) {
    console.error("[leaderboard] Failed to load students:", studentsRes.error);
    return [];
  }

  const nameById = new Map((studentsRes.data ?? []).map((s) => [s.id, s.name]));
  const minutesById = new Map<string, number>();
  for (const row of sessionsRes.data ?? []) {
    if (!nameById.has(row.student_id)) continue; // rank students only
    minutesById.set(
      row.student_id,
      (minutesById.get(row.student_id) ?? 0) + (row.duration_minutes ?? 0),
    );
  }

  return [...minutesById.entries()]
    .map(([student_id, minutes]) => ({
      student_id,
      name: nameById.get(student_id) ?? "Student",
      minutes,
    }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}
