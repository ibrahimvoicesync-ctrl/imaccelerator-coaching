import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { MINUTES_PER_DAY, updateBlockSchema } from "@/lib/schemas/schedule-block";
import { BLOCK_SELECT } from "@/lib/schedule";

/** CSRF + auth + role + rate limit, shared by PATCH and DELETE. */
async function guard(request: Request, admin: ReturnType<typeof createAdminClient>) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return { error: csrfError };

  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_id", authUser.id)
    .single();
  if (!profile || (profile.role !== "student" && profile.role !== "student_diy")) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(
    profile.id,
    "/api/schedule-blocks/update"
  );
  if (!allowed) {
    return {
      error: NextResponse.json(
        { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      ),
    };
  }
  return { profile };
}

const idSchema = z.string().uuid();

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const { profile, error } = await guard(request, admin);
  if (error) return error;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateBlockSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: block } = await admin
    .from("schedule_blocks")
    .select("start_minute, duration_minutes")
    .eq("id", id)
    .eq("student_id", profile.id)
    .maybeSingle();
  if (!block) return NextResponse.json({ error: "Block not found" }, { status: 404 });

  const start = parsed.data.start_minute ?? block.start_minute;
  const duration = parsed.data.duration_minutes ?? block.duration_minutes;
  if (start + duration > MINUTES_PER_DAY) {
    return NextResponse.json({ error: "Block must end by midnight" }, { status: 400 });
  }

  // A block may only be linked to one of the student's own sessions.
  if (parsed.data.session_id) {
    const { data: session } = await admin
      .from("work_sessions")
      .select("id")
      .eq("id", parsed.data.session_id)
      .eq("student_id", profile.id)
      .maybeSingle();
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: updated, error: updateError } = await admin
    .from("schedule_blocks")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", profile.id)
    .select(BLOCK_SELECT)
    .single();

  if (updateError) {
    console.error("[schedule-blocks PATCH] Update failed:", updateError);
    return NextResponse.json({ error: "Failed to update block" }, { status: 500 });
  }
  return NextResponse.json({ data: updated });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = createAdminClient();
  const { profile, error } = await guard(request, admin);
  if (error) return error;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }

  const { data: deleted, error: deleteError } = await admin
    .from("schedule_blocks")
    .delete()
    .eq("id", id)
    .eq("student_id", profile.id)
    .select("id");

  if (deleteError) {
    console.error("[schedule-blocks DELETE] Delete failed:", deleteError);
    return NextResponse.json({ error: "Failed to delete block" }, { status: 500 });
  }
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: "Block not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
