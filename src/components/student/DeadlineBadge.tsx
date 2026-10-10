"use client";

import { Check, Calendar } from "lucide-react";
import { Badge } from "@/components/ui";
import { getDeadlineStatus } from "@/lib/roadmap-utils";

/**
 * The deadline chip for a roadmap step. Renders nothing when the step has no
 * deadline (`target_days: null`) — steps 15 and 16 are open-ended by design.
 *
 * Shared by the timeline row (`RoadmapStep`) and the current-step card
 * (`RoadmapClient`) so the two can't drift apart.
 */
export function DeadlineBadge({
  targetDays,
  joinedAt,
  status,
  completedAt,
}: {
  targetDays: number | null;
  joinedAt: string;
  status: "locked" | "active" | "completed";
  completedAt: string | null;
}) {
  const deadline = getDeadlineStatus(targetDays, joinedAt, status, completedAt);

  switch (deadline.kind) {
    case "completed":
      return (
        <Badge variant="success">
          <Check className="h-3 w-3 mr-1" aria-hidden="true" />
          Completed{" "}
          {new Date(deadline.completedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
          {deadline.daysLate !== null && (
            <span className="ml-1 opacity-75">({deadline.daysLate}d late)</span>
          )}
        </Badge>
      );
    case "on-track":
      return (
        <Badge variant="success" size="sm">
          <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
          On Track — {deadline.deadlineLabel}
        </Badge>
      );
    case "due-soon":
      return (
        <Badge variant="warning" size="sm">
          <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
          Due Soon — {deadline.deadlineLabel}
        </Badge>
      );
    case "overdue":
      return (
        <Badge variant="error" size="sm">
          <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
          Overdue — {deadline.daysOverdue}d
        </Badge>
      );
    case "none":
      return null;
  }
}
