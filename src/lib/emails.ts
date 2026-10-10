/**
 * Email-outreach counts live on `daily_reports` — `brands_contacted`,
 * `influencers_contacted`, and `outreach_count` (the total). The total can
 * exceed brands + influencers when a student quick-logs a total without a
 * split (Work Tracker), so it is always read as the larger of the two.
 * Draft rows (submitted_at NULL) count: quick logs create them before the
 * day's report is written.
 */
export type EmailCounts = { brands: number; influencers: number; total: number };

export function emailCountsFromReport(
  row:
    | {
        brands_contacted: number | null;
        influencers_contacted: number | null;
        outreach_count: number | null;
      }
    | null
    | undefined,
): EmailCounts {
  const brands = row?.brands_contacted ?? 0;
  const influencers = row?.influencers_contacted ?? 0;
  const total = Math.max(row?.outreach_count ?? 0, brands + influencers);
  return { brands, influencers, total };
}

// Recharts needs literal hex — these mirror ima tokens. Total is the one blue
// (signal) series; the split uses the existing warm/neutral tokens.
export const EMAIL_SERIES_COLORS = {
  total: "#2563EB", // ima-primary
  brands: "#92400E", // ima-warning
  influencers: "#5F6E85", // ima-text-secondary
} as const;
