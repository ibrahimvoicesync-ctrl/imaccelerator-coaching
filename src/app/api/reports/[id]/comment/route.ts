import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { notifyStudent } from "@/lib/push-notify";

const commentSchema = z.object({
  comment: z.string().min(1, "Comment is required").max(1000, "Comment must be 1000 characters or less"),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 0. CSRF protection — Origin header must match app host
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  // 1. Auth — verify user session
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Admin client — bypass RLS for profile lookup
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_id", authUser.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  // 3. Role check — coach and owner only (COMMENT-04, COMMENT-05)
  if (profile.role !== "coach" && profile.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // 4. Rate limit check
  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/reports/comment");
  if (!allowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  // 5. Parse and validate request body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  // 6. Extract route param
  const { id } = await params;

  // 7. Fetch report — verify it exists
  const { data: report, error: reportError } = await admin
    .from("daily_reports")
    .select("id, student_id")
    .eq("id", id)
    .single();

  if (reportError || !report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  // 8. Defense-in-depth ownership check (PITFALL 1 — conditional on role)
  // Coach: student must belong to this coach. Owner: can comment on any report.
  if (profile.role === "coach") {
    const { data: studentMatch, error: studentError } = await admin
      .from("users")
      .select("id")
      .eq("id", report.student_id)
      .eq("coach_id", profile.id)
      .single();

    if (studentError || !studentMatch) {
      // Return 404 for all ownership failures to prevent report-ID probing (PITFALL 4)
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
  }

  // 9. Upsert comment — ON CONFLICT (report_id) DO UPDATE (COMMENT-01, COMMENT-02)
  const { data, error } = await admin
    .from("report_comments")
    .upsert(
      { report_id: id, coach_id: profile.id, comment: parsed.data.comment },
      { onConflict: "report_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("Failed to upsert report comment:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Notify the student that their coach replied — a genuine re-engagement
  // trigger (a mentor responded to them), not a manufactured one. Best-effort:
  // notifyStudent never throws, so it can't break the comment save.
  const { data: studentRow } = await admin
    .from("users")
    .select("role")
    .eq("id", report.student_id)
    .single();
  const base = studentRow?.role === "student_diy" ? "/student_diy" : "/student";
  await notifyStudent(report.student_id, {
    title: "Your coach replied",
    body: "You have new feedback on your daily report.",
    url: `${base}/report/history`,
    tag: "ima-coach-feedback",
  });

  return NextResponse.json({ data });
}
