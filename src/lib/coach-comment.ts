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

  const { data: reports } = await admin
    .from("daily_reports")
    .select("id")
    .eq("student_id", studentId);
  const reportIds = (reports ?? []).map((r) => r.id);
  if (reportIds.length === 0) return null;

  const { data: comment } = await admin
    .from("report_comments")
    .select("comment, created_at, coach_id")
    .in("report_id", reportIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!comment) return null;

  const { data: coach } = await admin
    .from("users")
    .select("name")
    .eq("id", comment.coach_id)
    .single();

  return {
    comment: comment.comment,
    created_at: comment.created_at,
    coach_name: coach?.name ?? "Your coach",
  };
}
