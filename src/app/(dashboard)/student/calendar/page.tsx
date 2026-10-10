import { requireRole } from "@/lib/session";
import { ROUTES } from "@/lib/config";
import { CalendarView, type CalendarViewMode } from "@/components/student/schedule/CalendarView";

const VIEWS: CalendarViewMode[] = ["day", "week", "month"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  await requireRole("student");
  const { view, date } = await searchParams;

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1600px] px-6 md:px-10 pt-8 md:pt-10 pb-12">
        <CalendarView
          initialView={VIEWS.includes(view as CalendarViewMode) ? (view as CalendarViewMode) : "week"}
          initialDate={date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null}
          basePath={ROUTES.student.calendar}
          timerHref={ROUTES.student.workTracker}
        />
      </div>
    </div>
  );
}
