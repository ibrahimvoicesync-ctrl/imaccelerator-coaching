import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VALIDATION } from "@/lib/config";
import { isValidDateString } from "@/lib/utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { invalidateReportCaches } from "@/lib/report-cache";

const postSchema = z.object({
  date: z.string().refine(isValidDateString, "Invalid date format (YYYY-MM-DD)"),
  hours_worked: z.number().min(0).max(24),
  star_rating: z.number().int().min(VALIDATION.starRating.min).max(VALIDATION.starRating.max),
  brands_contacted: z.number().int().min(VALIDATION.brandsContacted.min).max(VALIDATION.brandsContacted.max),
  influencers_contacted: z.number().int().min(VALIDATION.influencersContacted.min).max(VALIDATION.influencersContacted.max),
  calls_joined: z.number().int().min(VALIDATION.callsJoined.min).max(VALIDATION.callsJoined.max),
  wins: z.string().max(VALIDATION.reportWins.max).optional(),
  improvements: z.string().max(VALIDATION.reportImprovements.max).optional(),
  revenue: z.number().min(VALIDATION.deals.revenueMin).max(VALIDATION.deals.revenueMax).optional(),
  profit: z.number().min(VALIDATION.deals.profitMin).max(VALIDATION.deals.profitMax).optional(),
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

  // Admin client bypasses RLS — needed because RLS policies use
  // get_user_role() which can fail during profile resolution
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("auth_id", authUser.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  if (profile.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Rate limit check (per D-01, D-04)
  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/reports");
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation failed" }, { status: 400 });
  }

  const { date, hours_worked, star_rating, brands_contacted, influencers_contacted, calls_joined, wins, improvements, revenue, profit } = parsed.data;

  const now = new Date().toISOString();

  // Check for existing report
  const { data: existing } = await admin
    .from("daily_reports")
    .select("id, brands_contacted, influencers_contacted, outreach_count")
    .eq("student_id", profile.id)
    .eq("date", date)
    .maybeSingle();

  // Emails quick-logged as a total without a split (Work Tracker) only live in
  // outreach_count — keep that unsplit portion on top of the report's split.
  const unsplitEmails = existing
    ? Math.max(
        0,
        existing.outreach_count - existing.brands_contacted - existing.influencers_contacted,
      )
    : 0;

  if (existing) {
    // Update existing report
    const { data: updated, error: updateError } = await admin
      .from("daily_reports")
      .update({
        hours_worked,
        star_rating,
        brands_contacted,
        influencers_contacted,
        calls_joined,
        outreach_count: brands_contacted + influencers_contacted + unsplitEmails,
        wins: wins || null,
        improvements: improvements || null,
        revenue: revenue ?? 0,
        profit: profit ?? 0,
        submitted_at: now,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await invalidateReportCaches(profile.id);
    return NextResponse.json({ data: updated });
  }

  // Insert new report
  const { data: report, error: insertError } = await admin
    .from("daily_reports")
    .insert({
      student_id: profile.id,
      date,
      hours_worked,
      star_rating,
      brands_contacted,
      influencers_contacted,
      calls_joined,
      outreach_count: brands_contacted + influencers_contacted, // backward compat
      wins: wins || null,
      improvements: improvements || null,
      revenue: revenue ?? 0,
      profit: profit ?? 0,
      submitted_at: now,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  await invalidateReportCaches(profile.id);
  return NextResponse.json({ data: report }, { status: 201 });
}
