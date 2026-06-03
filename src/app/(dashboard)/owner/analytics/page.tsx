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
import { getOwnerAnalyticsCached } from "@/lib/rpc/owner-analytics";
import { OwnerAnalyticsClient } from "./OwnerAnalyticsClient";


// Align route-level revalidation with the RPC cache TTL.
export const revalidate = 60;

export default async function OwnerAnalyticsPage() {
  await requireRole("owner");

  const payload = await getOwnerAnalyticsCached();

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
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

        <OwnerAnalyticsClient payload={payload} />
      </div>
    </div>
  );
}
