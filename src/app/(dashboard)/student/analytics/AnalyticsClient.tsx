"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DollarSign,
  Flame,
  Handshake,
  Mail,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { WORK_TRACKER } from "@/lib/config";
import { cn } from "@/lib/utils";
import {
  STUDENT_ANALYTICS_RANGES,
  type StudentAnalyticsPayload,
  type StudentAnalyticsRange,
} from "@/lib/rpc/student-analytics-types";

// Recharts requires literal hex values for stroke/fill props. Mirrors the ima-* tokens.
const chartColors = {
  primary: "#2563EB", // ima-primary
  border: "#E2E8F0", // ima-border
  textMuted: "#64748B", // ima-text-secondary
} as const;


const RANGE_LABELS: Record<StudentAnalyticsRange, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

const RANGE_ARIA_LABELS: Record<StudentAnalyticsRange, string> = {
  daily: "Daily view",
  weekly: "Weekly view",
  monthly: "Monthly view",
};

interface AnalyticsClientProps {
  initialData: StudentAnalyticsPayload;
  initialRange: StudentAnalyticsRange;
  basePath: "/student/analytics" | "/student_diy/analytics";
  /** Student DIY hides outreach metrics (KPIs + trend chart). Default true for the mentored student view. */
  showOutreach?: boolean;
}

