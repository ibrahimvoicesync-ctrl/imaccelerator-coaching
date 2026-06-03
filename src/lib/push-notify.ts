import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushConfigured, sendPush, type PushPayload } from "@/lib/push";

/**
 * Fan a push notification out to all of a student's subscribed devices and
 * prune any that have expired. Never throws — a failure here must never break
 * the action that triggered it (e.g. a coach saving a comment).
 */
export async function notifyStudent(studentId: string, payload: PushPayload): Promise<void> {
  if (!isPushConfigured()) return;
  try {
    const admin = createAdminClient();
    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("student_id", studentId);
    if (error || !subs || subs.length === 0) return;

    for (const s of subs) {
      const res = await sendPush(
        { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
        payload,
      );
      if (res.expired) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  } catch (err) {
    console.error("[notifyStudent] failed:", err);
  }
}
