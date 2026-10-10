import { z } from "zod";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORK_TRACKER } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { studentAnalyticsTag } from "@/lib/rpc/student-analytics";
import { coachDashboardTag } from "@/lib/rpc/coach-dashboard-types";
import { coachAnalyticsTag } from "@/lib/rpc/coach-analytics-types";

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cycle_number: z.number().int().min(1),
  session_minutes: z
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

  // Rate limit check (per D-01, D-04)
  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/work-sessions");
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Parse and validate body
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

  const { date, cycle_number, session_minutes } = parsed.data;

  // Check for existing in_progress or paused session for this student on this date
  const { data: activeSession } = await admin
    .from("work_sessions")
    .select("id, status")
    .eq("student_id", profile.id)
    .eq("date", date)
    .in("status", ["in_progress", "paused"])
    .limit(1)
    .single();

  if (activeSession) {
    return NextResponse.json(
      { error: "An active or paused session already exists", session_id: activeSession.id },
      { status: 409 }
    );
  }

  // ── Sanity ceiling ───────────────────────────────────────────────────
  // No daily plan is required to start a session — a student just taps start.
  // The only guard is a generous safety ceiling so a runaway or buggy client
  // can't inflate a day to absurd totals. Mirrors /api/work-sessions/manual.
  const DAILY_CEILING_MINUTES = 16 * 60;
  const { data: completedSessions } = await admin
    .from("work_sessions")
    .select("session_minutes")
    .eq("student_id", profile.id)
    .eq("date", date)
    .eq("status", "completed");

  const completedMinutes = (completedSessions ?? []).reduce(
    (sum, s) => sum + s.session_minutes,
    0,
  );

  if (completedMinutes + session_minutes > DAILY_CEILING_MINUTES) {
    return NextResponse.json(
      { error: "You've already logged a full day of work. Get some rest." },
      { status: 400 },
    );
  }
  // ── End sanity ceiling ───────────────────────────────────────────────

  // Insert new session
  const { data: session, error: insertError } = await admin
    .from("work_sessions")
    .insert({
      student_id: profile.id,
      date,
      cycle_number,
      session_minutes,
      started_at: new Date().toISOString(),
      status: "in_progress",
    })
    .select()
    .single();

  if (insertError) {
    // Unique constraint violation = duplicate cycle_number for this student+date
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Cycle already exists for this date" }, { status: 409 });
    }
    console.error("[work-sessions POST] Insert failed:", insertError);
    return NextResponse.json({ error: "Failed to start session" }, { status: 500 });
  }

  revalidateTag("badges", "default");
  try {
    revalidateTag(studentAnalyticsTag(profile.id), "default");
  } catch (e) {
    console.error("[revalidate-tag]", e);
  }
  // Phase 47: invalidate the coach's dashboard cache, if the student has a coach.
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
    console.error("[work-sessions] failed to invalidate coach-dashboard tag:", err);
  }
  return NextResponse.json(session, { status: 201 });
}