export function AnalyticsClient({
  initialData,
  initialRange,
  basePath,
  showOutreach = true,
}: AnalyticsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const data = initialData;
  const range = initialRange;

  const navigate = useCallback(
    (nextRange: StudentAnalyticsRange) => {
      const params = new URLSearchParams();
      params.set("range", nextRange);
      startTransition(() => {
        router.push(`${basePath}?${params.toString()}`, { scroll: false });
      });
    },
    [basePath, router],
  );

  const onRangeChange = useCallback(
    (r: StudentAnalyticsRange) => {
      if (r === range) return;
      navigate(r);
    },
    [navigate, range],
  );

  const outreachSummary = useMemo(() => {
    const brands = data.outreach_trend.reduce((s, b) => s + b.brands, 0);
    const influencers = data.outreach_trend.reduce(
      (s, b) => s + b.influencers,
      0,
    );
    return { brands, influencers };
  }, [data.outreach_trend]);

  const hoursSummary = useMemo(
    () =>
      data.hours_trend.reduce(
        (s, b) => s + (typeof b.hours === "number" ? b.hours : Number(b.hours)),
        0,
      ),
    [data.hours_trend],
  );

  const hoursBucketLabel =
    range === "daily" ? "day" : range === "weekly" ? "week" : "month";

  return (
    <div
      className={cn(
        "space-y-10",
        isPending && "opacity-75 motion-safe:transition-opacity",
      )}
      aria-busy={isPending || undefined}
    >
      {/* Masthead — editorial kicker + title + lead (matches dashboard rhythm). */}
      <header id="student-analytics-h1" className="motion-safe:animate-fadeIn">
        <p
          className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
        >
          Analytics · Lifetime
        </p>
        <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
          Lifetime performance
        </h1>
        <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
          {showOutreach
            ? "Hours, outreach, and deals — at a glance."
            : "Hours and deals — at a glance."}
        </p>
      </header>

      {/* Hero — single focal point: lifetime hours. */}
      <section
        aria-labelledby="analytics-hero-label"
        className="motion-safe:animate-fadeIn"
        style={{ animationDelay: "100ms" }}
      >
        <div className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p
              id="analytics-hero-label"
              className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
            >
              Lifetime Hours
            </p>
            {data.streak > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-surface-accent border border-ima-primary/20 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-primary tabular-nums"
              >
                <Flame className="h-3 w-3" aria-hidden="true" />
                {data.streak}-day streak
              </span>
            ) : null}
          </div>

          <div className="mt-6 flex items-end gap-3 flex-wrap">
            <span className="text-6xl md:text-7xl font-semibold tabular-nums tracking-tight leading-[0.95] text-ima-primary">
              {formatHoursCompact(data.totals.total_hours ?? 0)}
            </span>
            <span className="pb-2 text-[15px] font-medium text-ima-text-secondary tabular-nums">
              hrs worked · all time
            </span>
          </div>
        </div>
      </section>

      {/* KPI strip — compact stat cards (matches dashboard / coach KPI grid). */}
      <section
        aria-label="Lifetime totals"
        className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-[14px] motion-safe:animate-fadeIn",
          showOutreach ? "lg:grid-cols-5" : "lg:grid-cols-3",
        )}
        style={{ animationDelay: "150ms" }}
      >
        {showOutreach ? (
          <>
            <StatCard
              icon={Mail}
              tint="primary"
              label="Brand Outreach"
              value={(data.totals.total_brand_outreach ?? 0).toLocaleString()}
            />
            <StatCard
              icon={Users}
              tint="primary"
              label="Influencer Outreach"
              value={(
                data.totals.total_influencer_outreach ?? 0
              ).toLocaleString()}
            />
          </>
        ) : null}
        <StatCard
          icon={Handshake}
          tint="accent"
          label="Total Deals"
          value={(data.totals.total_deals ?? 0).toLocaleString()}
        />
        <StatCard
          icon={DollarSign}
          tint="primary"
          label="Revenue"
          value={formatMoney(data.totals.total_revenue ?? 0)}
        />
        <StatCard
          icon={TrendingUp}
          tint="success"
          label="Profit"
          value={formatMoney(data.totals.total_profit ?? 0)}
        />
      </section>

      {/* Trend — editorial kicker + pill range selector, then charts. */}
      <section aria-label="Trend charts" className="motion-safe:animate-slideUp">
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Trend
          </p>
          <RangePills range={range} onChange={onRangeChange} />
        </div>

        <div
          className={cn(
            "grid grid-cols-1 gap-[14px]",
            showOutreach && "lg:grid-cols-2",
          )}
        >
          {showOutreach ? (
            <TrendCard
              kicker="Outreach"
              meta={`${outreachSummary.brands + outreachSummary.influencers} sent`}
            >
              {data.outreach_trend.length === 0 ? (
                <EmptyState
                  variant="compact"
                  title="No activity in this range"
                  description="Try a longer time range, or check back after your next session."
                />
              ) : (
                <>
                  <div
                    role="img"
                    aria-label={`Outreach for the selected range. Brands sent: ${outreachSummary.brands}. Influencers sent: ${outreachSummary.influencers}.`}
                    tabIndex={0}
                    className="focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded"
                  >
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart
                        data={data.outreach_trend}
                        margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                      >
                        <defs>
                          <linearGradient
                            id="outreachBrandsFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={chartColors.primary}
                              stopOpacity={0.18}
                            />
                            <stop
                              offset="100%"
                              stopColor={chartColors.primary}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke={chartColors.border}
                          vertical={false}
                        />
                        <XAxis
                          dataKey="bucket"
                          stroke={chartColors.textMuted}
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) =>
                            formatBucketTick(String(v), range)
                          }
                        />
                        <YAxis
                          stroke={chartColors.textMuted}
                          fontSize={11}
                          tickLine={false}
                          axisLine={false}
                          allowDecimals={false}
                          width={30}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#FFFFFF",
                            border: `1px solid ${chartColors.border}`,
                            borderRadius: 12,
                            fontSize: 12,
                            boxShadow:
                              "0 8px 25px -5px rgba(15, 23, 42, 0.08)",
                          }}
                          labelFormatter={(label) =>
                            formatBucketTick(String(label), range)
                          }
                        />
                        <Area
                          type="monotone"
                          dataKey="brands"
                          name="Brands"
                          stroke={chartColors.primary}
                          strokeWidth={2}
                          fill="url(#outreachBrandsFill)"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="influencers"
                          name="Influencers"
                          stroke={chartColors.primary}
                          strokeOpacity={0.4}
                          strokeWidth={2}
                          strokeDasharray="4 3"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div
                    className="flex items-center gap-4 mt-4 text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full bg-ima-primary"
                        aria-hidden="true"
                      />
                      Brands ·{" "}
                      <span className="tabular-nums text-ima-text">
                        {outreachSummary.brands}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full bg-ima-primary/40"
                        aria-hidden="true"
                      />
                      Influencers ·{" "}
                      <span className="tabular-nums text-ima-text">
                        {outreachSummary.influencers}
                      </span>
                    </span>
                  </div>
                  <DataTable
                    caption={`Outreach per ${hoursBucketLabel} (brands and influencers).`}
                    headers={[
                      range === "daily"
                        ? "Date"
                        : range === "weekly"
                          ? "Week of"
                          : "Month",
                      "Brands",
                      "Influencers",
                    ]}
                    rows={data.outreach_trend.map((b) => [
                      formatBucketTick(b.bucket, range),
                      String(b.brands),
                      String(b.influencers),
                    ])}
                  />
                </>
              )}
            </TrendCard>
          ) : null}

          <TrendCard
            kicker="Hours worked"
            meta={`${hoursSummary.toFixed(1)} hrs`}
          >
            {data.hours_trend.length === 0 ? (
              <EmptyState
                variant="compact"
                title="No activity in this range"
                description="Try a longer time range, or check back after your next session."
              />
            ) : (
              <>
                <div
                  role="img"
                  aria-label={`Hours worked per ${hoursBucketLabel} for the selected range. Total: ${hoursSummary.toFixed(1)} hours.`}
                  tabIndex={0}
                  className="focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded"
                >
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart
                      data={data.hours_trend}
                      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={chartColors.border}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="bucket"
                        stroke={chartColors.textMuted}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) =>
                          formatBucketTick(String(v), range)
                        }
                      />
                      <YAxis
                        stroke={chartColors.textMuted}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        width={30}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(37, 99, 235, 0.05)" }}
                        contentStyle={{
                          backgroundColor: "#FFFFFF",
                          border: `1px solid ${chartColors.border}`,
                          borderRadius: 12,
                          fontSize: 12,
                          boxShadow:
                            "0 8px 25px -5px rgba(15, 23, 42, 0.08)",
                        }}
                        labelFormatter={(label) =>
                          formatBucketTick(String(label), range)
                        }
                      />
                      {hoursBucketLabel === "day" && (
                        <ReferenceLine
                          y={WORK_TRACKER.dailyGoalHours}
                          stroke={chartColors.textMuted}
                          strokeDasharray="4 4"
                          label={{
                            value: "Daily goal",
                            fill: chartColors.textMuted,
                            fontSize: 10,
                            position: "insideTopRight",
                          }}
                        />
                      )}
                      <Bar
                        dataKey="hours"
                        name="Hours"
                        fill={chartColors.primary}
                        radius={[6, 6, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p
                  className="mt-4 text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary"
                >
                  Per {hoursBucketLabel} ·{" "}
                  <span className="tabular-nums text-ima-text">
                    {hoursSummary.toFixed(1)} hrs total
                  </span>
                </p>
                <DataTable
                  caption={`Hours worked per ${hoursBucketLabel}.`}
                  headers={[
                    range === "daily"
                      ? "Date"
                      : range === "weekly"
                        ? "Week of"
                        : "Month",
                    "Hours",
                  ]}
                  rows={data.hours_trend.map((b) => [
                    formatBucketTick(b.bucket, range),
                    Number(b.hours).toFixed(2),
                  ])}
                />
              </>
            )}
          </TrendCard>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type StatTint = "primary" | "success" | "warning" | "accent";

