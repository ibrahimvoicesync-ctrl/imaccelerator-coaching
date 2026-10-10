import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({
  studentId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function GET(request: NextRequest) {
  try {
    // Auth check
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Role check — must be coach or owner
    const { data: profile } = await admin
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();

    if (!profile || (profile.role !== "coach" && profile.role !== "owner")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Validate query params
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      studentId: searchParams.get("studentId"),
      month: searchParams.get("month"),
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid parameters", details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { studentId, month } = parsed.data;

    // Verify student exists and apply defense-in-depth
    const { data: student, error: studentError } = await admin
      .from("users")
      .select("id, coach_id")
      .eq("id", studentId)
      .eq("role", "student")
      .single();

    if (studentError || !student) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }

    // Coach can only access their own students
    if (profile.role === "coach" && student.coach_id !== profile.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Compute month bounds
    const firstDay = `${month}-01`;
    const lastDayDate = new Date(firstDay + "T00:00:00Z");
    lastDayDate.setUTCMonth(lastDayDate.getUTCMonth() + 1, 0);
    const lastDay = lastDayDate.toISOString().split("T")[0];

    // Parallel fetch month-scoped data
    const [sessionsResult, reportsResult] = await Promise.all([
      admin
        .from("work_sessions")
        .select("id, date, cycle_number, status, duration_minutes, session_minutes")
        .eq("student_id", studentId)
        .gte("date", firstDay)
        .lte("date", lastDay)
        .order("date")
        .order("cycle_number"),
      admin
        .from("daily_reports")
        .select(
          "id, date, hours_worked, star_rating, brands_contacted, influencers_contacted, calls_joined, wins, improvements, reviewed_by",
        )
        .eq("student_id", studentId)
        .not("submitted_at", "is", null)
        .gte("date", firstDay)
        .lte("date", lastDay)
        .order("date"),
    ]);

    if (sessionsResult.error) {
      console.error("[GET /api/calendar] Failed to load sessions:", sessionsResult.error);
      return NextResponse.json({ error: "Failed to load sessions" }, { status: 500 });
    }
    if (reportsResult.error) {
      console.error("[GET /api/calendar] Failed to load reports:", reportsResult.error);
      return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
    }

    // Fetch comments for the fetched reports
    const reportIds = (reportsResult.data ?? []).map((r) => r.id);
    const { data: commentsData } = reportIds.length > 0
      ? await admin
          .from("report_comments")
          .select("report_id, comment")
          .in("report_id", reportIds)
      : { data: [] };

    const commentsMap: Record<string, { comment: string }> = {};
    for (const c of commentsData ?? []) {
      commentsMap[c.report_id] = { comment: c.comment };
    }

    return NextResponse.json({
      sessions: sessionsResult.data ?? [],
      reports: reportsResult.data ?? [],
      comments: commentsMap,
    });
  } catch (err) {
    console.error("[GET /api/calendar] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
