import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROADMAP_STEPS } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { studentAnalyticsTag } from "@/lib/rpc/student-analytics";
import { coachDashboardTag } from "@/lib/rpc/coach-dashboard-types";
import { coachAnalyticsTag } from "@/lib/rpc/coach-analytics-types";
import { coachMilestonesTag } from "@/lib/rpc/coach-milestones-types";
import { ownerAnalyticsTag } from "@/lib/rpc/owner-analytics-types";

const patchSchema = z.object({
  step_number: z.number().int().min(1).max(ROADMAP_STEPS.length),
});

export async function PATCH(request: NextRequest) {
  try {
    // CSRF protection -- Origin header must match app host
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    const supabase = await createClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Admin client bypasses RLS — needed because RLS policies use
    // get_user_role() which can fail during profile resolution
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    if (profile.role !== "student" && profile.role !== "student_diy") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Rate limit check (per D-01, D-04)
    const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/roadmap");
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
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
    }

    const { step_number } = parsed.data;

    // Fetch the step
    const { data: step } = await admin
      .from("roadmap_progress")
      .select("*")
      .eq("student_id", profile.id)
      .eq("step_number", step_number)
      .single();

    if (!step) {
      return NextResponse.json({ error: "Step not found" }, { status: 404 });
    }

    if (step.status !== "active") {
      return NextResponse.json({ error: "Can only complete active steps" }, { status: 400 });
    }

    // Mark step as completed
    const { data: completed, error: updateError } = await admin
      .from("roadmap_progress")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", step.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Unlock next step if not the last
    let unlocked = null;
    if (step_number < ROADMAP_STEPS.length) {
      const { data: nextStep } = await admin
        .from("roadmap_progress")
        .update({ status: "active" })
        .eq("student_id", profile.id)
        .eq("step_number", step_number + 1)
        .select()
        .single();

      unlocked = nextStep;
    }

    try {
      revalidateTag(studentAnalyticsTag(profile.id), "default");
    } catch (e) {
      console.error("[revalidate-tag]", e);
    }
    // A MILESTONE_CONFIG.influencersClosedStep / .brandResponseStep completion
    // for an assigned student produces a coach milestone notification.
    // Invalidate the coach's caches + sidebar badge so the notification surfaces
    // within one render instead of one TTL.
    revalidateTag("badges", "default");
    // Owner platform metrics (roadmap stage funnel) reflect this advance.
    try {
      revalidateTag(ownerAnalyticsTag(), "default");
    } catch (e) {
      console.error("[revalidate-tag owner-analytics]", e);
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
        revalidateTag(coachMilestonesTag(studentRow.coach_id), "default");
      }
    } catch (err) {
      console.error("[roadmap] failed to invalidate coach tags:", err);
    }

    return NextResponse.json({ data: { completed, unlocked } });
  } catch (error) {
    console.error("PATCH /api/roadmap error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
