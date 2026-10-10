import { ROADMAP_STEPS } from "@/lib/config";
import type { OwnerRoadmapReachRow } from "@/lib/rpc/owner-analytics-types";

/**
 * Roadmap funnel grouped by stage. "Reached" is cumulative — a student counts
 * toward a stage if their furthest reached step (status active|completed) is at
 * or beyond that stage's first step. The RPC returns per-step reached counts;
 * we group into stages here so config.ts stays the source of truth (CLAUDE.md
 * rule #1). Counts are non-increasing by construction → a clean descending
 * funnel.
 */

type StageRow = {
  stage: number;
  stageName: string;
  firstStep: number;
  reached: number;
};

function buildStages(roadmap: OwnerRoadmapReachRow[]): StageRow[] {
  const reachedByStep = new Map<number, number>();
  for (const r of roadmap) reachedByStep.set(r.step_number, r.students_reached);

  const byStage = new Map<number, { stageName: string; firstStep: number }>();
  for (const s of ROADMAP_STEPS) {
    const existing = byStage.get(s.stage);
    if (!existing) {
      byStage.set(s.stage, { stageName: s.stageName, firstStep: s.step });
    } else if (s.step < existing.firstStep) {
      existing.firstStep = s.step;
    }
  }

  return Array.from(byStage.entries())
    .sort(([a], [b]) => a - b)
    .map(([stage, { stageName, firstStep }]) => ({
      stage,
      stageName,
      firstStep,
      reached: reachedByStep.get(firstStep) ?? 0,
    }));
}

export function RoadmapStageBreakdown({
  roadmap,
  totalStudents,
}: {
  roadmap: OwnerRoadmapReachRow[];
  totalStudents: number;
}) {
  const stages = buildStages(roadmap);
  const denom = Math.max(totalStudents, 1);

  return (
    <section aria-labelledby="roadmap-stage-label">
      <p
        id="roadmap-stage-label"
        className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
      >
        Roadmap Progress by Stage
      </p>
      <p className="mt-1 text-[13px] text-ima-text-secondary leading-[1.55]">
        Students who have reached or passed each stage.
      </p>

      <ul className="mt-4 space-y-3">
        {stages.map((s) => {
          const percent = Math.round((s.reached / denom) * 100);
          return (
            <li
              key={s.stage}
              className="bg-white border border-ima-border rounded-[12px] shadow-card px-5 py-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-primary">
                    Stage {s.stage}
                  </p>
                  <p className="mt-0.5 text-[15px] font-semibold text-ima-text truncate">
                    {s.stageName}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[22px] font-semibold leading-none tabular-nums tracking-tight text-ima-text">
                    {s.reached}
                    <span className="text-[13px] font-medium text-ima-text-secondary">
                      {" "}
                      / {totalStudents}
                    </span>
                  </p>
                  <p className="mt-1 text-[11px] font-semibold tabular-nums text-ima-text-secondary">
                    {percent}%
                  </p>
                </div>
              </div>

              <div
                className="mt-3 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
                role="progressbar"
                aria-valuenow={s.reached}
                aria-valuemin={0}
                aria-valuemax={totalStudents}
                aria-label={`${s.stageName}: ${s.reached} of ${totalStudents} students reached`}
              >
                <div
                  className="h-full rounded-full bg-ima-primary motion-safe:transition-[width] duration-700 ease-out"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
