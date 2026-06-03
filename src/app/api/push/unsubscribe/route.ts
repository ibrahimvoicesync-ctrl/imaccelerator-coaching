import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function POST(request: Request) {
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

  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/push/subscribe");
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

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Ownership-scoped delete.
  const { error: deleteError } = await admin
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", parsed.data.endpoint)
    .eq("student_id", profile.id);

  if (deleteError) {
    console.error("[push unsubscribe] delete failed:", deleteError);
    return NextResponse.json({ error: "Failed to remove subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
