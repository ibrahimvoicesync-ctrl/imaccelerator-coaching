import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CoachAssignmentsClient } from "@/components/coach/CoachAssignmentsClient";

export default async function CoachAssignmentsPage() {
  await requireRole("coach");

  const admin = createAdminClient();

  const [studentsResult, coachesResult] = await Promise.all([
    admin
      .from("users")
      .select("id, name, email, status, coach_id")
      .eq("role", "student")
      .eq("status", "active")
      .order("name"),
    admin
      .from("users")
      .select("id, name")
      .eq("role", "coach")
      .eq("status", "active")
      .order("name"),
  ]);

  if (studentsResult.error) {
    console.error("[/coach/assignments] Failed to load students:", studentsResult.error);
  }
  if (coachesResult.error) {
    console.error("[/coach/assignments] Failed to load coaches:", coachesResult.error);
  }

  const students = studentsResult.data ?? [];
  const coaches = coachesResult.data ?? [];

  const coachStudentCounts: Record<string, number> = {};
  for (const student of students) {
    if (student.coach_id) {
      coachStudentCounts[student.coach_id] = (coachStudentCounts[student.coach_id] ?? 0) + 1;
    }
  }

  const coachOptions = coaches.map((c) => ({
    id: c.id,
    name: c.name,
    studentCount: coachStudentCounts[c.id] ?? 0,
  }));

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20 space-y-8">
        <header className="motion-safe:animate-fadeIn">
          <p className="text-xs font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
            Assignments
          </p>
          <h1 className="mt-3 text-3xl md:text-4xl font-semibold leading-tight text-ima-text tracking-tight">
            Student Assignments
          </h1>
          <p className="mt-2 text-sm text-ima-text-secondary leading-relaxed">
            Assign and reassign students across coaches.
          </p>
        </header>

        <CoachAssignmentsClient students={students} coaches={coachOptions} />
      </div>
    </div>
  );
}
