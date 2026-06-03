import { z } from "zod";
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { WORK_TRACKER } from "@/lib/config";
import { studentAnalyticsTag } from "@/lib/rpc/student-analytics";
import { coachDashboardTag } from "@/lib/rpc/coach-dashboard-types";
import { coachAnalyticsTag } from "@/lib/rpc/coach-analytics-types";
import { ownerAnalyticsTag } from "@/lib/rpc/owner-analytics-types";

// PATCH carries one of two intents:
//   - a status transition (start/pause/resume/complete/abandon), via `status`
//   - an edit to a *completed* entry's logged duration, via `duration_minutes`
// At least one must be present; `duration_minutes` takes precedence (edit mode).
const patchSchema = z
  .object({
    status: z.enum(["completed", "abandoned", "paused", "in_progress"]).optional(),
    duration_minutes: z
      .number()
      .int()
      .min(WORK_TRACKER.minSessionMinutes)
      .max(WORK_TRACKER.maxSessionMinutes)
      .optional(),
  })
  .refine((d) => d.status !== undefined || d.duration_minutes !== undefined, {
    message: "Provide a status or duration_minutes",
  });

/** Invalidate analytics/dashboard caches affected by a session change. */
async function revalidateForStudent(
  admin: ReturnType<typeof createAdminClient>,
  studentId: string
) {
  revalidateTag("badges", "default");
  try {
    revalidateTag(studentAnalyticsTag(studentId), "default");
  } catch (e) {
    console.error("[revalidate-tag]", e);
  }
  try {
    const { data: studentRow } = await admin
      .from("users")
      .select("coach_id")
      .eq("id", studentId)
      .maybeSingle();
    if (studentRow?.coach_id) {
      revalidateTag(coachDashboardTag(studentRow.coach_id), "default");
      revalidateTag(coachAnalyticsTag(studentRow.coach_id), "default");
    }
  } catch (err) {
    console.error("[work-sessions] failed to invalidate coach-dashboard tag:", err);
  }
  try {
    revalidateTag(ownerAnalyticsTag(), "default");
  } catch (err) {
    console.error("[work-sessions] failed to invalidate owner-analytics tag:", err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
  const { allowed: rateLimitAllowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/work-sessions/update");
  if (!rateLimitAllowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Fetch existing session (filter by student_id for defense-in-depth)
  const { data: session, error: fetchError } = await admin
    .from("work_sessions")
    .select("*")
    .eq("id", id)
    .eq("student_id", profile.id)
    .single();

  if (fetchError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { status: newStatus, duration_minutes: newDuration } = parsed.data;

  // ── Edit mode: correct a confirmed (completed) entry's logged duration ──
  // This is the "I mistyped/under-logged a session" path — previously the only
  // recourse was to stack another session on top of the mistake.
  if (newDuration !== undefined) {
    if (session.status !== "completed") {
      return NextResponse.json(
        { error: "Only completed sessions can be edited" },
        { status: 400 }
      );
    }
    // Keep session_minutes and duration_minutes in lockstep so the history card
    // ("X min") and the counted total stay consistent.
    const { data: edited, error: editError } = await admin
      .from("work_sessions")
      .update({ session_minutes: newDuration, duration_minutes: newDuration })
      .eq("id", id)
      .eq("student_id", profile.id)
      .select()
      .single();

    if (editError) {
      console.error("[work-sessions PATCH] Edit failed:", editError);
      return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
    }

    await revalidateForStudent(admin, profile.id);
    return NextResponse.json(edited);
  }

  // ── Status-transition mode ──
  if (newStatus === undefined) {
    return NextResponse.json({ error: "No status provided" }, { status: 400 });
  }

  // State transition validation
  // Valid transitions:
  //   in_progress -> completed, paused, abandoned
  //   paused -> in_progress (resume), abandoned
  const validTransitions: Record<string, string[]> = {
    in_progress: ["completed", "paused", "abandoned"],
    paused: ["in_progress", "abandoned"],
  };

  const allowed = validTransitions[session.status];
  if (!allowed || !allowed.includes(newStatus)) {
    return NextResponse.json(
      { error: `Cannot transition from ${session.status} to ${newStatus}` },
      { status: 400 }
    );
  }

  // Build update object based on transition
  const update: Record<string, unknown> = { status: newStatus };

  if (newStatus === "completed") {
    update.completed_at = new Date().toISOString();
    update.duration_minutes = session.session_minutes;
  } else if (newStatus === "paused") {
    update.paused_at = new Date().toISOString();
  } else if (newStatus === "in_progress" && session.status === "paused") {
    // Resume: shift started_at forward so elapsed = elapsed-before-pause
    const pausedAt = new Date(session.paused_at!).getTime();
    const startedAt = new Date(session.started_at).getTime();
    const elapsedBeforePause = pausedAt - startedAt;
    const newStartedAt = new Date(Date.now() - elapsedBeforePause).toISOString();
    update.started_at = newStartedAt;
    update.paused_at = null;
  } else if (newStatus === "abandoned") {
    // Delete the session so the cycle slot is freed up for retry
    const { error: deleteError } = await admin
      .from("work_sessions")
      .delete()
      .eq("id", id)
      .eq("student_id", profile.id);

    if (deleteError) {
      console.error("[work-sessions PATCH] Delete failed:", deleteError);
      return NextResponse.json({ error: "Failed to abandon session" }, { status: 500 });
    }

    return NextResponse.json({ deleted: true });
  }

  const { data: updated, error: updateError } = await admin
    .from("work_sessions")
    .update(update)
    .eq("id", id)
    .eq("student_id", profile.id)
    .select()
    .single();

  if (updateError) {
    console.error("[work-sessions PATCH] Update failed:", updateError);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }

  revalidateTag("badges", "default");
  try {
    revalidateTag(studentAnalyticsTag(profile.id), "default");
  } catch (e) {
    console.error("[revalidate-tag]", e);
  }
  if (newStatus === "completed") {
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
    // Phase 54: owner-analytics is a GLOBAL tag — invalidate on every session
    // completion regardless of coach_id. Lifetime hours leaderboard changes.
    try {
      revalidateTag(ownerAnalyticsTag(), "default");
    } catch (err) {
      console.error("[work-sessions:PATCH] failed to invalidate owner-analytics tag:", err);
    }
  }
  return NextResponse.json(updated);
}

/**
 * DELETE — permanently remove a logged session. Used to delete a mistaken
 * confirmed time entry outright (the edit affordance handles corrections).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  // Rate limit check
  const { allowed: rateLimitAllowed, retryAfterSeconds } = await checkRateLimit(
    profile.id,
    "/api/work-sessions/update"
  );
  if (!rateLimitAllowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // Ownership-scoped delete (defense-in-depth via student_id filter)
  const { data: deleted, error: deleteError } = await admin
    .from("work_sessions")
    .delete()
    .eq("id", id)
    .eq("student_id", profile.id)
    .select("id")
    .maybeSingle();

  if (deleteError) {
    console.error("[work-sessions DELETE] Delete failed:", deleteError);
    return NextResponse.json({ error: "Failed to delete session" }, { status: 500 });
  }
  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  await revalidateForStudent(admin, profile.id);
  return NextResponse.json({ deleted: true });
}
