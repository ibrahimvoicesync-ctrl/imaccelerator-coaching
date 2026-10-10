import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkTrackerClient } from "@/components/student/WorkTrackerClient";
import { ReminderBell } from "@/components/student/ReminderBell";
import { ROUTES } from "@/lib/config";
import type { Database } from "@/lib/types";


type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];

export default async function StudentDiyWorkPage() {
  const user = await requireRole("student_diy");
  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const { data: sessions, error } = await admin
    .from("work_sessions")
    .select("*")
    .eq("student_id", user.id)
    .eq("date", today)
    .order("cycle_number", { ascending: true });

  if (error) {
    console.error("[student_diy work page] Failed to load sessions:", error);
  }

  const { data: prefRow } = await admin
    .from("users")
    .select("reminder_hour")
    .eq("id", user.id)
    .single();

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
            calendarHref={ROUTES.student_diy.calendar}
          />
        </div>
      </div>
    </div>
  );
}
