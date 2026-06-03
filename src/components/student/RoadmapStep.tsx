"use client";

import { Check, Lock, Calendar, ExternalLink } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getDeadlineStatus } from "@/lib/roadmap-utils";
import type { Database } from "@/lib/types";

type RoadmapProgress = Database["public"]["Tables"]["roadmap_progress"]["Row"];

interface RoadmapStepProps {
  step: {
    step_number: number;
    title: string;
    description: string;
    target_days: number | null;
    unlock_url: string | null;
  };
  progress: RoadmapProgress | null;
  isLast: boolean;
  joinedAt: string;
  onComplete: (stepNumber: number) => void;
}

export function RoadmapStep({ step, progress, isLast, joinedAt, onComplete }: RoadmapStepProps) {
  const status = progress?.status ?? "locked";

  const deadlineStatus = getDeadlineStatus(
    step.target_days,
    joinedAt,
    status,
    progress?.completed_at ?? null
  );

  return (
    <div className="flex gap-3">
      {/* Left: indicator + line */}
      <div className="flex flex-col items-center">
        {/* Circle */}
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center w-11 h-11 rounded-full shrink-0 motion-safe:transition-all",
            status === "completed" && "bg-ima-success text-white shadow-sm",
            status === "active" && "bg-ima-primary text-white ring-4 ring-ima-primary/20 motion-safe:animate-pulse",
            status === "locked" && "border-2 border-ima-border text-ima-text-muted bg-ima-surface-light"
          )}
        >
          {status === "completed" && <Check className="h-5 w-5" aria-hidden="true" />}
          {status === "active" && (
            <span className="text-sm font-bold">{step.step_number}</span>
          )}
          {status === "locked" && <Lock className="h-4 w-4" aria-hidden="true" />}
        </div>
        {/* Connecting line */}
        {!isLast && (
          <div
            className={cn(
              "w-0.5 flex-1 min-h-10",
              status === "completed" ? "bg-ima-success" : "bg-ima-border"
            )}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="pb-6 flex-1">
        <h3
          className={cn(
            "text-base font-semibold",
            status === "locked" ? "text-ima-text-muted" : "text-ima-text"
          )}
        >
          {step.title}
        </h3>
        <p
          className={cn(
            "text-sm mt-1 leading-relaxed",
            status === "locked" ? "text-ima-text-muted" : "text-ima-text-secondary"
          )}
        >
          {step.description}
        </p>

        <div className="mt-3 flex flex-col items-start gap-3">
          {/* Completed chip — green Badge with date and optional late suffix (D-02, D-03, D-05) */}
          {deadlineStatus.kind === "completed" && (
            <Badge variant="success">
              <Check className="h-3 w-3 mr-1" aria-hidden="true" />
              Completed {new Date(deadlineStatus.completedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
              {deadlineStatus.daysLate !== null && (
                <span className="ml-1 opacity-75">({deadlineStatus.daysLate}d late)</span>
              )}
            </Badge>
          )}

          {/* On Track chip — green Badge with deadline date */}
          {deadlineStatus.kind === "on-track" && (
            <Badge variant="success" size="sm">
              <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
              On Track — {deadlineStatus.deadlineLabel}
            </Badge>
          )}

          {/* Due Soon chip — amber Badge with deadline date (D-04: target_days: 0 steps show this on join day) */}
          {deadlineStatus.kind === "due-soon" && (
            <Badge variant="warning" size="sm">
              <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
              Due Soon — {deadlineStatus.deadlineLabel}
            </Badge>
          )}

          {/* Overdue chip — red Badge with days overdue count */}
          {deadlineStatus.kind === "overdue" && (
            <Badge variant="error" size="sm">
              <Calendar className="h-3 w-3 mr-1" aria-hidden="true" />
              Overdue — {deadlineStatus.daysOverdue}d
            </Badge>
          )}

          {/* Active step — Mark Complete button (unchanged) */}
          {status === "active" && (
            <Button
              variant="primary"
              size="md"
              onClick={() => onComplete(step.step_number)}
            >
              Mark Complete
            </Button>
          )}

          {/* Locked step — Locked badge (unchanged) */}
          {status === "locked" && (
            <Badge variant="default">
              <Lock className="h-3 w-3 mr-1" aria-hidden="true" />
              Locked
            </Badge>
          )}

          {/* Persistent video link — visible only after step is completed */}
          {step.unlock_url && status === "completed" && (
            <a
              href={step.unlock_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ima-primary hover:text-ima-primary-hover min-h-[44px] motion-safe:transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              Watch Video
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
