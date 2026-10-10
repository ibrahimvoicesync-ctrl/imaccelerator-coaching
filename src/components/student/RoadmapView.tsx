import { RoadmapClient, type ActiveStep } from "@/components/student/RoadmapClient";
import { ROADMAP_STEPS } from "@/lib/config";
import type { Database } from "@/lib/types";

type RoadmapProgress = Database["public"]["Tables"]["roadmap_progress"]["Row"];

/**
 * The roadmap surface, shared 1:1 by `student/roadmap` and `student_diy/roadmap`.
 *
 * Deliberately minimal: masthead → the current step (the only thing to do,
 * with overall progress folded into it) → the full list of steps, collapsed
 * behind "See all steps". Built for students who aren't power users.
 */
export function RoadmapView({
  progress,
  joinedAt,
  firstName,
}: {
  progress: RoadmapProgress[];
  joinedAt: string;
  firstName: string;
}) {
  const completedCount = progress.filter((p) => p.status === "completed").length;
  const allComplete = completedCount === ROADMAP_STEPS.length;

  const activeRow = progress.find((p) => p.status === "active");
  const activeConfig = activeRow
    ? ROADMAP_STEPS.find((s) => s.step === activeRow.step_number)
    : undefined;

  // Flattened so it crosses the server→client boundary as a plain object.
  const activeStep: ActiveStep | null = activeConfig
    ? {
        step: activeConfig.step,
        stageName: activeConfig.stageName,
        title: activeConfig.title,
        description: activeConfig.description,
        target_days: activeConfig.target_days,
        unlock_url: activeConfig.unlock_url,
      }
    : null;

  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[880px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
            My Steps
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            {allComplete ? "All steps done" : "Your next step"}
          </h1>
          <div className="mt-3 h-[3px] w-10 rounded-full bg-ima-primary" aria-hidden="true" />
          <p className="mt-3 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Do one step at a time. When you finish it, tap the button and the next one appears.
          </p>
        </header>

        {/* Current step + all steps + modals */}
        <RoadmapClient
          progress={progress}
          joinedAt={joinedAt}
          allComplete={allComplete}
          completedCount={completedCount}
          firstName={firstName}
          activeStep={activeStep}
        />
      </div>
    </div>
  );
}
