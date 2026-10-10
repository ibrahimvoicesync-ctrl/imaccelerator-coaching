/**
 * Phase 64: Owner Analytics — pure types + tag helper (expanded to 24 slots).
 *
 * Safe to import from client components — no server-only deps. The server-side
 * fetcher + cache wrapper lives in ./owner-analytics.ts and imports the admin
 * client + next/cache.
 *
 * Source of truth is the public.get_owner_analytics RPC envelope (migration
 * 00035). Every key here matches a jsonb_build_object key there.
 *
 * Phase 54 shape (3 lifetime leaderboards) is replaced by Phase 64 shape
 * (6 leaderboards x 4 windows = 24 pre-computed slots). The cache tag
 * (`owner-analytics`) is UNCHANGED — only the cache KEY bumps to
 * `owner-analytics-v2` in src/lib/rpc/owner-analytics.ts so existing
 * revalidateTag(ownerAnalyticsTag(), ...) call sites keep working.
 */

// ---------------------------------------------------------------------------
// Window keys (trailing N-days semantics — WS-02 resolution):
//   weekly  = last 7 days
//   monthly = last 30 days
//   yearly  = last 365 days
//   alltime = no filter
// ---------------------------------------------------------------------------
export type OwnerAnalyticsWindow = "weekly" | "monthly" | "yearly" | "alltime";

// ---------------------------------------------------------------------------
// Shared row base
// ---------------------------------------------------------------------------
type BaseRow = {
  rank: number;
  metric_display: string;
};

// ---------------------------------------------------------------------------
// Student leaderboard rows (hours, profit, deals)
// ---------------------------------------------------------------------------
export type OwnerStudentHoursRow = BaseRow & {
  student_id: string;
  student_name: string;
  minutes: number;
};

export type OwnerStudentProfitRow = BaseRow & {
  student_id: string;
  student_name: string;
  // Postgres NUMERIC serializes as string via supabase-js — keep as string.
  // metric_display is what we render; never re-parse.
  profit: string;
};

export type OwnerStudentDealsRow = BaseRow & {
  student_id: string;
  student_name: string;
  deals: number;
};

// ---------------------------------------------------------------------------
// Coach leaderboard rows (revenue, avg_total_outreach, deals)
// ---------------------------------------------------------------------------
export type OwnerCoachRevenueRow = BaseRow & {
  coach_id: string;
  coach_name: string;
  // NUMERIC — string from supabase-js.
  profit: string;
};

export type OwnerCoachAvgOutreachRow = BaseRow & {
  coach_id: string;
  coach_name: string;
  // NUMERIC — string from supabase-js. avg brands+influencers per student per day.
  avg: string;
};

export type OwnerCoachDealsRow = BaseRow & {
  coach_id: string;
  coach_name: string;
  deals: number;
};

// ---------------------------------------------------------------------------
// Per-window buckets — every leaderboard has all four windows pre-computed.
// ---------------------------------------------------------------------------
type Buckets<T> = {
  weekly: T[];
  monthly: T[];
  yearly: T[];
  alltime: T[];
};

// ---------------------------------------------------------------------------
// Top-level leaderboards envelope (24 slots total)
// ---------------------------------------------------------------------------
export type OwnerLeaderboardsV2 = {
  students: {
    hours: Buckets<OwnerStudentHoursRow>;
    profit: Buckets<OwnerStudentProfitRow>;
    deals: Buckets<OwnerStudentDealsRow>;
  };
  coaches: {
    revenue: Buckets<OwnerCoachRevenueRow>;
    avg_total_outreach: Buckets<OwnerCoachAvgOutreachRow>;
    deals: Buckets<OwnerCoachDealsRow>;
  };
};

export type OwnerAnalyticsPayload = {
  leaderboards: OwnerLeaderboardsV2;
};

// ---------------------------------------------------------------------------
// Platform metrics (migration 00048 — get_owner_platform_metrics).
// Separate RPC from the leaderboards above. Numbers are embedded in the RPC's
// jsonb envelope, so supabase-js returns them as JS numbers (the "NUMERIC →
// string" caveat only applies to top-level column selects).
//   Windows: weekly = last 7d, monthly = last 30d, ninety = last 90d, alltime.
//   hours are self-reported daily_reports.hours_worked, rounded to 1 decimal.
//   roadmap[i].students_reached = students whose furthest reached step
//   (status active|completed) is >= step_number — cumulative "reached".
// ---------------------------------------------------------------------------
export type OwnerHoursTotals = {
  weekly: number;
  monthly: number;
  ninety: number;
  alltime: number;
};

export type OwnerRoadmapReachRow = {
  step_number: number;
  students_reached: number;
};

export type OwnerPlatformMetrics = {
  total_students: number;
  hours: OwnerHoursTotals;
  roadmap: OwnerRoadmapReachRow[];
};

// ---------------------------------------------------------------------------
// Cache tag — GLOBAL (not per-user). See file header for rationale.
// Unchanged from Phase 54 — every existing revalidateTag(ownerAnalyticsTag())
// call site in /api/deals, /api/deals/[id], /api/work-sessions/[id], and
// (new in Phase 64) /api/reports keeps working.
// ---------------------------------------------------------------------------
export const OWNER_ANALYTICS_TAG = "owner-analytics" as const;

/**
 * revalidateTag key for the owner's cached analytics RPC result.
 *
 * Every mutation on deals, work_sessions, or daily_reports that changes
 * leaderboard totals MUST call revalidateTag(ownerAnalyticsTag(), "default").
 * Phase 64 adds the POST /api/reports branches (closes the v1.6 audit
 * deferred item).
 *
 * Takes no argument (global tag). Function signature mirrors the per-user
 * helpers (`coachAnalyticsTag(coachId)`) so callers have a consistent "call a
 * function to get the tag string" pattern, which makes grep sweeps easier.
 */
export function ownerAnalyticsTag(): string {
  return OWNER_ANALYTICS_TAG;
}
