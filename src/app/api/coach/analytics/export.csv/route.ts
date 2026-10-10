/**
 * Phase 48: GET /api/coach/analytics/export.csv
 *
 * Streams the coach's full filtered student list as a CSV download. Uses the
 * same get_coach_analytics RPC the page uses, but with page_size=5000 so the
 * export is the full result set (not just the current page). Defensive cap at
 * 5000 — a coach with > 5000 assigned students must refine the search first.
 *
 * Auth gated to coach role; uses admin client per CLAUDE.md rule #4.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/session";
import { getTodayUTC } from "@/lib/utils";
import { fetchCoachAnalytics } from "@/lib/rpc/coach-analytics";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  COACH_ANALYTICS_SORT_KEYS,
  type CoachAnalyticsSort,
  type CoachStudentRow,
} from "@/lib/rpc/coach-analytics-types";

// Always run dynamically — the auth check + filter params change per request.
export const dynamic = "force-dynamic";

// Subset of the page's Zod schema — only sort + search are honored on export.
const exportParamsSchema = z.object({
  sort: z
    .enum(COACH_ANALYTICS_SORT_KEYS as unknown as [CoachAnalyticsSort, ...CoachAnalyticsSort[]])
    .default("name_asc"),
  search: z.string().trim().max(100).default(""),
});

const EXPORT_HARD_CAP = 5000;

// RFC 4180: wrap fields containing comma/quote/newline in double quotes,
// double internal quotes. Always quote the name field defensively.
//
// CSV/formula injection: spreadsheet apps (Excel/Sheets) evaluate a cell as a
// formula when its value begins with = + - @ (or a leading tab/CR). Since some
// fields (e.g. the student name from their Google display name) are
// attacker-controlled, prefix such values with a single quote so they render
// as literal text instead of executing.
function csvEscape(value: string): string {
  let safe = value;
  if (/^[=+\-@\t\r]/.test(safe)) {
    safe = `'${safe}`;
  }
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function rowToCsv(row: CoachStudentRow): string {
  return [
    csvEscape(row.name),
    String(row.hours_this_week_minutes),
    String(row.emails_this_week),
    String(row.deals_alltime),
    String(row.roadmap_step),
    csvEscape(row.last_active_date ?? ""),
    row.activity_status === "active" ? "Active" : "Kaslan",
  ].join(",");
}

export async function GET(request: NextRequest) {
  try {
    // 1. Auth + role gate.
    const user = await getSessionUser();
    if (user.role !== "coach") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 2. Rate limit (per D-01, D-04 — 30 req/min/user matches all coach API routes).
    const { allowed, retryAfterSeconds } = await checkRateLimit(
      user.id,
      "/api/coach/analytics/export.csv"
    );
    if (!allowed) {
      return NextResponse.json(
        { error: `Too many requests, try again in ${retryAfterSeconds} seconds.` },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      );
    }

    // 3. Validate params.
    const url = new URL(request.url);
    const raw: Record<string, string> = {};
    for (const [k, v] of url.searchParams.entries()) raw[k] = v;
    const parsed = exportParamsSchema.safeParse(raw);
    if (!parsed.success) {
      return new NextResponse("Invalid export parameters.", { status: 400 });
    }

    const today = getTodayUTC();

    // 4. Fetch full filtered set (no pagination — single dump).
    const payload = await fetchCoachAnalytics(user.id, {
      page: 1,
      pageSize: EXPORT_HARD_CAP,
      sort: parsed.data.sort,
      search: parsed.data.search,
      windowDays: 7,
      today,
      leaderboardLimit: 5,
    });

    if (payload.pagination.total > EXPORT_HARD_CAP) {
      return new NextResponse("Export too large. Refine your search.", {
        status: 400,
      });
    }

    // 5. Build CSV body.
    const header =
      "Name,Hours This Week (minutes),Emails This Week,All-Time Deals,Roadmap Step,Last Active (ISO),Status";
    const lines = [header, ...payload.students.map(rowToCsv)];
    const body = lines.join("\r\n") + "\r\n";

    // 6. Return as attachment.
    const nameSlug =
      user.name
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[^\w\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-") || "coach";
    const filename = `ima-coach-analytics-${nameSlug}-${today}.csv`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[GET /api/coach/analytics/export.csv] Failed:", err);
    return new NextResponse("Export failed.", { status: 500 });
  }
}