const STAT_TINTS: Record<StatTint, { bg: string; fg: string }> = {
  primary: { bg: "bg-ima-surface-accent", fg: "text-ima-primary" },
  success: { bg: "bg-ima-success/10", fg: "text-ima-success" },
  warning: { bg: "bg-ima-warning/10", fg: "text-ima-warning" },
  accent: { bg: "bg-ima-surface-light", fg: "text-ima-text-secondary" },
};

function StatCard({
  icon: Icon,
  tint,
  label,
  value,
}: {
  icon: LucideIcon;
  tint: StatTint;
  label: string;
  value: string;
}) {
  const t = STAT_TINTS[tint];
  return (
    <div className="flex items-start gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]">
      <div
        className={cn(
          "w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0",
          t.bg,
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", t.fg)} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[24px] md:text-[28px] font-semibold leading-none tabular-nums tracking-tight text-ima-text">
          {value}
        </p>
        <p
          className="mt-[8px] text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function TrendCard({
  kicker,
  meta,
  children,
}: {
  kicker: string;
  meta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-ima-border rounded-[14px] p-5 md:p-6">
      <div className="flex items-baseline justify-between gap-3 mb-5">
        <p
          className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
        >
          {kicker}
        </p>
        <p className="text-[12px] text-ima-text-secondary tabular-nums">
          {meta}
        </p>
      </div>
      {children}
    </div>
  );
}

function DataTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: string[];
  rows: string[][];
}) {
  return (
    <details className="mt-4 group">
      <summary
        className="min-h-[44px] inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-primary cursor-pointer hover:text-ima-primary-hover focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded"
      >
        View data table
      </summary>
      <table className="w-full text-[12px] mt-3 border border-ima-border rounded-[10px] overflow-hidden tabular-nums">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-ima-surface-light">
          <tr>
            {headers.map((h, i) => (
              <th
                key={h}
                scope="col"
                className={cn(
                  "p-2 text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary",
                  i === 0 ? "text-left" : "text-right",
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className="border-t border-ima-border">
              {r.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    "p-2 text-ima-text",
                    i === 0 ? "text-left" : "text-right",
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function RangePills({
  range,
  onChange,
}: {
  range: StudentAnalyticsRange;
  onChange: (r: StudentAnalyticsRange) => void;
}) {
  return (
    <div
      className="flex gap-[6px] flex-wrap"
      role="tablist"
      aria-label="Select time range"
    >
      {STUDENT_ANALYTICS_RANGES.map((r) => {
        const active = r === range;
        return (
          <button
            key={r}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={RANGE_ARIA_LABELS[r]}
            onClick={() => onChange(r)}
            className={cn(
              "min-h-[44px] min-w-[48px] px-[14px] rounded-[10px] text-[12px] font-semibold tracking-wide motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
              active
                ? "bg-ima-primary text-white"
                : "bg-white border border-ima-border text-ima-text hover:border-ima-border",
            )}
          >
            {RANGE_LABELS[r]}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatHoursCompact(hours: number): string {
  if (!Number.isFinite(hours)) return "0";
  const rounded = Math.round(hours * 10) / 10;
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function formatMoney(amount: number): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "$0";
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatDateTick(value: string): string {
  if (!value) return "";
  const date = value.includes("T") ? value.split("T")[0] : value;
  const parts = date.split("-");
  if (parts.length !== 3) return value;
  const [, m, d] = parts;
  return `${m}/${d}`;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatBucketTick(value: string, range: StudentAnalyticsRange): string {
  if (!value) return "";
  if (range !== "monthly") return formatDateTick(value);
  const date = value.includes("T") ? value.split("T")[0] : value;
  const parts = date.split("-");
  if (parts.length !== 3) return value;
  const monthIdx = Number(parts[1]) - 1;
  if (monthIdx < 0 || monthIdx > 11) return value;
  return MONTH_NAMES[monthIdx];
}
