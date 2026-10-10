"use client";

/**
 * Phase 48: 12-week "Deals Closed Over Time" bar chart (Recharts).
 *
 * a11y contract: role=img + tabIndex={0} on the chart wrapper, with a sentence-
 * form aria-label and a <details> fallback that exposes the underlying numbers
 * to screen readers and keyboard users (mirrors Phase 46 student analytics).
 *
 * isAnimationActive={false} respects users with prefers-reduced-motion (Recharts
 * does not honor the media query natively).
 *
 * The chartColors const is the ONLY hex-literal block in this phase. Recharts
 * requires literal stroke/fill values, so a single audited mapping mirrors the
 * tailwind ima-* tokens. Any addition goes through ima-token review.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import type { CoachDealsTrendBucket } from "@/lib/rpc/coach-analytics-types";

// Mirrors tailwind.config.ts ima-* tokens. Recharts requires literal hex
// for stroke/fill props, so a single audited constant lives here.
// Any addition goes through ima-token review.
const chartColors = {
  primary: "#2563EB", // ima-primary
  border: "#E2E8F0", // ima-border
  textSecondary: "#5F6E85", // ima-text-secondary
} as const;

function formatWeekLabel(weekStart: string): string {
  // weekStart is YYYY-MM-DD; format as "MMM d" without using a heavy date lib
  // (date-fns is already a dep but keeping this inline avoids extra import).
  const d = new Date(weekStart + "T00:00:00Z");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  return `${month} ${day}`;
}

export function DealsTrendChart({ buckets }: { buckets: CoachDealsTrendBucket[] }) {
  const allZero = buckets.every((b) => b.deals === 0);
  const data = buckets.map((b) => ({
    weekLabel: formatWeekLabel(b.week_start),
    weekStart: b.week_start,
    deals: b.deals,
  }));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-ima-text">
            Deals Closed Over Time
          </h2>
          <p className="text-xs text-ima-text-secondary mt-1">
            Last 12 weeks (week starting Monday)
          </p>
        </div>

        {allZero ? (
          <EmptyState
            variant="compact"
            title="No deals in the last 12 weeks"
            description="Once a student closes a deal, it'll show up here."
          />
        ) : (
          <>
            <div
              role="img"
              tabIndex={0}
              aria-label="Bar chart: Deals closed per week, last 12 weeks. A text summary follows below."
              className="rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
            >
              <ResponsiveContainer width="100%" height={288}>
                <BarChart data={data}>
                  <CartesianGrid
                    stroke={chartColors.border}
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="weekLabel"
                    stroke={chartColors.textSecondary}
                    fontSize={12}
                  />
                  <YAxis
                    allowDecimals={false}
                    stroke={chartColors.textSecondary}
                    fontSize={12}
                  />
                  <Tooltip
                    cursor={{ fill: chartColors.border, opacity: 0.3 }}
                    contentStyle={{
                      borderRadius: 8,
                      borderColor: chartColors.border,
                    }}
                  />
                  <Bar
                    dataKey="deals"
                    fill={chartColors.primary}
                    radius={[4, 4, 0, 0]}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-ima-text-secondary min-h-[44px] inline-flex items-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded">
                View chart data as text
              </summary>
              <ul className="mt-2 space-y-1">
                {data.map((d) => (
                  <li key={d.weekStart} className="text-ima-text">
                    Week of {d.weekLabel}: {d.deals} deals
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}
