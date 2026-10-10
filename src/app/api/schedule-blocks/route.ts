import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import {
  MAX_RANGE_DAYS,
  blockDateSchema,
  createBlocksBodySchema,
} from "@/lib/schemas/schedule-block";
import { BLOCK_SELECT } from "@/lib/schedule";

/** Resolve the calling student's profile, or a 401/403 response. */
async function getStudent(admin: ReturnType<typeof createAdminClient>) {
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
  return { profile };
}

export async function GET(request: Request) {
  const admin = createAdminClient();
  const { profile, error } = await getStudent(admin);
  if (error) return error;

  // `?date=` for one day, or `?from=&to=` (inclusive) for a week/month grid.
  const params = new URL(request.url).searchParams;
  const from = blockDateSchema.safeParse(params.get("from") ?? params.get("date"));
  const to = blockDateSchema.safeParse(params.get("to") ?? params.get("date"));
  if (!from.success || !to.success || from.data > to.data) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  const spanDays = (Date.parse(to.data) - Date.parse(from.data)) / 86_400_000 + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: "Date range too large" }, { status: 400 });
  }

  const { data, error: fetchError } = await admin
    .from("schedule_blocks")
    .select(BLOCK_SELECT)
    .eq("student_id", profile.id)
    .gte("date", from.data)
    .lte("date", to.data)
    .order("date", { ascending: true })
    .order("start_minute", { ascending: true });

  if (fetchError) {
    console.error("[schedule-blocks GET] Fetch failed:", fetchError);
    return NextResponse.json({ error: "Failed to load schedule" }, { status: 500 });
  }
  return NextResponse.json({ data: data ?? [] });
}

export async function POST(request: Request) {
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const admin = createAdminClient();
  const { profile, error } = await getStudent(admin);
  if (error) return error;

  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/schedule-blocks");
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

  const parsed = createBlocksBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const isBulk = "blocks" in parsed.data;
  const rows = ("blocks" in parsed.data ? parsed.data.blocks : [parsed.data]).map((b) => ({
    ...b,
    student_id: profile.id,
  }));

  const { data: inserted, error: insertError } = await admin
    .from("schedule_blocks")
    .insert(rows)
    .select(BLOCK_SELECT);

  if (insertError || !inserted) {
    console.error("[schedule-blocks POST] Insert failed:", insertError);
    return NextResponse.json({ error: "Failed to add block" }, { status: 500 });
  }
  return NextResponse.json({ data: isBulk ? inserted : inserted[0] }, { status: 201 });
}
