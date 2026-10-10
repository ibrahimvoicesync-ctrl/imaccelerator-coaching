/**
 * Phase 64: Owner Analytics RPC wrapper + cache layer (server-only).
 *
 * Calls public.get_owner_analytics (migration 00035 — expanded from Phase 54's
 * 00028) via the admin client and wraps the result in next/cache unstable_cache
 * (60s TTL, tag `owner-analytics` — global, not per-user).
 *
 * Phase 64 changes:
 *  - RPC returns 24 pre-computed slots (6 leaderboards x 4 windows) in one call.
 *  - unstable_cache KEY bumps from ["owner-analytics"] to ["owner-analytics-v2"]
 *    in the SAME atomic commit as migration 00035 so stale V1 shapes never
 *    leak through the cache.
 *  - Cache TAG (`owner-analytics`) is UNCHANGED so every existing
 *    revalidateTag(ownerAnalyticsTag(), "default") call site keeps working.
 *  - NEW invalidation: /api/reports (Plan 05, closes v1.6 audit defer).
 *
 * IMPORTANT: imports createAdminClient + next/cache — server-only. Client
 * components must import types from "@/lib/rpc/owner-analytics-types" instead,
 * never from this file. The `import "server-only"` line at the top will crash
 * the build loudly if a client component drags this module into its bundle.
 *
 * The RPC takes NO parameters. The owner is a single user with platform-wide
 * scope — no p_owner_id, no window, no pagination. All 24 slots per call.
 */

import "server-only";

import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ownerAnalyticsTag,
  type OwnerAnalyticsPayload,
  type OwnerPlatformMetrics,
} from "@/lib/rpc/owner-analytics-types";

// Re-export so server-side callers grab everything from one path.
export {
  OWNER_ANALYTICS_TAG,
  ownerAnalyticsTag,
} from "@/lib/rpc/owner-analytics-types";
export type {
  OwnerAnalyticsWindow,
  OwnerStudentHoursRow,
  OwnerStudentProfitRow,
  OwnerStudentDealsRow,
  OwnerCoachRevenueRow,
  OwnerCoachAvgOutreachRow,
  OwnerCoachDealsRow,
  OwnerLeaderboardsV2,
  OwnerAnalyticsPayload,
  OwnerHoursTotals,
  OwnerRoadmapReachRow,
  OwnerPlatformMetrics,
} from "@/lib/rpc/owner-analytics-types";

/**
 * Direct (uncached) RPC call. Use this only when the caller explicitly needs
 * the freshest data (none currently — both the /owner/analytics page and the
 * owner-homepage teaser share `getOwnerAnalyticsCached`). Exported for future
 * "force-fresh" surfaces and parity with coach-analytics.ts.
 *
 * NEVER swallows errors — logs and rethrows so callers surface the failure to
 * the Next.js error boundary or HTTP 500 (per CLAUDE.md Hard Rule #5).
 */
export async function fetchOwnerAnalytics(): Promise<OwnerAnalyticsPayload> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("get_owner_analytics");

  if (error) {
    console.error("[owner-analytics] RPC failed:", error);
    throw new Error(
      `Failed to load owner analytics: ${error.message ?? "unknown"} (code=${error.code ?? "?"})`,
    );
  }
  if (!data) {
    console.error("[owner-analytics] RPC returned no data");
    throw new Error("Failed to load owner analytics: RPC returned no data");
  }

  return data as unknown as OwnerAnalyticsPayload;
}

/**
 * Cached variant — wrapped in unstable_cache(60s) and tagged with
 * OWNER_ANALYTICS_TAG ("owner-analytics"). Plan 04 + 05 wire the five mutation
 * routes to call revalidateTag(OWNER_ANALYTICS_TAG, "default"):
 *   - POST /api/deals
 *   - PATCH /api/deals/[id]
 *   - DELETE /api/deals/[id]
 *   - PATCH /api/work-sessions/[id] (on completion)
 *   - POST /api/reports (both update-existing and insert-new branches — NEW in Phase 64)
 *
 * Cache key is `["owner-analytics-v2"]` — single key because the RPC takes no
 * params. The `v2` suffix forces a hard cache miss on deploy so the Phase 54
 * shape (hours_alltime / profit_alltime / deals_alltime) is never served after
 * the Phase 64 migration lands.
 */
export async function getOwnerAnalyticsCached(): Promise<OwnerAnalyticsPayload> {
  const cached = unstable_cache(
    async () => fetchOwnerAnalytics(),
    ["owner-analytics-v2"],
    {
      revalidate: 60,
      tags: [ownerAnalyticsTag()],
    },
  );
  return cached();
}

/**
 * Uncached call to public.get_owner_platform_metrics (migration 00048) —
 * windowed total hours (self-reported daily_reports.hours_worked) + roadmap
 * "reached" counts per step. Separate RPC from the leaderboards.
 *
 * Never swallows errors — logs and rethrows (CLAUDE.md Hard Rule #5).
 */
export async function fetchOwnerPlatformMetrics(): Promise<OwnerPlatformMetrics> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("get_owner_platform_metrics");

  if (error) {
    console.error("[owner-platform-metrics] RPC failed:", error);
    throw new Error(
      `Failed to load owner platform metrics: ${error.message ?? "unknown"} (code=${error.code ?? "?"})`,
    );
  }
  if (!data) {
    console.error("[owner-platform-metrics] RPC returned no data");
    throw new Error("Failed to load owner platform metrics: RPC returned no data");
  }

  return data as unknown as OwnerPlatformMetrics;
}

/**
 * Cached variant — unstable_cache(60s), keyed `["owner-platform-metrics-v1"]`,
 * tagged with the shared OWNER_ANALYTICS_TAG so existing daily_reports mutation
 * invalidations (/api/reports) already refresh the hours totals. Roadmap
 * mutations (/api/roadmap, /api/roadmap/undo) also call revalidateTag so the
 * funnel stays fresh when students advance.
 */
export async function getOwnerPlatformMetricsCached(): Promise<OwnerPlatformMetrics> {
  const cached = unstable_cache(
    async () => fetchOwnerPlatformMetrics(),
    ["owner-platform-metrics-v1"],
    {
      revalidate: 60,
      tags: [ownerAnalyticsTag()],
    },
  );
  return cached();
}
