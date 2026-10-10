import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { VALIDATION } from "@/lib/config";
import { studentAnalyticsTag } from "@/lib/rpc/student-analytics";
import { coachDashboardTag } from "@/lib/rpc/coach-dashboard-types";
import { coachAnalyticsTag } from "@/lib/rpc/coach-analytics-types";
import { coachMilestonesTag } from "@/lib/rpc/coach-milestones-types";
import { ownerAnalyticsTag } from "@/lib/rpc/owner-analytics-types";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const postDealSchema = z.object({
  revenue: z.number().min(VALIDATION.deals.revenueMin).max(VALIDATION.deals.revenueMax),
  profit: z.number().min(VALIDATION.deals.profitMin).max(VALIDATION.deals.profitMax),
  student_id: z.string().regex(UUID_RE, "Invalid student_id").optional(),
  logged_by: z.string().regex(UUID_RE, "Invalid logged_by").optional(),
});

// ---------------------------------------------------------------------------
// POST /api/deals — create a new deal
// Phase 45: extended to support coach/owner inserts with dual-layer auth
// (route-handler assignment check + RLS WITH CHECK on coach_insert_deals /
// owner_insert_deals). Student/student_diy self-insert behavior preserved.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // 1. CSRF protection
    const csrfError = verifyOrigin(request);
    if (csrfError) return csrfError;

    // 2. Auth check
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 3. Profile lookup (admin client bypasses RLS)
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 4. Role check — students/coach/owner can create deals (Phase 45)
    if (!["student", "student_diy", "coach", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Rate limit
    const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/deals");
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    // 6. Body parse
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 7. Zod validation
    const parsed = postDealSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      );
    }

    // 8. Resolve effective student_id + logged_by per role (DEALS-03/04/05 dual-layer auth)
    let effectiveStudentId: string;
    let effectiveLoggedBy: string;

    if (profile.role === "student" || profile.role === "student_diy") {
      // Student self-insert: student_id = self; logged_by = self.
      // If body.logged_by is set and != self => 403 (DEALS-04).
      if (parsed.data.logged_by && parsed.data.logged_by !== profile.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // If body.student_id is set and != self => 403.
      if (parsed.data.student_id && parsed.data.student_id !== profile.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      effectiveStudentId = profile.id;
      effectiveLoggedBy = profile.id;
    } else if (profile.role === "coach") {
      // Coach insert: student_id REQUIRED in body; coach must be assigned (route-layer check).
      // logged_by must = coach.id (matches RLS WITH CHECK).
      if (!parsed.data.student_id) {
        return NextResponse.json(
          { error: "student_id is required for coach inserts" },
          { status: 400 }
        );
      }
      if (parsed.data.logged_by && parsed.data.logged_by !== profile.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { data: assigned } = await admin
        .from("users")
        .select("id")
        .eq("id", parsed.data.student_id)
        .eq("coach_id", profile.id)
        .maybeSingle();
      if (!assigned) {
        // Route-handler 403 (layer 1). RLS WITH CHECK is the second layer (DEALS-03).
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      effectiveStudentId = parsed.data.student_id;
      effectiveLoggedBy = profile.id;
    } else {
      // Owner: student_id REQUIRED in body; logged_by must = owner.id.
      if (!parsed.data.student_id) {
        return NextResponse.json(
          { error: "student_id is required for owner inserts" },
          { status: 400 }
        );
      }
      if (parsed.data.logged_by && parsed.data.logged_by !== profile.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      // Verify the student exists and has a student role.
      const { data: student } = await admin
        .from("users")
        .select("id, role")
        .eq("id", parsed.data.student_id)
        .maybeSingle();
      if (!student || !["student", "student_diy"].includes(student.role)) {
        return NextResponse.json({ error: "Student not found" }, { status: 404 });
      }
      effectiveStudentId = parsed.data.student_id;
      effectiveLoggedBy = profile.id;
    }

    // 9. DB insert with 23505 retry (trigger assigns deal_number — do NOT include it).
    const insertPayload = {
      student_id: effectiveStudentId,
      revenue: parsed.data.revenue,
      profit: parsed.data.profit,
      logged_by: effectiveLoggedBy,
    };

    const { data: deal, error: insertError } = await admin
      .from("deals")
      .insert(insertPayload)
      .select()
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        // Retry once on unique_violation (race on deal_number trigger). DEALS-02.
        const { data: retryDeal, error: retryError } = await admin
          .from("deals")
          .insert(insertPayload)
          .select()
          .single();

        if (retryError) {
          console.error("[POST /api/deals] Insert retry failed:", retryError);
          return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
        }

        revalidateTag("badges", "default"); // Phase 51: sidebar coach_milestone_alerts count can change on every deal
        try {
          revalidateTag(studentAnalyticsTag(effectiveStudentId), "default");
        } catch (e) {
          console.error("[revalidate-tag]", e);
        }
        // Phase 47/51: invalidate the coach's dashboard / analytics / milestones caches.
        try {
          const { data: studentRow } = await admin
            .from("users")
            .select("coach_id")
            .eq("id", effectiveStudentId)
            .maybeSingle();
          if (studentRow?.coach_id) {
            revalidateTag(coachDashboardTag(studentRow.coach_id), "default");
            revalidateTag(coachAnalyticsTag(studentRow.coach_id), "default");
            revalidateTag(coachMilestonesTag(studentRow.coach_id), "default");
          }
        } catch (err) {
          console.error("[deals] failed to invalidate coach-dashboard tag:", err);
        }
        // Phase 54: owner-analytics is a GLOBAL tag — always invalidate regardless of coach_id.
        try {
          revalidateTag(ownerAnalyticsTag(), "default");
        } catch (err) {
          console.error("[deals:POST retry] failed to invalidate owner-analytics tag:", err);
        }
        return NextResponse.json({ data: retryDeal }, { status: 201 });
      }

      console.error("[POST /api/deals] Insert failed:", insertError);
      return NextResponse.json({ error: "Failed to create deal" }, { status: 500 });
    }

    // 10. Cache invalidation (per-student)
    revalidateTag("badges", "default"); // Phase 51: sidebar coach_milestone_alerts count can change on every deal
    try {
      revalidateTag(studentAnalyticsTag(effectiveStudentId), "default");
    } catch (e) {
      console.error("[revalidate-tag]", e);
    }
    // Phase 47/51: invalidate the coach's dashboard / analytics / milestones caches.
    try {
      const { data: studentRow } = await admin
        .from("users")
        .select("coach_id")
        .eq("id", effectiveStudentId)
        .maybeSingle();
      if (studentRow?.coach_id) {
        revalidateTag(coachDashboardTag(studentRow.coach_id), "default");
        revalidateTag(coachAnalyticsTag(studentRow.coach_id), "default");
        revalidateTag(coachMilestonesTag(studentRow.coach_id), "default");
      }
    } catch (err) {
      console.error("[deals] failed to invalidate coach-dashboard tag:", err);
    }
    // Phase 54: owner-analytics is a GLOBAL tag — always invalidate regardless of coach_id.
    try {
      revalidateTag(ownerAnalyticsTag(), "default");
    } catch (err) {
      console.error("[deals:POST] failed to invalidate owner-analytics tag:", err);
    }

    // 11. Return 201
    return NextResponse.json({ data: deal }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/deals] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/deals — paginated deal list for a student (coach/owner only)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    // 1. Auth check (no CSRF on GET — read-only, safe method)
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Profile lookup
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();
    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 3. Role check — coach and owner only (students read via their own UI, Phase 41)
    if (!["coach", "owner"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Rate limit
    const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/deals");
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    // 6. Query params
    const { searchParams } = request.nextUrl;
    const studentId = searchParams.get("student_id");
    const pageParam = searchParams.get("page") ?? "1";

    // 7. Validate student_id is present
    if (!studentId) {
      return NextResponse.json({ error: "student_id is required" }, { status: 400 });
    }

    // 7b. Assignment check — a coach may only read deals for their own students
    // (admin client bypasses RLS, so this MUST be enforced here to prevent IDOR
    // via student_id enumeration). Owner may read any student's deals.
    if (profile.role === "coach") {
      const { data: assigned } = await admin
        .from("users")
        .select("id")
        .eq("id", studentId)
        .eq("coach_id", profile.id)
        .maybeSingle();
      if (!assigned) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 8. Parse page with bounds
    const page = Math.max(1, parseInt(pageParam, 10) || 1);
    const pageSize = 25;
    const offset = (page - 1) * pageSize;

    // 9. DB query — paginated, reverse chronological
    const { data, error, count } = await admin
      .from("deals")
      .select("*", { count: "exact" })
      .eq("student_id", studentId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[GET /api/deals] Query failed:", error);
      return NextResponse.json({ error: "Failed to fetch deals" }, { status: 500 });
    }

    // 10. Return paginated result
    return NextResponse.json({ data: data ?? [], total: count ?? 0, page });
  } catch (err) {
    console.error("[GET /api/deals] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
