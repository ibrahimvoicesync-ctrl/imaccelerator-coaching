import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BUSINESS_CHECKIN } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";
import { verifyOrigin } from "@/lib/csrf";

const money = z.number().min(0).max(BUSINESS_CHECKIN.moneyMax);
const count = (max: number) => z.number().int().min(0).max(max);
const requiredText = z.string().trim().min(1, "Please fill in every required question").max(BUSINESS_CHECKIN.textMax);
const optionalText = z
  .string()
  .trim()
  .max(BUSINESS_CHECKIN.textMax)
  .optional()
  .transform((v) => (v ? v : null));

const postSchema = z.object({
  total_revenue: money,
  revenue_target_next_month: money,
  liquid_capital_business: money,
  liquid_capital_personal: money,
  monthly_expenses: money.nullable().optional(),
  current_goal: requiredText,
  current_constraint: requiredText,
  employees: count(BUSINESS_CHECKIN.employeesMax),
  influencers: count(BUSINESS_CHECKIN.rosterMax),
  brands: count(BUSINESS_CHECKIN.rosterMax),
  hours_per_week: z.number().int().min(0).max(168).nullable().optional(),
  feeling: z.number().int().min(1).max(5),
  feeling_note: optionalText,
  biggest_win: optionalText,
  help_wanted: optionalText,
});

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

  const { allowed, retryAfterSeconds } = await checkRateLimit(profile.id, "/api/business-checkins", 5);
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

  const { data, error } = await admin
    .from("business_checkins")
    .insert({
      student_id: profile.id,
      ...parsed.data,
      monthly_expenses: parsed.data.monthly_expenses ?? null,
      hours_per_week: parsed.data.hours_per_week ?? null,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[business-checkins] insert failed:", error);
    return NextResponse.json({ error: "Failed to save check-in" }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}
