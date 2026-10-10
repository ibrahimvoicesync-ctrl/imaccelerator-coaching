import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type CoachNote = {
  comment: string;
  created_at: string;
  coach_name: string;
};

/**
 * The most recent coach comment across all of a student's daily reports, with
 * the coach's name. Returns null when the student has never received one.
 * Server-only (admin client).
 */
export async function getLatestCoachComment(studentId: string): Promise<CoachNote | null> {
  const admin = createAdminClient();

  const { data: reports, error: reportsError } = await admin
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId);
  if (reportsError) {
    console.error("[coach-comment] Failed to load reports:", reportsError);
  }
  const reportIds = (reports ?? []).map((r) => r.id);
  if (reportIds.length === 0) return null;

  const { data: comment, error: commentError } = await admin
    .from("report_comments")
    .select("comment, created_at, coach_id")
    .in("report_id", reportIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (commentError) {
    console.error("[coach-comment] Failed to load comment:", commentError);
  }
  if (!comment) return null;

  const { data: coach, error: coachError } = await admin
    .from("users")
    .select("name")
    .eq("id", comment.coach_id)
    .single();
  if (coachError) {
    console.error("[coach-comment] Failed to load coach:", coachError);
  }

  return {
    comment: comment.comment,
    created_at: comment.created_at,
    coach_name: coach?.name ?? "Your coach",
  };
}
