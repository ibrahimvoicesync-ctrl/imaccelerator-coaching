import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";

// The student's chosen reminder hour (0-23, their local clock) plus the browser
// UTC offset (Date.getTimezoneOffset(), minutes) captured when they set it.
const preferencesSchema = z.object({
  reminder_hour: z.number().int().min(0).max(23),
  reminder_offset_min: z.number().int().min(-840).max(840),
});

export async function PATCH(request: Request) {
  // CSRF -> Auth -> Role -> RateLimit -> Body -> Zod -> Logic
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

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

  const { allowed, retryAfterSeconds } = await checkRateLimit(
    profile.id,
    "/api/push/preferences"
  );
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

  const parsed = preferencesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { error: updateError } = await admin
    .from("users")
    .update({
      reminder_hour: parsed.data.reminder_hour,
      reminder_offset_min: parsed.data.reminder_offset_min,
    })
    .eq("id", profile.id);

  if (updateError) {
    console.error("[push preferences] update failed:", updateError);
    return NextResponse.json({ error: "Failed to save preference" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
