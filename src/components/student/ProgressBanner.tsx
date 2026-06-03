import { cn, formatHoursMinutes } from "@/lib/utils";
import { KPI_TARGETS, WORK_TRACKER } from "@/lib/config";
import {
  lifetimeOutreachRag,
  dailyOutreachRag,
  dailyHoursRag,
  ragToColorClass,
  ragToBgClass,
  daysInProgram as computeDaysInProgram,
  type RagStatus,
} from "@/lib/kpi";

interface ProgressBannerProps {
  lifetimeOutreach: number;
  lifetimeMinutesWorked: number;
  dailyOutreach: number;
  dailyMinutesWorked: number;
  callsJoined: number;
  brandsContacted: number;
  influencersContacted: number;
  joinedAt: string;
  outreachStarted: boolean;
}

/**
 * Legacy inline KPI row — retained because StudentKpiSummary (non-sticky card) still renders it.
 * New sticky bar uses GoalKpi / CounterKpi below.
 */
export function KpiItem({
  label,
  value,
  ragStatus,
  ariaLabel,
}: {
  label: string;
  value: string;
  ragStatus?: RagStatus;
  ariaLabel: string;
}) {
  const colorClass = ragStatus ? ragToColorClass(ragStatus) : "text-ima-text-secondary";
  const dotClass = ragStatus ? ragToBgClass(ragStatus) : undefined;

  return (
    <div className="flex items-center gap-1.5" aria-label={ariaLabel}>
      {dotClass && (
        <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} aria-hidden="true" />
      )}
      <span className="text-ima-text-muted">{label}:</span>
      <span className={cn("font-semibold", colorClass)}>{value}</span>
    </div>
  );
}

// Ring geometry — 22px outer, 2.5px stroke → center radius 9.75, circumference ~61.26
const RING_SIZE = 22;
const RING_STROKE = 2.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRC = 2 * Math.PI * RING_RADIUS;

function ringStrokeClass(status: RagStatus): string {
  switch (status) {
    case "green":
      return "stroke-ima-success";
    case "amber":
      return "stroke-ima-warning";
    case "red":
      return "stroke-ima-error";
    default:
      return "stroke-ima-text-muted";
  }
}

function valueTextClass(status: RagStatus, complete: boolean): string {
  if (complete) return "text-ima-success";
  switch (status) {
    case "amber":
      return "text-ima-warning";
    case "red":
      return "text-ima-error";
    default:
      return "text-ima-text";
  }
}

