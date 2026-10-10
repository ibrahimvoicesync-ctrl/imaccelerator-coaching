/**
 * Phase 64: Owner Analytics page (server component).
 *
 * Fetches the full 24-slot payload (migration 00035 `get_owner_analytics`)
 * once via `getOwnerAnalyticsCached` and hands it to `<OwnerAnalyticsClient>`.
 * The client component owns six independent Weekly / Monthly / Yearly /
 * All Time window toggles and swaps pre-computed slices on toggle — no
 * client re-fetch.
 *
 * Cache: unstable_cache(60s, key=["owner-analytics-v2"], tag=ownerAnalyticsTag())
 * invalidated from /api/deals, /api/deals/[id], /api/work-sessions/[id], and
 * (new in Phase 64) /api/reports. The editorial chrome refactor is
 * presentation-only — cache key, TTL, and tag are untouched.
 */

import { requireRole } from "@/lib/session";
import {
  getOwnerAnalyticsCached,
  getOwnerPlatformMetricsCached,
} from "@/lib/rpc/owner-analytics";
import { OwnerAnalyticsClient } from "./OwnerAnalyticsClient";
import { PlatformHoursPanel } from "@/components/owner/analytics/PlatformHoursPanel";
import { RoadmapStageBreakdown } from "@/components/owner/analytics/RoadmapStageBreakdown";


// Align route-level revalidation with the RPC cache TTL.
export const revalidate = 60;

export default async function OwnerAnalyticsPage() {
  await requireRole("owner");

  const [payload, metrics] = await Promise.all([
    getOwnerAnalyticsCached(),
    getOwnerPlatformMetricsCached(),
  ]);

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Analytics
          </p>
          <h1
            id="owner-analytics-h1"
            className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]"
          >
            Leaderboards
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Top performers across students and coaches — toggle each card
            independently.
          </p>
        </header>

        {/* Platform totals — hours by window + roadmap stage funnel */}
        <div
          className="mt-9 space-y-10 motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          <PlatformHoursPanel hours={metrics.hours} />
          <RoadmapStageBreakdown
            roadmap={metrics.roadmap}
            totalStudents={metrics.total_students}
          />
        </div>

        <OwnerAnalyticsClient payload={payload} />
      </div>
    </div>
  );
}
