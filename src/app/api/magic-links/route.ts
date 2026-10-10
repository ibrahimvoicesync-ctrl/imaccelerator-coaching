import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_CONFIG } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";

function generateMagicCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const codeLength = 8;
  // Rejection sampling: `chars.length` (55) does not divide 256, so mapping any
  // byte 0-255 via `b % chars.length` would over-represent the first
  // (256 % 55) characters. Discard bytes in that biased tail so every character
  // is equally likely. Same length + alphabet as before.
  const maxAcceptable = 256 - (256 % chars.length);
  const out: string[] = [];
  while (out.length < codeLength) {
    const buf = new Uint8Array(codeLength - out.length);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= maxAcceptable) continue; // biased tail — reject and resample
      out.push(chars[b % chars.length]);
      if (out.length === codeLength) break;
    }
  }
  return out.join("");
}

const postSchema = z.object({
  role: z.enum(["coach", "student", "student_diy"]).optional().default("student"),
  max_uses: z.number().int().min(1).max(10000).optional().default(10),
});

export async function POST(request: NextRequest) {
  // CSRF protection -- Origin header must match app host
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_id", authUser.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  if (profile.role !== "coach" && profile.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit check (per D-01, D-04)
  const { allowed: postAllowed, retryAfterSeconds: postRetryAfter } = await checkRateLimit(profile.id, "/api/magic-links/create");
  if (!postAllowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${postRetryAfter} seconds.` },
      { status: 429, headers: { "Retry-After": String(postRetryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {}; // Empty body = all defaults (role=student, max_uses=10)
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Validation failed" },
      { status: 400 }
    );
  }

  const magicRole = parsed.data.role;
  const maxUses = parsed.data.max_uses;

  // Coaches can only create student or student_diy magic links
  if (profile.role === "coach" && magicRole !== "student" && magicRole !== "student_diy") {
    return NextResponse.json({ error: "Coaches can only invite students" }, { status: 403 });
  }

  const code = generateMagicCode();

  const { data: link, error } = await admin
    .from("magic_links")
    .insert({
      code,
      role: magicRole,
      created_by: profile.id,
      expires_at: null,  // magic links don't expire by default
      max_uses: maxUses,
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/magic-links] DB error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? APP_CONFIG.url;
  const registerUrl = `${baseUrl}/register?magic=${code}`;

  return NextResponse.json({ data: link, registerUrl }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  // CSRF protection -- Origin header must match app host
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_id", authUser.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  if (profile.role !== "coach" && profile.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit check (per D-01, D-04)
  const { allowed: deleteAllowed, retryAfterSeconds: deleteRetryAfter } = await checkRateLimit(profile.id, "/api/magic-links/delete");
  if (!deleteAllowed) {
    return NextResponse.json(
      { error: `Too many requests, try again in ${deleteRetryAfter} seconds.` },
      { status: 429, headers: { "Retry-After": String(deleteRetryAfter) } }
    );
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  // Ownership check
  const { data: link, error: fetchError } = await admin
    .from("magic_links")
    .select("id, created_by")
    .eq("id", id)
    .single();

  if (fetchError || !link) {
    return NextResponse.json({ error: "Magic link not found" }, { status: 404 });
  }

  if (link.created_by !== profile.id && profile.role !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error: deleteError } = await admin
    .from("magic_links")
    .delete()
    .eq("id", id);

  if (deleteError) {
    console.error("[DELETE /api/magic-links] DB error:", deleteError);
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
