import { z } from "zod";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WORK_TRACKER } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { getTodayUTC } from "@/lib/utils";
import { planJsonSchema } from "@/lib/schemas/daily-plan";
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

  // ── Plan-aware cap enforcement (D-01 through D-05) ──────────────────
  const today = getTodayUTC();

  // Step 1: Fetch today's plan
  const { data: todayPlan, error: dailyPlanError } = await admin
    .from("daily_plans")
    .select()
    .eq("student_id", profile.id)
    .eq("date", today)
    .maybeSingle();

  if (dailyPlanError) {
    console.error("[work-sessions POST] daily_plans query failed:", dailyPlanError);
    return NextResponse.json(
      { error: "Failed to check daily plan. Please try again." },
      { status: 500 }
    );
  }

  // D-01: No plan today → block session creation
  if (!todayPlan) {
    return NextResponse.json(
      { error: "You must create a daily plan before starting a work session." },
      { status: 400 }
    );
  }

  // D-07: Parse plan_json safely — never TypeScript cast
  const planParseResult = planJsonSchema.safeParse(todayPlan.plan_json);

  if (!planParseResult.success) {
    // D-07 + D-01: Treat parse failure as "no plan today" → block
    // This surfaces data corruption immediately rather than silently bypassing the cap
    console.error("[work-sessions POST] plan_json parse failed for student:", profile.id, planParseResult.error);
    return NextResponse.json(
      { error: "Your daily plan data is invalid. Please contact support." },
      { status: 400 }
    );
  }

  const planData = planParseResult.data;
  const plannedSessionCount = planData.sessions.length;

  // Step 2: Fetch today's completed sessions (one query for both count and sum per Pitfall 4)
  const { data: completedSessions } = await admin
    .from("work_sessions")
    .select("session_minutes")
    .eq("student_id", profile.id)
    .eq("date", today)
    .eq("status", "completed");

  const completedCount = completedSessions?.length ?? 0;
  const completedMinutes = (completedSessions ?? []).reduce(
    (sum, s) => sum + s.session_minutes, 0
  );

  // D-04: Plan fulfilled when completed sessions >= planned sessions
  const planFulfilled = completedCount >= plannedSessionCount;

  // D-02: If plan exists and not fulfilled, enforce cap
  if (!planFulfilled) {
    const capMinutes = planData.total_work_minutes;
    if (completedMinutes + session_minutes > capMinutes) {
      return NextResponse.json(
        {
          error: `Daily work cap of ${capMinutes} minutes reached. Already completed: ${completedMinutes} min, requested: ${session_minutes} min.`,
        },
        { status: 400 }
      );
    }
  }
  // D-03: If plan fulfilled, cap lifted — fall through to insert
  // ── End plan-aware cap enforcement ───────────────────────────────────

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
