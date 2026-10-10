import { RoadmapView } from "@/components/student/RoadmapView";
import { requireRole } from "@/lib/session";
import { loadRoadmapProgress } from "@/lib/roadmap-data";

export default async function StudentDiyRoadmapPage() {
  const user = await requireRole("student_diy");
  const { progress, joinedAt } = await loadRoadmapProgress(user.id, "[student_diy roadmap]");

  return (
    <RoadmapView
      progress={progress}
      joinedAt={joinedAt}
      firstName={user.name.split(" ")[0]}
    />
  );
}
