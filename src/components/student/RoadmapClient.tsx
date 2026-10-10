"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, ExternalLink, Check, ChevronDown, PartyPopper, PlayCircle } from "lucide-react";
import { Modal, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { RoadmapStep } from "@/components/student/RoadmapStep";
import { DeadlineBadge } from "@/components/student/DeadlineBadge";
import { Reveal } from "@/components/shared/Reveal";
import { ROADMAP_STEPS } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types";

type RoadmapProgress = Database["public"]["Tables"]["roadmap_progress"]["Row"];

/** The active step's config, flattened so it crosses the server→client boundary. */
export interface ActiveStep {
  step: number;
  stageName: string;
  title: string;
  description: string;
  target_days: number | null;
  unlock_url: string | null;
}

interface RoadmapClientProps {
  progress: RoadmapProgress[];
  joinedAt: string;
  allComplete: boolean;
  completedCount: number;
  firstName: string;
  activeStep: ActiveStep | null;
}

/**
 * Owns the current-step card *and* the timeline, because both need the same
 * completion state and the same two modals. The current-step card is the one
 * place the student can act; the timeline below it is orientation only.
 */
export function RoadmapClient({
  progress,
  joinedAt,
  allComplete,
  completedCount,
  firstName,
  activeStep,
}: RoadmapClientProps) {
  const routerRef = useRef(useRouter());
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const [confirmStep, setConfirmStep] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [unlockModal, setUnlockModal] = useState<{ title: string; url: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  const handleComplete = useCallback(async () => {
    if (confirmStep === null) return;
    setCompleting(true);
    try {
      const res = await fetch("/api/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step_number: confirmStep }),
      });

      if (res.ok) {
        const currentStep = ROADMAP_STEPS.find((s) => s.step === confirmStep);
        const nextStep = ROADMAP_STEPS.find((s) => s.step === confirmStep + 1);

        // Check if the completed step has an unlock_url
        if (currentStep?.unlock_url) {
          setUnlockModal({ title: currentStep.title, url: currentStep.unlock_url });
        } else {
          toastRef.current({
            type: "success",
            title: `"${currentStep?.title}" complete!${nextStep ? ` Next: ${nextStep.title}` : ""}`,
          });
        }
        routerRef.current.refresh();
      } else {
        const err = await res.json();
        toastRef.current({
          type: "error",
          title: err.error || "Failed to complete step",
        });
      }
    } catch (err) {
      console.error("[RoadmapClient] complete failed:", err);
      toastRef.current({
        type: "error",
        title: "Failed to complete step",
      });
    } finally {
      setCompleting(false);
      setConfirmStep(null);
    }
  }, [confirmStep]);

  const stages = [...new Map(
    ROADMAP_STEPS.map(s => [s.stage, s.stageName])
  ).entries()].map(([stage, stageName]) => ({ stage, stageName }));

  const activeProgress = activeStep
    ? progress.find((p) => p.step_number === activeStep.step) ?? null
    : null;

  return (
    <>
      {/* Current step — the one thing to do on this page */}
      <section
        aria-label="Current step"
        className="mt-9 motion-safe:animate-fadeIn"
        style={{ animationDelay: "100ms" }}
      >
        <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-10">
          {/* Overall progress, folded in */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
              {allComplete ? "Finished" : activeStep ? `Step ${activeStep.step} of ${ROADMAP_STEPS.length}` : "Getting started"}
            </p>
            <p className="text-[12px] font-semibold tabular-nums text-ima-text-secondary">
              {completedCount} done
            </p>
          </div>
          <div
            className="mt-3 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
            role="progressbar"
            aria-valuenow={completedCount}
            aria-valuemin={0}
            aria-valuemax={ROADMAP_STEPS.length}
            aria-label={`${completedCount} of ${ROADMAP_STEPS.length} steps done`}
          >
            <div
              className={cn(
                "h-full rounded-full motion-safe:transition-[width] duration-700 ease-out",
                allComplete ? "bg-ima-success" : "bg-ima-primary",
              )}
              style={{ width: `${Math.round((completedCount / ROADMAP_STEPS.length) * 100)}%` }}
            />
          </div>

          {allComplete ? (
            <div className="mt-8">
              <PartyPopper className="h-8 w-8 text-ima-success" aria-hidden="true" />
              <p className="mt-4 text-[26px] md:text-[30px] font-semibold tracking-[-0.01em] text-ima-text leading-tight">
                Congratulations, {firstName}.
              </p>
              <p className="mt-3 text-[15px] text-ima-text-secondary leading-relaxed">
                You&apos;ve finished all {ROADMAP_STEPS.length} steps. Keep building on what you&apos;ve earned.
              </p>
            </div>
          ) : activeStep ? (
            <div className="mt-8">
              <h2 className="text-[26px] md:text-[30px] font-semibold tracking-[-0.01em] text-ima-text leading-tight">
                {activeStep.title}
              </h2>
              <p className="mt-3 text-[16px] text-ima-text-secondary leading-[1.6]">
                {activeStep.description}
              </p>

              <div className="mt-5">
                <DeadlineBadge
                  targetDays={activeStep.target_days}
                  joinedAt={joinedAt}
                  status="active"
                  completedAt={activeProgress?.completed_at ?? null}
                />
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmStep(activeStep.step)}
                  className="inline-flex flex-1 items-center justify-center gap-2.5 rounded-full bg-ima-primary text-white text-[17px] font-semibold min-h-[60px] px-8 hover:bg-ima-primary-hover focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 motion-safe:transition-colors"
                >
                  <Check className="h-5 w-5" aria-hidden="true" />
                  I&apos;ve done this step
                </button>
                {activeStep.unlock_url && (
                  <a
                    href={activeStep.unlock_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-ima-border bg-white text-ima-text text-[15px] font-semibold min-h-[60px] px-6 hover:bg-ima-surface-light focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 motion-safe:transition-colors"
                  >
                    <PlayCircle className="h-5 w-5 text-ima-primary" aria-hidden="true" />
                    Watch the video
                  </a>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-8">
              <p className="text-[26px] md:text-[30px] font-semibold tracking-[-0.01em] text-ima-text leading-tight">
                Ready to begin.
              </p>
              <p className="mt-3 text-[15px] text-ima-text-secondary leading-relaxed">
                Your steps are set up. Your first one will show here shortly.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Every step — folded away so the current step stays the focus */}
      <div className="mt-[14px]">
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          aria-controls="roadmap-all-steps"
          className="w-full flex items-center justify-between gap-3 rounded-[14px] border border-ima-border bg-white shadow-card px-6 min-h-[60px] text-[15px] font-semibold text-ima-text hover:bg-ima-surface-light motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
        >
          {showAll ? "Hide the other steps" : `See all ${ROADMAP_STEPS.length} steps`}
          <ChevronDown
            className={cn("h-5 w-5 text-ima-text-secondary motion-safe:transition-transform", showAll && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Timeline — each step rises into view as it scrolls in */}
      <section
        id="roadmap-all-steps"
        aria-label="All steps"
        hidden={!showAll}
        className="mt-[14px] motion-safe:animate-fadeIn"
      >
        <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-8">
          {stages.map(({ stage, stageName }, stageIdx) => {
            const stageSteps = ROADMAP_STEPS.filter(s => s.stage === stage);
            const stageDone = stageSteps.filter(
              (s) => progress.find((p) => p.step_number === s.step)?.status === "completed",
            ).length;
            const stageComplete = stageDone === stageSteps.length;
            return (
              <div key={stage}>
                {/* Stage header */}
                <Reveal
                  className={cn(
                    "flex items-center gap-3 pb-5",
                    stageIdx > 0 && "pt-10",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex items-center justify-center h-7 w-7 rounded-full text-[12px] font-bold tabular-nums shrink-0",
                      stageComplete
                        ? "bg-ima-success text-white"
                        : stageDone > 0
                          ? "bg-ima-primary text-white"
                          : "bg-ima-surface-light text-ima-text-muted",
                    )}
                  >
                    {stage}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-ima-text">
                    {stageName}
                  </span>
                  <div className="flex-1 h-px bg-ima-border" aria-hidden="true" />
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] tabular-nums text-ima-text-secondary shrink-0">
                    {stageDone}/{stageSteps.length}
                  </span>
                </Reveal>
                {/* Stage steps */}
                {stageSteps.map((step, i) => {
                  const stepProgress = progress.find((p) => p.step_number === step.step) ?? null;
                  return (
                    <Reveal key={step.step} delay={(i % 4) * 70}>
                      <RoadmapStep
                        step={{
                          step_number: step.step,
                          title: step.title,
                          description: step.description,
                          target_days: step.target_days,
                          unlock_url: step.unlock_url,
                        }}
                        progress={stepProgress}
                        isLast={i === stageSteps.length - 1}
                        joinedAt={joinedAt}
                      />
                    </Reveal>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>

      {/* Confirmation modal */}
      <Modal
        open={confirmStep !== null}
        onClose={() => setConfirmStep(null)}
        title="Did you finish this step?"
        description={`"${ROADMAP_STEPS.find((s) => s.step === confirmStep)?.title}" will be marked as done and your next step will appear. You can't undo this.`}
      >
        <div className="flex gap-3 mt-4">
          <Button
            variant="primary"
            loading={completing}
            onClick={handleComplete}
          >
            Yes, I&apos;m done
          </Button>
          <Button variant="ghost" onClick={() => setConfirmStep(null)}>
            Not yet
          </Button>
        </div>
      </Modal>

      {/* Unlock video modal */}
      <Modal
        open={unlockModal !== null}
        onClose={() => setUnlockModal(null)}
        title="You unlocked a video!"
      >
        <div className="flex flex-col items-center text-center gap-4 pt-2">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-ima-warning/10">
            <Sparkles className="h-8 w-8 text-ima-warning" aria-hidden="true" />
          </div>
          <p className="text-sm text-ima-text-secondary">
            You just unlocked <span className="font-semibold text-ima-text">{unlockModal?.title}</span>. Watch this video before you start.
          </p>
          <a
            href={unlockModal?.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-6 rounded-lg bg-ima-primary text-white font-semibold hover:bg-ima-primary-hover motion-safe:transition-colors"
          >
            Watch Video
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <Button variant="ghost" onClick={() => setUnlockModal(null)}>
            Watch Later
          </Button>
        </div>
      </Modal>
    </>
  );
}
