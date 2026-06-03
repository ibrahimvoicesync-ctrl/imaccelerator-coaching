import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkTrackerClient } from "@/components/student/WorkTrackerClient";
import { PushOptIn } from "@/components/student/PushOptIn";
import { ROUTES } from "@/lib/config";
import type { Database } from "@/lib/types";


type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];
type DailyPlan = Database["public"]["Tables"]["daily_plans"]["Row"];

export default async function WorkPage() {
  const user = await requireRole("student");
  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: sessions, error } = await admin
    .from("work_sessions")
    .select("*")
    .eq("student_id", user.id)
    .eq("date", today)
    .order("cycle_number", { ascending: true });

  if (error) {
    console.error("[work page] Failed to load sessions:", error);
  }

  const { data: plan, error: planError } = await admin
    .from("daily_plans")
    .select("*")
    .eq("student_id", user.id)
    .eq("date", today)
    .maybeSingle();

  if (planError) {
    console.error("[work page] Failed to load daily plan:", planError);
  }

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
          >
            Work Tracker
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Today&apos;s focus.
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Plan it, run it, log it.
          </p>
        </header>

        <div
          className="mt-9 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <WorkTrackerClient
            initialSessions={(sessions ?? []) as WorkSession[]}
            initialPlan={(plan ?? null) as DailyPlan | null}
            dailyReportHref={ROUTES.student.report}
          />
        </div>

        <div
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "150ms" }}
        >
          <PushOptIn />
        </div>
      </div>
    </div>
  );
}
