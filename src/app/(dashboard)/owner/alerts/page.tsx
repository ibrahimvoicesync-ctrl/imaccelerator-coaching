import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { OwnerAlertsClient, type AlertItem } from "@/components/owner/OwnerAlertsClient";
import { DollarSign, TrendingUp } from "lucide-react";


export default async function OwnerAlertsPage() {
  const user = await requireRole("owner");
  const admin = createAdminClient();

  // Phase 65 (F4): The feed lists exactly one `deal_closed` alert per deal
  // closed in the trailing 30-day window. All 4 legacy alert types
  // (student_inactive / student_dropoff / unreviewed_reports /
  // coach_underperforming) are silently pruned — no tombstone, no legacy
  // counters, no deprecated copy.
  const now = new Date();
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 86400000).toISOString();

  // --- Parallel data fetches ---
  const [dealsResult, dismissalsResult] = await Promise.all([
    admin
      .from("deals")
      .select("id, student_id, revenue, created_at, users!deals_student_id_fkey ( id, name )")
      .gte("created_at", thirtyDaysAgoIso)
      .order("created_at", { ascending: false }),
    admin
      .from("alert_dismissals")
      .select("alert_key, dismissed_at")
      .eq("owner_id", user.id)
      .gte("dismissed_at", thirtyDaysAgoIso),
  ]);

  if (dealsResult.error) console.error("[owner alerts] deals fetch error:", dealsResult.error);
  if (dismissalsResult.error) console.error("[owner alerts] dismissals fetch error:", dismissalsResult.error);

  const deals = dealsResult.data ?? [];
  const dismissedAtByKey = new Map<string, string>(
    (dismissalsResult.data ?? []).map((d) => [d.alert_key, d.dismissed_at]),
  );

  // --- Map deals → AlertItem[] ---
  const alerts: AlertItem[] = deals.map((d) => {
    // The embedded FK join `users!deals_student_id_fkey` returns a single row,
    // but PostgREST may surface it as either an object or a 1-element array
    // depending on the client version. Normalize both.
    const rawUser = (d as { users?: { id: string; name: string } | { id: string; name: string }[] | null }).users;
    const studentRow = Array.isArray(rawUser) ? rawUser[0] : rawUser;
    const studentName = studentRow?.name ?? "Unknown student";
    const key = `deal_closed:${d.id}`;
    const revenueFormatted = Number(d.revenue).toLocaleString("en-US", { maximumFractionDigits: 0 });
    const dismissedAt = dismissedAtByKey.get(key) ?? null;
    return {
      key,
      type: "deal_closed",
      severity: "info",
      title: studentName,
      message: `Closed a $${revenueFormatted} deal`,
      subjectId: d.student_id,
      subjectName: studentName,
      triggeredAt: d.created_at,
      dismissed: dismissedAt !== null,
      dismissedAt,
    };
  });

  // Sort: active first (dismissed last), then by triggeredAt DESC
  alerts.sort((a, b) => {
    if (a.dismissed !== b.dismissed) return a.dismissed ? 1 : -1;
    return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
  });

  const totalCount = alerts.length;
  const totalRevenue = deals.reduce((sum, d) => sum + Number(d.revenue), 0);
  const revenueLabel = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(totalRevenue);

  const statCards = [
    {
      label: "Revenue (30d)",
      value: revenueLabel,
      icon: DollarSign,
      iconBg: "bg-ima-success/10",
      iconColor: "text-ima-success",
    },
    {
      label: "Deals Closed",
      value: String(totalCount),
      icon: TrendingUp,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
    },
  ];

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
            Alerts
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Deal closures this month
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Monitor closed deals from the last 30 days.
          </p>
        </header>

        {/* Stats row — 4 cards */}
        <section
          aria-label="Alert totals"
          className="mt-9 grid grid-cols-1 sm:grid-cols-2 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          {statCards.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]"
            >
              <div
                className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${s.iconBg}`}
              >
                <s.icon
                  className={`h-[18px] w-[18px] ${s.iconColor}`}
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[24px] font-semibold leading-none tabular-nums slashed-zero tracking-[-0.01em] text-ima-text">
                  {s.value}
                </p>
                <p
                  className="mt-[6px] text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
                >
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Filter + feed */}
        <div
          className="mt-8 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <OwnerAlertsClient initialAlerts={alerts} />
        </div>
      </div>
    </div>
  );
}
