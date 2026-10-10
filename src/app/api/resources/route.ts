import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const addResourceSchema = z.object({
  title: z.string().min(1).max(255),
  // Restrict to http(s) — z.string().url() alone accepts javascript:/data:/etc.,
  // which would render as a script-scheme link on the client (RES-XSS).
  url: z
    .string()
    .url()
    .max(2048)
    .refine((v) => /^https?:\/\//i.test(v), "URL must start with http:// or https://"),
  comment: z.string().max(1000).optional(),
  is_pinned: z.boolean().optional(),
});

const deleteResourceSchema = z.object({
  id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// GET /api/resources — fetch all resources (no CSRF, no rate limit — read endpoint)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // 2. Profile lookup
    const { data: profile } = await admin
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 3. Role check — owner, coach, student, student_diy allowed
    if (!["owner", "coach", "student", "student_diy"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Fetch resources with poster name, pinned-first then by date descending
    const { data, error } = await admin
      .from("resources")
      .select("*, created_by_user:users!resources_created_by_fkey(name)")
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/resources] Failed to fetch resources:", error);
      return NextResponse.json({ error: "Failed to fetch resources" }, { status: 500 });
    }

    return NextResponse.json({ resources: data ?? [] });
  } catch (err) {
    console.error("[GET /api/resources] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/resources — create a resource link (owner/coach only)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  // 0. CSRF protection
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // 2. Profile lookup
    const { data: profile } = await admin
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 3. Role check — owner and coach only (students are read-only per RES-05)
    if (!["owner", "coach"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Rate limit
    const { allowed, retryAfterSeconds } = await checkRateLimit(
      profile.id,
      "/api/resources"
    );
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    // 5. Body parse
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 6. Zod validation
    const parsed = addResourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      );
    }

    // 7. Insert resource
    const { data, error: insertError } = await admin
      .from("resources")
      .insert({
        title: parsed.data.title,
        url: parsed.data.url,
        comment: parsed.data.comment ?? null,
        is_pinned: parsed.data.is_pinned ?? false,
        created_by: profile.id,
      })
      .select("*, created_by_user:users!resources_created_by_fkey(name)")
      .single();

    if (insertError) {
      console.error("[POST /api/resources] Insert failed:", insertError);
      return NextResponse.json({ error: "Failed to create resource" }, { status: 500 });
    }

    return NextResponse.json({ resource: data }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/resources] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/resources — remove a resource (owner/coach; coach owns-only)
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  // 0. CSRF protection
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  try {
    // 1. Auth check
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // 2. Profile lookup
    const { data: profile } = await admin
      .from("users")
      .select("id, role")
      .eq("auth_id", authUser.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "User profile not found" }, { status: 404 });
    }

    // 3. Role check — owner and coach only
    if (!["owner", "coach"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 4. Rate limit
    const { allowed, retryAfterSeconds } = await checkRateLimit(
      profile.id,
      "/api/resources"
    );
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    // 5. Body parse
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // 6. Zod validation
    const parsed = deleteResourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Validation failed" },
        { status: 400 }
      );
    }

    // 7. Ownership check for coach (per Pitfall 6 — coach can only delete own resources)
    if (profile.role === "coach") {
      const { data: existing } = await admin
        .from("resources")
        .select("created_by")
        .eq("id", parsed.data.id)
        .single();
      if (!existing || existing.created_by !== profile.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // 8. Delete resource
    const { error: deleteError } = await admin
      .from("resources")
      .delete()
      .eq("id", parsed.data.id);

    if (deleteError) {
      console.error("[DELETE /api/resources] Delete failed:", deleteError);
      return NextResponse.json({ error: "Failed to delete resource" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/resources] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
