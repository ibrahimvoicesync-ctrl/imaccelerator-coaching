"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, RotateCcw, Route } from "lucide-react";
import { ROADMAP_STEPS } from "@/lib/config";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { getDeadlineStatus } from "@/lib/roadmap-utils";

type RoadmapProgressRow = {
  step_number: number;
  status: "locked" | "active" | "completed";
  completed_at: string | null;
};

interface RoadmapTabProps {
  roadmap: RoadmapProgressRow[];
  joinedAt: string;
  studentId: string;
}

export function RoadmapTab({ roadmap, joinedAt, studentId }: RoadmapTabProps) {
  const routerRef = useRef(useRouter());
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [confirmStep, setConfirmStep] = useState<number | null>(null);
  const [undoing, setUndoing] = useState(false);

  const handleUndo = useCallback(async () => {
    if (confirmStep === null) return;
    setUndoing(true);
    try {
      const res = await fetch("/api/roadmap/undo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, step_number: confirmStep }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toastRef.current({
          type: "error",
          title: (err as { error?: string }).error ?? "Failed to undo step",
        });
      } else {
        const json = await res.json();
        const cascade = json?.data?.cascade === true;
        const cascadeCount = json?.data?.cascadeCount ?? 0;
        const stepTitle =
          ROADMAP_STEPS.find((s) => s.step === confirmStep)?.title ?? `Step ${confirmStep}`;
        toastRef.current({
          type: "success",
          title: cascade
            ? `Step ${confirmStep} reset to active, ${cascadeCount} subsequent step${cascadeCount > 1 ? "s" : ""} re-locked`
            : `Step ${confirmStep}: "${stepTitle}" reset to active`,
        });
        routerRef.current.refresh();
      }
    } catch {
      toastRef.current({ type: "error", title: "Failed to undo step" });
    } finally {
      setUndoing(false);
      setConfirmStep(null);
    }
  }, [confirmStep, studentId]);

  if (roadmap.length === 0) {
    return (
      <div role="tabpanel" id="tabpanel-roadmap" aria-labelledby="tab-roadmap">
        <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6">
          <EmptyState
            variant="compact"
            icon={<Route className="h-5 w-5" />}
            title="No roadmap progress yet"
            description="This student hasn't started their roadmap."
          />
        </div>
      </div>
    );
  }

  const completedCount = roadmap.filter((r) => r.status === "completed").length;
  const totalSteps = ROADMAP_STEPS.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  const rowMap = new Map(roadmap.map((r) => [r.step_number, r]));

  const stages = [
    ...new Map(ROADMAP_STEPS.map((s) => [s.stage, s.stageName])).entries(),
  ].map(([stage, stageName]) => ({ stage, stageName }));

  const activeStep = roadmap.find((r) => r.status === "active")?.step_number ?? null;

  return (
    <div
      role="tabpanel"
      id="tabpanel-roadmap"
      aria-labelledby="tab-roadmap"
      className="space-y-6"
    >
      {/* Progress hero card */}
      <section
        aria-label="Roadmap progress"
        className="bg-white border border-ima-border rounded-[14px] shadow-card p-5 md:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p
              className="text-[10px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
            >
              Roadmap Progress
            </p>
            <p className="mt-3 flex items-baseline gap-2 leading-none">
              <span className="text-5xl md:text-6xl font-semibold tabular-nums tracking-tight text-ima-primary">
                {completedCount}
              </span>
              <span
                className="text-lg md:text-xl font-semibold tabular-nums text-ima-text-secondary"
              >
                / {totalSteps}
              </span>
            </p>
            <p
              className="mt-2 text-xs font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
            >
              Steps Completed
            </p>
          </div>
          <div className="sm:text-right shrink-0">
            <p
              className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
            >
              Active Step
            </p>
            <p className="mt-2 text-sm font-semibold text-ima-text tabular-nums">
              {activeStep !== null ? `Step ${String(activeStep).padStart(2, "0")}` : "—"}
            </p>
            <p className="mt-[2px] text-xs text-ima-text-secondary max-w-[260px] sm:ml-auto truncate">
              {activeStep !== null
                ? ROADMAP_STEPS.find((s) => s.step === activeStep)?.title
                : "All caught up"}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <div
            className="h-[6px] bg-ima-surface-light rounded-full overflow-hidden"
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={totalSteps}
            aria-label={`Roadmap progress: ${completedCount} of ${totalSteps} steps completed`}
          >
            <div
              className="h-full bg-ima-primary motion-safe:transition-all motion-safe:duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span
              className="text-xs font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
            >
              Overall
            </span>
            <span
              className="text-xs font-semibold tabular-nums text-ima-text"
            >
              {progressPct}%
            </span>
          </div>
        </div>
      </section>

      {/* Stages */}
      <div className="space-y-8">
        {stages.map(({ stage, stageName }, idx) => {
          const stageSteps = ROADMAP_STEPS.filter((s) => s.stage === stage);
          const stageCompleted = stageSteps.filter(
            (s) => rowMap.get(s.step)?.status === "completed",
          ).length;

          return (
            <section key={stage} aria-label={`Stage ${stage}: ${stageName}`}>
              {/* Stage header */}
              <div className="flex items-center gap-3">
                <span
                  className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary tabular-nums"
                >
                  Stage {String(idx + 1).padStart(2, "0")}
                </span>
                <span
                  className="text-xs font-semibold tracking-[0.08em] uppercase text-ima-text"
                >
                  {stageName}
                </span>
                <div className="flex-1 h-px bg-ima-border" aria-hidden="true" />
                <span
                  className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary tabular-nums"
                >
                  {stageCompleted}/{stageSteps.length}
                </span>
              </div>

              {/* Steps */}
              <ul className="mt-4 space-y-[10px]" role="list">
                {stageSteps.map((step) => {
                  const row = rowMap.get(step.step);
                  const status = row?.status ?? "locked";
                  const completedAt = row?.completed_at ?? null;
                  const ds = getDeadlineStatus(
                    step.target_days,
                    joinedAt,
                    status,
                    completedAt,
                  );

                  const isActive = status === "active";
                  const isCompleted = status === "completed";

                  return (
                    <li
                      key={step.step}
                      className={[
                        "bg-white border rounded-[14px] p-4 md:p-5 flex items-start gap-4 motion-safe:transition-colors",
                        isActive
                          ? "border-ima-border ring-1 ring-ima-primary/40"
                          : "border-ima-border",
                      ].join(" ")}
                    >
                      {/* Marker */}
                      <div className="shrink-0 mt-[2px]">
                        {isCompleted ? (
                          <span
                            className="w-9 h-9 rounded-full bg-ima-primary flex items-center justify-center"
                            aria-label="Completed"
                          >
                            <Check
                              className="h-[18px] w-[18px] text-white"
                              aria-hidden="true"
                              strokeWidth={3}
                            />
                          </span>
                        ) : isActive ? (
                          <span
                            className="w-9 h-9 rounded-full border-[2px] border-ima-primary bg-white flex items-center justify-center"
                            aria-label="In progress"
                          >
                            <span
                              className="w-[10px] h-[10px] rounded-full bg-ima-primary"
                              aria-hidden="true"
                            />
                          </span>
                        ) : (
                          <span
                            className="w-9 h-9 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center"
                            aria-label="Locked"
                          >
                            <Lock
                              className="h-[14px] w-[14px] text-ima-text-secondary"
                              aria-hidden="true"
                            />
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span
                            className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary tabular-nums"
                          >
                            Step {String(step.step).padStart(2, "0")}
                          </span>
                          <p
                            className={[
                              "text-sm font-semibold leading-tight tracking-tight",
                              isCompleted
                                ? "text-ima-text"
                                : isActive
                                  ? "text-ima-text"
                                  : "text-ima-text-secondary",
                            ].join(" ")}
                          >
                            {step.title}
                          </p>
                        </div>
                        <p className="mt-[6px] text-sm text-ima-text-secondary leading-relaxed">
                          {step.description}
                        </p>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {ds.kind === "completed" && (
                            <span className="inline-flex items-center px-2 py-[3px] rounded-full border text-[10px] font-semibold uppercase tracking-wider bg-ima-success/10 border-ima-success/10 text-ima-success">
                              Completed{" "}
                              {new Date(ds.completedAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              })}
                              {ds.daysLate !== null && (
                                <span className="ml-1 opacity-80">({ds.daysLate}d late)</span>
                              )}
                            </span>
                          )}
                          {ds.kind === "on-track" && (
                            <span className="inline-flex items-center px-2 py-[3px] rounded-full border text-[10px] font-semibold uppercase tracking-wider bg-ima-success/10 border-ima-success/10 text-ima-success">
                              On Track — {ds.deadlineLabel}
                            </span>
                          )}
                          {ds.kind === "due-soon" && (
                            <span className="inline-flex items-center px-2 py-[3px] rounded-full border text-[10px] font-semibold uppercase tracking-wider bg-ima-warning/10 border-ima-warning/10 text-ima-warning">
                              Due Soon — {ds.deadlineLabel}
                            </span>
                          )}
                          {ds.kind === "overdue" && (
                            <span className="inline-flex items-center px-2 py-[3px] rounded-full border text-[10px] font-semibold uppercase tracking-wider bg-ima-error/10 border-ima-error/10 text-ima-error">
                              Overdue — {ds.daysOverdue}d
                            </span>
                          )}

                          {isCompleted && (
                            <button
                              onClick={() => setConfirmStep(step.step)}
                              className="inline-flex items-center gap-[4px] text-xs font-semibold tracking-wider uppercase text-ima-text-secondary hover:text-ima-primary motion-safe:transition-colors min-h-[44px] px-2 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md ml-auto"
                              aria-label={`Undo Step ${step.step}: ${step.title}`}
                            >
                              <RotateCcw className="h-[13px] w-[13px]" aria-hidden="true" />
                              Undo
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Undo confirmation modal */}
      {(() => {
        const stepConfig =
          confirmStep !== null
            ? ROADMAP_STEPS.find((s) => s.step === confirmStep)
            : null;
        const laterSteps =
          confirmStep !== null
            ? roadmap.filter(
                (r) =>
                  r.step_number > confirmStep &&
                  (r.status === "active" || r.status === "completed"),
              )
            : [];

        const dialogDescription =
          laterSteps.length > 0
            ? `Are you sure you want to reset Step ${confirmStep}: "${stepConfig?.title}" back to active? ${laterSteps.length} subsequent step${laterSteps.length > 1 ? "s" : ""} will also be re-locked.`
            : `Are you sure you want to reset Step ${confirmStep}: "${stepConfig?.title}" back to active?`;

        return (
          <Modal
            open={confirmStep !== null}
            onClose={() => {
              if (!undoing) setConfirmStep(null);
            }}
            title="Undo Step?"
            description={dialogDescription}
          >
            <div className="flex gap-3 mt-4">
              <Button variant="danger" loading={undoing} onClick={handleUndo}>
                Reset to Active
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmStep(null)}
                disabled={undoing}
              >
                Cancel
              </Button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}
