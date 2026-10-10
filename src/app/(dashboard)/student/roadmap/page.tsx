import { RoadmapView } from "@/components/student/RoadmapView";
import { requireRole } from "@/lib/session";
import { loadRoadmapProgress } from "@/lib/roadmap-data";

export default async function RoadmapPage() {
  const user = await requireRole("student");
  const { progress, joinedAt } = await loadRoadmapProgress(user.id, "[roadmap]");

  return (
    <RoadmapView
      progress={progress}
      joinedAt={joinedAt}
      firstName={user.name.split(" ")[0]}
    />
  );
}
