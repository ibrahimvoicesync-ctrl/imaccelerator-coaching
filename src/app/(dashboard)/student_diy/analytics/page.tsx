import { unstable_cache } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/session";
import {
  fetchStudentAnalytics,
  studentAnalyticsTag,
  STUDENT_ANALYTICS_RANGES,
  type StudentAnalyticsRange,
} from "@/lib/rpc/student-analytics";
import { AnalyticsClient } from "@/app/(dashboard)/student/analytics/AnalyticsClient";


const RangeSchema = z.enum(STUDENT_ANALYTICS_RANGES).catch("daily");

type SearchParams = {
  range?: string;
};

export default async function StudentDiyAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireRole("student_diy");

  const resolved = await searchParams;
  const range: StudentAnalyticsRange = RangeSchema.parse(resolved.range ?? "daily");

  const fetchCached = unstable_cache(
    async (studentId: string, r: StudentAnalyticsRange) =>
      fetchStudentAnalytics(studentId, r, 1),
    ["student-analytics-v4"],
    {
      revalidate: 60,
      tags: [studentAnalyticsTag(user.id)],
    },
  );

  const data = await fetchCached(user.id, range);

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <section
        aria-labelledby="student-analytics-h1"
        className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16"
      >
        <AnalyticsClient
          initialData={data}
          initialRange={range}
          basePath="/student_diy/analytics"
          showOutreach={false}
        />
      </section>
    </div>
  );
}
