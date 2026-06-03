import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPushConfigured, sendPush } from "@/lib/push";
import { getTodayUTC } from "@/lib/utils";

/**
 * Daily reminder fan-out. Intended to be hit by a scheduled job (Vercel Cron —
 * see vercel.json). Sends a calm "keep your streak alive" push to every
 * subscribed student who has NOT logged a completed session today.
 *
 * Auth: guarded by CRON_SECRET. Vercel Cron automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set in the project.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isPushConfigured()) {
    return NextResponse.json({ skipped: "push not configured" }, { status: 200 });
  }

  const admin = createAdminClient();
  const today = getTodayUTC();

  const { data: subs, error: subsError } = await admin
    .from("push_subscriptions")
    .select("id, student_id, endpoint, p256dh, auth");

  if (subsError) {
    console.error("[push send-reminders] failed to load subscriptions:", subsError);
    return NextResponse.json({ error: "Failed to load subscriptions" }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, pruned: 0, targets: 0 });
  }

  const studentIds = [...new Set(subs.map((s) => s.student_id))];

  // Students who already worked today — skip them.
  const { data: completed } = await admin
    .from("work_sessions")
    .select("student_id")
    .eq("date", today)
    .eq("status", "completed")
    .in("student_id", studentIds);
  const activeToday = new Set((completed ?? []).map((c) => c.student_id));

  // Per-student role (deep-link target) + reminder-time preference.
  const { data: users, error: usersError } = await admin
    .from("users")
    .select("id, role, reminder_hour, reminder_offset_min")
    .in("id", studentIds);
  if (usersError) {
    console.error("[push send-reminders] failed to load users:", usersError);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
  const roleById = new Map((users ?? []).map((u) => [u.id, u.role]));
  const reminderById = new Map(
    (users ?? []).map((u) => [
      u.id,
      { hour: u.reminder_hour, offset: u.reminder_offset_min },
    ])
  );

  // The job runs hourly; each student's reminder fires only during the local
  // hour they chose. Convert "now" into their local hour via the stored UTC
  // offset (minutes, from Date.getTimezoneOffset()) and match reminder_hour.
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const isReminderHour = (studentId: string): boolean => {
    const pref = reminderById.get(studentId);
    if (!pref) return false;
    const localMinutes = (((utcMinutes - pref.offset) % 1440) + 1440) % 1440;
    return Math.floor(localMinutes / 60) === pref.hour;
  };

  const targets = subs.filter(
    (s) => !activeToday.has(s.student_id) && isReminderHour(s.student_id)
  );

  let sent = 0;
  let pruned = 0;
  for (const s of targets) {
    const role = roleById.get(s.student_id);
    const url = role === "student_diy" ? "/student_diy/work" : "/student/work";
    const res = await sendPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      {
        title: "Keep your streak alive",
        body: "You haven't logged a session today. A short focused block keeps your momentum going.",
        url,
        tag: "ima-daily-reminder",
      }
    );
    if (res.ok) sent++;
    if (res.expired) {
      await admin.from("push_subscriptions").delete().eq("id", s.id);
      pruned++;
    }
  }

  return NextResponse.json({ sent, pruned, targets: targets.length });
}
