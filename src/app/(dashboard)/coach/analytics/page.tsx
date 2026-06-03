import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { requireRole } from "@/lib/session";
import { getTodayUTC } from "@/lib/utils";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui";
import {
  getCoachAnalyticsCached,
  COACH_ANALYTICS_PAGE_SIZE,
} from "@/lib/rpc/coach-analytics";
import { parseCoachAnalyticsSearchParams } from "@/lib/schemas/coach-analytics-params";
import { CoachAnalyticsClient } from "@/components/coach/analytics/CoachAnalyticsClient";

export const revalidate = 60;

export default async function CoachAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireRole("coach");

  const raw = await searchParams;
  const parsed = parseCoachAnalyticsSearchParams(raw);
  if (!parsed.ok) {
    redirect("/coach/analytics");
  }

  const today = getTodayUTC();

  const payload = await getCoachAnalyticsCached(user.id, {
    page: parsed.value.page,
    pageSize: COACH_ANALYTICS_PAGE_SIZE,
    sort: parsed.value.sort,
    search: parsed.value.search,
    windowDays: 7,
    today,
    leaderboardLimit: 5,
  });

  const hasNoAssignedStudents =
    !parsed.value.search &&
    payload.pagination.total === 0 &&
    payload.active_inactive.active === 0 &&
    payload.active_inactive.inactive === 0;

  if (hasNoAssignedStudents) {
    return (
      <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
        <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
          <header className="motion-safe:animate-fadeIn">
            <p className="text-xs font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
              Analytics
            </p>
            <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight">
              Coach Analytics
            </h1>
            <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
              Aggregate stats across your assigned students.
            </p>
          </header>
          <div
            className="mt-10 bg-white border border-ima-border rounded-[14px] p-6 motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <EmptyState
              variant="compact"
              icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
              title="No students assigned"
              description="Analytics will appear once students join your cohort."
              action={
                <Link
                  href="/coach/invites"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Invite Students
                </Link>
              }
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <section
        aria-labelledby="coach-analytics-h1"
        className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20"
      >
        <CoachAnalyticsClient
          payload={payload}
          initialParams={parsed.value}
        />
      </section>
    </div>
  );
}
