import "server-only";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { studentAnalyticsTag } from "@/lib/rpc/student-analytics";
import { coachDashboardTag } from "@/lib/rpc/coach-dashboard-types";
import { coachAnalyticsTag } from "@/lib/rpc/coach-analytics-types";
import { coachMilestonesTag } from "@/lib/rpc/coach-milestones-types";
import { ownerAnalyticsTag } from "@/lib/rpc/owner-analytics-types";

/**
 * Invalidate every cache that reads a student's daily_reports: badges, the
 * student's analytics, owner analytics (global), and their coach's
 * dashboard/analytics/milestones. Failures are logged, never thrown — a stale
 * cache must not fail the write that already succeeded.
 */
export async function invalidateReportCaches(studentId: string): Promise<void> {
  revalidateTag("badges", "default");
  try {
    revalidateTag(studentAnalyticsTag(studentId), "default");
  } catch (e) {
    console.error("[revalidate-tag]", e);
  }
  // Phase 64: invalidate owner analytics (closes v1.6 audit defer — global
  // tag, invalidates regardless of coach assignment).
  try {
    revalidateTag(ownerAnalyticsTag(), "default");
  } catch (e) {
    console.error("[revalidate-tag owner-analytics]", e);
  }
  // Phase 47: invalidate the coach's dashboard cache, if the student has a coach.
  try {
    const admin = createAdminClient();
    const { data: studentRow } = await admin
      .from("users")
      .select("coach_id")
      .eq("id", studentId)
      .maybeSingle();
    if (studentRow?.coach_id) {
      revalidateTag(coachDashboardTag(studentRow.coach_id), "default");
      revalidateTag(coachAnalyticsTag(studentRow.coach_id), "default");
      revalidateTag(coachMilestonesTag(studentRow.coach_id), "default");
    }
  } catch (err) {
    console.error("[reports] failed to invalidate coach-dashboard tag:", err);
  }
}
