"use client";

import { Check, Lock, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui";
import { DeadlineBadge } from "@/components/student/DeadlineBadge";
import { cn } from "@/lib/utils";
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
}

/**
 * One row of the roadmap timeline.
 *
 * Every row uses the same content treatment — the *node* carries status, not
 * the content. The active step used to render an elevated card here with its
 * own "Mark complete" button, which duplicated the page-level current-step
 * card field for field. That action now lives once, above the timeline, and
 * this row is pure orientation.
 */
export function RoadmapStep({ step, progress, isLast, joinedAt }: RoadmapStepProps) {
  const status = progress?.status ?? "locked";

  return (
    <div className="flex gap-4">
      {/* Left rail: node + connecting line. The node is the status marker. */}
      <div className="flex flex-col items-center">
        <div
          aria-hidden="true"
          className={cn(
            "flex items-center justify-center rounded-full shrink-0 motion-safe:transition-all",
            status === "completed" && "w-11 h-11 bg-ima-success text-white shadow-sm",
            status === "active" &&
              "w-12 h-12 bg-ima-primary text-white ring-4 ring-ima-primary/20 shadow-[0_8px_24px_-8px_rgba(37,99,235,0.6)] motion-safe:animate-pulse",
            status === "locked" && "w-11 h-11 border-2 border-ima-border text-ima-text-muted bg-ima-surface-light",
          )}
        >
          {status === "completed" && <Check className="h-5 w-5" aria-hidden="true" />}
          {status === "active" && <span className="text-[15px] font-bold tabular-nums">{step.step_number}</span>}
          {status === "locked" && <Lock className="h-4 w-4" aria-hidden="true" />}
        </div>
        {!isLast && (
          <div
            className={cn(
              "w-[3px] flex-1 min-h-[2.5rem] rounded-full motion-safe:transition-colors",
              status === "completed" ? "bg-ima-success" : "bg-ima-border",
            )}
          />
        )}
      </div>

      {/* Right: content */}
      <div className="flex-1 pb-7">
        <div className="pt-1.5">
          <h3
            className={cn(
              "text-base font-semibold leading-snug",
              status === "locked" ? "text-ima-text-muted" : "text-ima-text",
            )}
          >
            {step.title}
          </h3>
          <p
            className={cn(
              "text-sm mt-1 leading-relaxed",
              status === "locked" ? "text-ima-text-muted" : "text-ima-text-secondary",
            )}
          >
            {step.description}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {/* The node that marks the active step is aria-hidden, so this chip
                is the only signal assistive tech gets. Keep it first. */}
            {status === "active" && <Badge variant="info">Current step</Badge>}
            <DeadlineBadge
              targetDays={step.target_days}
              joinedAt={joinedAt}
              status={status}
              completedAt={progress?.completed_at ?? null}
            />
            {status === "locked" && (
              <Badge variant="default">
                <Lock className="h-3 w-3 mr-1" aria-hidden="true" />
                Locked
              </Badge>
            )}
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
    </div>
  );
}
