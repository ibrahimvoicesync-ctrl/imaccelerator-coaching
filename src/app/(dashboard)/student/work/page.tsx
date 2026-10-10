import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkTrackerClient } from "@/components/student/WorkTrackerClient";
import { ReminderBell } from "@/components/student/ReminderBell";
import { QuickEmailLog } from "@/components/student/QuickEmailLog";
import { emailCountsFromReport } from "@/lib/emails";
import { getToday } from "@/lib/utils";
import { ROUTES } from "@/lib/config";
import type { Database } from "@/lib/types";


type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];

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

  const { data: prefRow } = await admin
    .from("users")
    .select("reminder_hour")
    .eq("id", user.id)
    .single();

  // Same date the quick-log API writes to (local getToday, like the dashboard).
  const { data: todayReport, error: reportError } = await admin
    .from("daily_reports")
    .select("brands_contacted, influencers_contacted, outreach_count")
    .eq("student_id", user.id)
    .eq("date", getToday())
    .maybeSingle();
  if (reportError) {
    console.error("[work page] Failed to load today's report:", reportError);
  }

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        <header className="relative z-30 mx-auto flex max-w-[880px] items-center justify-end motion-safe:animate-fadeIn">
          <ReminderBell initialHour={prefRow?.reminder_hour ?? 17} />
        </header>

        <div
          className="mt-5 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <WorkTrackerClient
            initialSessions={(sessions ?? []) as WorkSession[]}
            calendarHref={ROUTES.student.calendar}
            dailyReportHref={ROUTES.student.report}
            emailLog={<QuickEmailLog initialCounts={emailCountsFromReport(todayReport)} />}
          />
        </div>
      </div>
    </div>
  );
}