function GoalKpi({
  label,
  current,
  target,
  currentDisplay,
  targetDisplay,
  ragStatus,
  ariaLabel,
}: {
  label: string;
  current: number;
  target: number;
  currentDisplay: string;
  targetDisplay: string;
  ragStatus: RagStatus;
  ariaLabel: string;
}) {
  const ratio = target > 0 ? Math.min(Math.max(current / target, 0), 1) : 0;
  const complete = ratio >= 1;
  const dashOffset = RING_CIRC * (1 - ratio);

  return (
    <div
      className="flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-1.5 motion-safe:transition-colors hover:bg-ima-surface-light/60"
      aria-label={ariaLabel}
    >
      <div
        className="relative shrink-0"
        style={{ width: RING_SIZE, height: RING_SIZE }}
        aria-hidden="true"
      >
        <svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          className="-rotate-90"
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            className="stroke-ima-border"
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRC}
            strokeDashoffset={dashOffset}
            className={cn(
              ringStrokeClass(ragStatus),
              "motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500 motion-safe:ease-out",
            )}
          />
        </svg>
        {complete && (
          <svg
            className="pointer-events-none absolute inset-0 m-auto text-ima-success"
            width={10}
            height={10}
            viewBox="0 0 10 10"
            fill="none"
          >
            <path
              d="M2 5.4l2 2 4-4.6"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-[10px] font-semibold uppercase leading-[1] tracking-[0.08em] text-ima-text-muted">
          {label}
        </span>
        <span className="mt-1 text-sm font-semibold leading-[1.1] tabular-nums tracking-tight">
          <span className={valueTextClass(ragStatus, complete)}>{currentDisplay}</span>
          <span className="text-ima-text-secondary"> / {targetDisplay}</span>
        </span>
      </div>
    </div>
  );
}

function CounterKpi({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: string;
  ariaLabel: string;
}) {
  return (
    <div
      className="flex items-baseline gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 motion-safe:transition-colors hover:bg-ima-surface-light/60"
      aria-label={ariaLabel}
    >
      <span className="text-[10px] font-semibold uppercase leading-[1] tracking-[0.08em] text-ima-text-muted">
        {label}
      </span>
      <span className="text-sm font-semibold leading-[1] tabular-nums tracking-tight text-ima-text">
        {value}
      </span>
    </div>
  );
}

function RingCounterKpi({
  label,
  value,
  ariaLabel,
}: {
  label: string;
  value: string;
  targetDisplay?: string;
  ariaLabel: string;
}) {
  return (
    <div
      className="flex flex-col whitespace-nowrap rounded-lg px-3 py-1.5 motion-safe:transition-colors hover:bg-ima-surface-light/60"
      aria-label={ariaLabel}
    >
      <span className="text-[10px] font-semibold uppercase leading-[1] tracking-[0.08em] text-ima-text-muted">
        {label}
      </span>
      <span className="mt-1 text-sm font-semibold leading-[1.1] tabular-nums tracking-tight text-ima-text">
        {value}
      </span>
    </div>
  );
}

export function ProgressBanner({
  lifetimeOutreach,
  lifetimeMinutesWorked,
  dailyOutreach,
  dailyMinutesWorked,
  callsJoined,
  brandsContacted,
  influencersContacted,
  joinedAt,
  outreachStarted,
}: ProgressBannerProps) {
  // RAG colors activate only after step 7 (outreach prep) is completed
  const days = outreachStarted ? computeDaysInProgram(joinedAt) : 0;

  const lifetimeRag = lifetimeOutreachRag(lifetimeOutreach, days);
  const dailyRag = dailyOutreachRag(dailyOutreach, days);
  const hoursRag = dailyHoursRag(dailyMinutesWorked, days);

  const hoursTargetMinutes = WORK_TRACKER.dailyGoalHours * 60;

  return (
    <div
      className="sticky top-3 z-20 mx-3 mb-5 rounded-2xl border border-ima-border bg-ima-surface px-4 py-2 shadow-[0_4px_16px_-4px_rgba(15,23,42,0.12)] md:mx-4"
      role="region"
      aria-label="KPI summary"
    >
      <div className="flex min-h-12 flex-wrap items-center gap-y-1 md:h-12 md:flex-nowrap">
        {/* Goal group — lifetime pair */}
        <div className="flex items-center gap-0.5">
          <GoalKpi
            label="Lifetime Outreach"
            current={lifetimeOutreach}
            target={KPI_TARGETS.lifetimeOutreach}
            currentDisplay={lifetimeOutreach.toLocaleString()}
            targetDisplay={KPI_TARGETS.lifetimeOutreach.toLocaleString()}
            ragStatus={lifetimeRag}
            ariaLabel={`Lifetime outreach: ${lifetimeOutreach} of ${KPI_TARGETS.lifetimeOutreach}`}
          />
          <RingCounterKpi
            label="Lifetime Hours"
            value={formatHoursMinutes(lifetimeMinutesWorked)}
            ariaLabel={`Lifetime hours worked: ${formatHoursMinutes(lifetimeMinutesWorked)}`}
          />
        </div>

        {/* Divider between lifetime and daily goal groups */}
        <div className="mx-2 hidden h-6 w-px bg-ima-border md:block" aria-hidden="true" />

        {/* Goal group — daily pair */}
        <div className="flex items-center gap-0.5">
          <GoalKpi
            label="Daily Outreach"
            current={dailyOutreach}
            target={KPI_TARGETS.dailyOutreach}
            currentDisplay={String(dailyOutreach)}
            targetDisplay={String(KPI_TARGETS.dailyOutreach)}
            ragStatus={dailyRag}
            ariaLabel={`Daily outreach: ${dailyOutreach} of ${KPI_TARGETS.dailyOutreach}`}
          />
          <GoalKpi
            label="Hours Worked"
            current={dailyMinutesWorked}
            target={hoursTargetMinutes}
            currentDisplay={formatHoursMinutes(dailyMinutesWorked)}
            targetDisplay={`${WORK_TRACKER.dailyGoalHours}h`}
            ragStatus={hoursRag}
            ariaLabel={`Hours worked today: ${formatHoursMinutes(dailyMinutesWorked)} of ${WORK_TRACKER.dailyGoalHours} hours`}
          />
        </div>

        {/* Divider between goal- and counter-groups, pushed flush-right-of-center by the counter group's ml-auto */}
        <div className="ml-auto mr-3 hidden h-6 w-px bg-ima-border md:block" aria-hidden="true" />

        {/* Counter group — contextless raw counts */}
        <div className="flex items-center gap-0.5">
          <CounterKpi
            label="Calls Joined"
            value={String(callsJoined)}
            ariaLabel={`Calls joined today: ${callsJoined}`}
          />
          <CounterKpi
            label="Brands Outreach"
            value={String(brandsContacted)}
            ariaLabel={`Brands outreach today: ${brandsContacted}`}
          />
          <CounterKpi
            label="Influencers Outreach"
            value={String(influencersContacted)}
            ariaLabel={`Influencers outreach today: ${influencersContacted}`}
          />
        </div>
      </div>
    </div>
  );
}
