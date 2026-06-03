import { Suspense } from "react";
import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Activity, Shield, Users, FileText } from "lucide-react";
import Link from "next/link";
import type { OwnerDashboardStats } from "@/lib/rpc/types";
import { OwnerAnalyticsTeaser } from "@/components/owner/analytics/OwnerAnalyticsTeaser";


export default async function OwnerDashboard() {
  const user = await requireRole("owner");
  const admin = createAdminClient();
  const firstName = user.name.split(" ")[0];

  const { data, error } = await admin.rpc("get_owner_dashboard_stats");
  if (error) {
    console.error("[owner dashboard] RPC failed:", error);
  }
  const stats = (data as OwnerDashboardStats) ?? {
    total_students: 0,
    total_coaches: 0,
    active_today_count: 0,
    reports_today: 0,
  };

  const statCards = [
    {
      label: "Total Students",
      value: String(stats.total_students),
      icon: Users,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
      href: "/owner/students" as const,
    },
    {
      label: "Total Coaches",
      value: String(stats.total_coaches),
      icon: Shield,
      iconBg: "bg-ima-success/10",
      iconColor: "text-ima-success",
      href: "/owner/coaches" as const,
    },
    {
      label: "Active Today",
      value: String(stats.active_today_count),
      icon: Activity,
      iconBg: "bg-ima-warning/10",
      iconColor: "text-ima-warning",
      href: null,
    },
    {
      label: "Reports Today",
      value: String(stats.reports_today),
      icon: FileText,
      iconBg: "bg-ima-surface-light",
      iconColor: "text-ima-text-secondary",
      href: null,
    },
  ];

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Dashboard
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Assalamu3leikum, {firstName}!
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Platform overview
          </p>
        </header>

        {/* Stats row — 4 cards */}
        <section
          aria-label="Platform overview"
          className="mt-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          {statCards.map((s) => {
            const inner = (
              <>
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
              </>
            );
            if (s.href) {
              return (
                <Link
                  key={s.label}
                  href={s.href}
                  aria-label={`${s.label}: ${s.value}`}
                  className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px] motion-safe:transition-[transform,border-color] hover:-translate-y-[1px] hover:border-ima-border focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                >
                  {inner}
                </Link>
              );
            }
            return (
              <div
                key={s.label}
                className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]"
              >
                {inner}
              </div>
            );
          })}
        </section>

        {/* Analytics teaser (streams in independently) */}
        <section
          aria-label="Top performers"
          className="mt-10 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <Suspense fallback={<OwnerAnalyticsTeaserSkeleton />}>
            <OwnerAnalyticsTeaser />
          </Suspense>
        </section>
      </div>
    </div>
  );
}

function OwnerAnalyticsTeaserSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="bg-white border border-ima-border rounded-[14px] p-6"
    >
      <div className="h-5 w-28 rounded bg-ima-surface-light motion-safe:animate-pulse" />
      <div className="mt-2 h-3 w-56 rounded bg-ima-surface-light motion-safe:animate-pulse" />
      <div className="h-px bg-ima-surface-light mt-4" aria-hidden="true" />
      <div className="mt-3 space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-12 rounded-md bg-ima-surface-light motion-safe:animate-pulse"
          />
        ))}
      </div>
      <span className="sr-only">Loading analytics teaser…</span>
    </div>
  );
}
