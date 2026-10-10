"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KPI_TARGETS } from "@/lib/config";
import { EMAIL_SERIES_COLORS } from "@/lib/emails";
import type { DailyEmails } from "@/lib/weekly-emails";

const chartColors = {
  border: "#E2E8F0", // ima-border
  textMuted: "#5F6E85", // ima-text-secondary
} as const;

const SERIES = [
  { key: "brands", label: "Brands", color: EMAIL_SERIES_COLORS.brands, width: 2 },
  { key: "influencers", label: "Influencers", color: EMAIL_SERIES_COLORS.influencers, width: 2 },
  { key: "total", label: "Total", color: EMAIL_SERIES_COLORS.total, width: 3 },
] as const;

export function WeeklyEmailsChart({ data }: { data: DailyEmails[] }) {
  const total = data.reduce((sum, d) => sum + d.total, 0);
  const brands = data.reduce((sum, d) => sum + d.brands, 0);
  const influencers = data.reduce((sum, d) => sum + d.influencers, 0);

  return (
    <section
      aria-labelledby="weekly-emails-label"
      className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-8"
    >
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <p
          id="weekly-emails-label"
          className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary"
        >
          Emails This Week
        </p>
        <div className="flex items-center gap-[14px]">
          <ul className="flex items-center gap-[10px] text-[11px] text-ima-text-secondary">
            {SERIES.map((s) => (
              <li key={s.key} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-3 rounded-full"
                  style={{ backgroundColor: s.color, height: s.width }}
                  aria-hidden="true"
                />
                {s.label}
              </li>
            ))}
          </ul>
          <p className="text-sm font-semibold tabular-nums tracking-tight text-ima-text">
            {total.toLocaleString("en-US")}
          </p>
        </div>
      </div>

      <div
        role="img"
        aria-label={`Emails sent each day this week. Total ${total}: ${brands} to brands, ${influencers} to influencers.`}
        tabIndex={0}
        className="rounded focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
      >
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.border} vertical={false} />
            <XAxis
              dataKey="day"
              stroke={chartColors.textMuted}
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke={chartColors.textMuted}
              fontSize={11}
              tickLine={false}
              axisLine={false}
              width={32}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: chartColors.border }}
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: `1px solid ${chartColors.border}`,
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "0 8px 25px -5px rgba(15, 23, 42, 0.08)",
              }}
            />
            <ReferenceLine
              y={KPI_TARGETS.dailyOutreach}
              stroke={chartColors.textMuted}
              strokeDasharray="4 4"
            />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={s.width}
                dot={false}
                activeDot={{ r: s.key === "total" ? 4 : 3 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
