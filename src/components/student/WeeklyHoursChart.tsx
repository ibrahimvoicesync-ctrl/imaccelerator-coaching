"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { WORK_TRACKER } from "@/lib/config";
import type { DailyHours } from "@/lib/weekly-hours";

// Mirror the student-analytics chart palette (ima tokens).
const chartColors = {
  primary: "#2563EB",
  border: "#E2E8F0",
  textMuted: "#64748B",
} as const;

export function WeeklyHoursChart({ data }: { data: DailyHours[] }) {
  const total = data.reduce((sum, d) => sum + d.hours, 0);

  return (
    <section
      aria-labelledby="weekly-hours-label"
      className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8"
    >
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <p
          id="weekly-hours-label"
          className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted"
        >
          Hours This Week
        </p>
        <p className="text-sm font-semibold tabular-nums tracking-tight text-ima-text">
          {total.toFixed(1)}h
        </p>
      </div>

      <div
        role="img"
        aria-label={`Hours worked each day this week. Total ${total.toFixed(1)} hours.`}
        tabIndex={0}
        className="rounded focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
      >
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
              width={28}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: "rgba(37, 99, 235, 0.05)" }}
              contentStyle={{
                backgroundColor: "#FFFFFF",
                border: `1px solid ${chartColors.border}`,
                borderRadius: 12,
                fontSize: 12,
                boxShadow: "0 8px 25px -5px rgba(15, 23, 42, 0.08)",
              }}
            />
            <ReferenceLine
              y={WORK_TRACKER.dailyGoalHours}
              stroke={chartColors.textMuted}
              strokeDasharray="4 4"
            />
            <Bar dataKey="hours" name="Hours" fill={chartColors.primary} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
