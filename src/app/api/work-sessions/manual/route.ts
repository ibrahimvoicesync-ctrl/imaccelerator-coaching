import { z } from "zod";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORK_TRACKER } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { getTodayUTC } from "@/lib/utils";
import { studentAnalyticsTag } from "@/lib/rpc/student-analytics";
import { coachDashboardTag } from "@/lib/rpc/coach-dashboard-types";
import { coachAnalyticsTag } from "@/lib/rpc/coach-analytics-types";

// Manual logging records work that already happened away from the app (outreach
// in DMs, calls on Zoom, study) — the real job rarely happens with a live timer
// running in this tab. A manually-logged session is inserted already `completed`,
// is exempt from the plan-gate and plan cap (it describes reality, it doesn't
// start timed work), and flows into the same `completed` work_sessions that feed
// the dashboard hero, the streak, and the weekly momentum — so the numbers stay
// honest instead of measuring only timer babysitting.

// Safety ceiling so a single fat-fingered entry can't poison the totals. Real
// work is also editable/deletable from the session history afterwards.
const MAX_DAILY_COMPLETED_MINUTES = 16 * 60;

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  duration_minutes: z
    .number()
    .int()
    .min(WORK_TRACKER.minSessionMinutes)
    .max(WORK_TRACKER.maxSessionMinutes),
});

export async function POST(request: Request) {
  // CSRF protection -- Origin header must match app host
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  // Auth check
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_id", authUser.id)
    .single();
  if (!profile || (profile.role !== "student" && profile.role !== "student_diy")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit — reuse the work-sessions bucket
  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/work-sessions");
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { date, duration_minutes } = parsed.data;

  // Manual logging is only for today or the past — never the future.
  if (date > getTodayUTC()) {
    return NextResponse.json({ error: "Cannot log work for a future date." }, { status: 400 });
  }

  // Fetch the day's sessions to (a) enforce the daily safety ceiling and
  // (b) compute the next cycle_number (unique per student+date).
  const { data: daySessions, error: dayError } = await admin
    .from("work_sessions")
    .select("cycle_number, duration_minutes, status")
    .eq("student_id", profile.id)
    .eq("date", date);

  if (dayError) {
    console.error("[work-sessions/manual] day query failed:", dayError);
    return NextResponse.json({ error: "Failed to log work. Please try again." }, { status: 500 });
  }

  const sessions = daySessions ?? [];
  const completedMinutes = sessions
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);

  if (completedMinutes + duration_minutes > MAX_DAILY_COMPLETED_MINUTES) {
    return NextResponse.json(
      { error: "That would exceed 16 hours logged for the day. Edit an existing entry instead." },
      { status: 400 }
    );
  }

  const nextCycleNumber =
    sessions.reduce((max, s) => Math.max(max, s.cycle_number), 0) + 1;

  const nowIso = new Date().toISOString();

  // Insert an already-completed session. session_minutes (the intended length)
  // and duration_minutes (the actual length) are equal for a manual log.
  const { data: session, error: insertError } = await admin
    .from("work_sessions")
    .insert({
      student_id: profile.id,
      date,
      cycle_number: nextCycleNumber,
      session_minutes: duration_minutes,
      duration_minutes,
      started_at: nowIso,
      completed_at: nowIso,
      status: "completed",
    })
    .select()
    .single();

  if (insertError) {
    // Unique constraint violation = cycle_number collided with a concurrent write.
    if (insertError.code === "23505") {
      return NextResponse.json(
        { error: "Please try again — a session was just added." },
        { status: 409 }
      );
    }
    console.error("[work-sessions/manual] insert failed:", insertError);
    return NextResponse.json({ error: "Failed to log work" }, { status: 500 });
  }

  revalidateTag("badges", "default");
  try {
    revalidateTag(studentAnalyticsTag(profile.id), "default");
  } catch (e) {
    console.error("[revalidate-tag]", e);
  }
  try {
    const { data: studentRow } = await admin
      .from("users")
      .select("coach_id")
      .eq("id", profile.id)
      .maybeSingle();
    if (studentRow?.coach_id) {
      revalidateTag(coachDashboardTag(studentRow.coach_id), "default");
      revalidateTag(coachAnalyticsTag(studentRow.coach_id), "default");
    }
  } catch (err) {
    console.error("[work-sessions/manual] failed to invalidate coach-dashboard tag:", err);
  }

  return NextResponse.json(session, { status: 201 });
}
