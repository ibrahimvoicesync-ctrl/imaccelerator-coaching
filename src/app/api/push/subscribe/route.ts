import { z } from "zod";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { isPushConfigured, isAllowedPushEndpoint } from "@/lib/push";

// Shape of a serialized PushSubscription (subscription.toJSON()).
// `endpoint` is dereferenced server-side by web-push, so a bare url() check is
// not enough — it must be https on a known push service, or it is an SSRF
// vector pointed at whatever internal host the caller names.
const subscribeSchema = z.object({
  endpoint: z
    .string()
    .url()
    .max(2048)
    .refine(isAllowedPushEndpoint, {
      message: "Unsupported push service endpoint",
    }),
  keys: z.object({
    p256dh: z.string().min(1).max(512),
    auth: z.string().min(1).max(512),
  }),
});

export async function POST(request: Request) {
  // CSRF -> Auth -> Role -> RateLimit -> Body -> Zod -> Logic
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  if (!isPushConfigured()) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

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

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { endpoint, keys } = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 512) ?? null;

  // Upsert on endpoint — re-subscribing the same browser updates ownership/keys
  // rather than creating duplicates.
  const { error: upsertError } = await admin
    .from("push_subscriptions")
    .upsert(
      {
        student_id: profile.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: userAgent,
      },
      { onConflict: "endpoint" }
    );

  if (upsertError) {
    console.error("[push subscribe] upsert failed:", upsertError);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
