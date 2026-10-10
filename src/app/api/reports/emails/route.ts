import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { VALIDATION } from "@/lib/config";
import { getToday } from "@/lib/utils";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";
import { emailCountsFromReport } from "@/lib/emails";
import { invalidateReportCaches } from "@/lib/report-cache";

/**
 * Quick email log (Work Tracker). Adds deltas to today's daily_reports row,
 * creating it as an unsubmitted draft if needed — so emails can be logged
 * through the day without writing the full report. `total` is emails logged
 * without a brand/influencer split; it only raises `outreach_count`.
 * Negative deltas correct a mistake; every count floors at 0.
 */
const delta = z.number().int().min(-VALIDATION.outreachCount.max).max(VALIDATION.outreachCount.max);
const postSchema = z
  .object({
    brands: delta.optional(),
    influencers: delta.optional(),
    total: delta.optional(),
  })
  .refine((d) => (d.brands ?? 0) !== 0 || (d.influencers ?? 0) !== 0 || (d.total ?? 0) !== 0, {
    message: "Enter how many emails you sent",
  });

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));

export async function POST(request: NextRequest) {
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
  if (profile.role !== "student") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/reports/emails");
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

  const date = getToday();
  const { data: existing, error: fetchError } = await admin
    .from("daily_reports")
    .select("id, brands_contacted, influencers_contacted, outreach_count, submitted_at")
    .eq("student_id", profile.id)
    .eq("date", date)
    .maybeSingle();
  if (fetchError) {
    console.error("[reports/emails] failed to load today's report:", fetchError);
    return NextResponse.json({ error: "Failed to load today's report" }, { status: 500 });
  }

  const current = emailCountsFromReport(existing);
  const brands = clamp(current.brands + (parsed.data.brands ?? 0), VALIDATION.brandsContacted.max);
  const influencers = clamp(
    current.influencers + (parsed.data.influencers ?? 0),
    VALIDATION.influencersContacted.max,
  );
  const unsplit = clamp(
    current.total - current.brands - current.influencers + (parsed.data.total ?? 0),
    VALIDATION.outreachCount.max,
  );
  const counts = {
    brands_contacted: brands,
    influencers_contacted: influencers,
    outreach_count: brands + influencers + unsplit,
  };

  const { error: writeError } = existing
    ? await admin.from("daily_reports").update(counts).eq("id", existing.id)
    : await admin.from("daily_reports").insert({ student_id: profile.id, date, ...counts });
  if (writeError) {
    console.error("[reports/emails] failed to save:", writeError);
    return NextResponse.json({ error: "Failed to save emails" }, { status: 500 });
  }

  // Drafts are invisible to the analytics RPCs (submitted_at filter), so only
  // a submitted report's caches go stale.
  if (existing?.submitted_at) await invalidateReportCaches(profile.id);

  return NextResponse.json({
    data: emailCountsFromReport(counts),
  });
}
