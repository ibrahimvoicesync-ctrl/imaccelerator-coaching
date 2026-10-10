"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { Gauge, X } from "lucide-react";
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
  lifetimeRevenue: number;
  lifetimeProfit: number;
  joinedAt: string;
  outreachStarted: boolean;
}

/** Compact whole-dollar formatting for the KPI popup (e.g. $1,250). */
function formatMoney(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

/**
 * Legacy inline KPI row — retained because StudentKpiSummary (non-sticky card) still renders it.
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
      <span className="text-ima-text-secondary">{label}:</span>
      <span className={cn("font-semibold", colorClass)}>{value}</span>
    </div>
  );
}

/** Graphics-grade fill (dots, bars). Green uses the bright token — the
 *  text-grade emerald reads muddy at dot size. */
function ragFillClass(status: RagStatus, complete = false): string {
  if (complete) return "bg-ima-success-bright";
  switch (status) {
    case "green":
      return "bg-ima-success-bright";
    case "amber":
      return "bg-ima-warning";
    case "red":
      return "bg-ima-error";
    default:
      return "bg-ima-text-secondary";
  }
}

function ragValueClass(status: RagStatus, complete: boolean): string {
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

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04, delayChildren: 0.06 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
};

/** Goal row — label + "current / target", with a progress bar underneath. */
function GoalRow({
  label,
  current,
  target,
  currentDisplay,
  targetDisplay,
  ragStatus,
  ariaLabel,
  reduced,
}: {
  label: string;
  current: number;
  target: number;
  currentDisplay: string;
  targetDisplay: string;
  ragStatus: RagStatus;
  ariaLabel: string;
  reduced: boolean;
}) {
  const ratio = target > 0 ? Math.min(Math.max(current / target, 0), 1) : 0;
  const complete = ratio >= 1;

  return (
    <motion.div variants={reduced ? undefined : itemVariants} aria-label={ariaLabel}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-ima-text-secondary">{label}</span>
        <span className="text-[14px] font-semibold tabular-nums">
          <span className={ragValueClass(ragStatus, complete)}>{currentDisplay}</span>
          <span className="font-normal text-ima-text-secondary"> / {targetDisplay}</span>
        </span>
      </div>
      <div
        className="mt-[6px] h-1.5 overflow-hidden rounded-full bg-ima-surface-light"
        aria-hidden="true"
      >
        <motion.div
          className={cn("h-full rounded-full", ragFillClass(ragStatus, complete))}
          initial={reduced ? false : { width: 0 }}
          animate={{ width: `${ratio * 100}%` }}
          transition={{ duration: reduced ? 0 : 0.7, ease: EASE_OUT, delay: reduced ? 0 : 0.12 }}
        />
      </div>
    </motion.div>
  );
}

/** Plain stat tile — label above a value. */
function StatTile({
  label,
  value,
  ariaLabel,
  valueClassName = "text-ima-text",
  reduced,
}: {
  label: string;
  value: string;
  ariaLabel: string;
  valueClassName?: string;
  reduced: boolean;
}) {
  return (
    <motion.div
      variants={reduced ? undefined : itemVariants}
      className="min-w-0 rounded-[10px] bg-ima-surface-light px-[10px] py-[10px]"
      aria-label={ariaLabel}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary">
        {label}
      </p>
      <p className={cn("mt-1 truncate text-[15px] font-semibold tabular-nums", valueClassName)}>
        {value}
      </p>
    </motion.div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary">
      {children}
    </p>
  );
}

export function ProgressBanner({
  lifetimeOutreach,
  lifetimeMinutesWorked,
  dailyOutreach,
  dailyMinutesWorked,
  callsJoined,
  lifetimeRevenue,
  lifetimeProfit,
  joinedAt,
  outreachStarted,
}: ProgressBannerProps) {
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  const close = useCallback(() => {
    restoreFocusRef.current = true;
    setOpen(false);
  }, []);

  // The bubble and panel swap elements, so move focus across the swap:
  // into the panel on open, back to the bubble when closed via X / Escape.
  useEffect(() => {
    if (open) {
      closeRef.current?.focus({ preventScroll: true });
    } else if (restoreFocusRef.current) {
      restoreFocusRef.current = false;
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  // Close on Escape or a click outside the dock
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  // RAG colors activate only after step 7 (outreach prep) is completed
  const days = outreachStarted ? computeDaysInProgram(joinedAt) : 0;

  const lifetimeRag = lifetimeOutreachRag(lifetimeOutreach, days);
  const dailyRag = dailyOutreachRag(dailyOutreach, days);
  const hoursRag = dailyHoursRag(dailyMinutesWorked, days);

  const hoursTargetMinutes = WORK_TRACKER.dailyGoalHours * 60;
  const dailyComplete = dailyOutreach >= KPI_TARGETS.dailyOutreach;

  // One surface, two shapes: the 52px bubble and the panel share a layoutId,
  // so opening morphs the circle into the card (and back). A slightly
  // under-damped spring gives the edge a soft, blob-like settle.
  const blobTransition = reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 340, damping: 26, mass: 0.9 };

  return (
    <div
      ref={rootRef}
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 md:bottom-6 md:right-6 z-40 flex flex-col items-end print:hidden"
    >
      {open ? (
        <motion.div
          key="panel"
          layoutId="kpi-blob"
          id={panelId}
          role="region"
          aria-label="KPI summary"
          transition={blobTransition}
          style={{ borderRadius: 14 }}
          className="w-[min(21rem,calc(100vw-2rem))] overflow-hidden border border-ima-border bg-ima-surface shadow-[0_1px_2px_rgba(15,23,42,0.06),0_16px_40px_-12px_rgba(15,23,42,0.24)]"
        >
          {/* Content waits for the surface to grow, so it never renders squashed */}
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, delay: reduced ? 0 : 0.14 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-ima-border py-[10px] pl-[18px] pr-[6px]">
              <div>
                <p className="text-[14px] font-semibold text-ima-text">Your numbers</p>
                <p className="text-[12px] text-ima-text-secondary">Today and all-time progress</p>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
                aria-label="Close KPI summary"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <motion.div
              variants={reduced ? undefined : listVariants}
              initial={reduced ? false : "hidden"}
              animate="show"
              className="flex flex-col gap-[18px] p-[18px]"
            >
              {/* Today */}
              <div className="flex flex-col gap-[14px]">
                <SectionLabel>Today</SectionLabel>
                <GoalRow
                  label="Outreach"
                  current={dailyOutreach}
                  target={KPI_TARGETS.dailyOutreach}
                  currentDisplay={String(dailyOutreach)}
                  targetDisplay={String(KPI_TARGETS.dailyOutreach)}
                  ragStatus={dailyRag}
                  ariaLabel={`Daily outreach: ${dailyOutreach} of ${KPI_TARGETS.dailyOutreach}`}
                  reduced={reduced}
                />
                <GoalRow
                  label="Hours worked"
                  current={dailyMinutesWorked}
                  target={hoursTargetMinutes}
                  currentDisplay={formatHoursMinutes(dailyMinutesWorked)}
                  targetDisplay={`${WORK_TRACKER.dailyGoalHours}h`}
                  ragStatus={hoursRag}
                  ariaLabel={`Hours worked today: ${formatHoursMinutes(dailyMinutesWorked)} of ${WORK_TRACKER.dailyGoalHours} hours`}
                  reduced={reduced}
                />
                <motion.div
                  variants={reduced ? undefined : itemVariants}
                  className="flex items-baseline justify-between gap-3"
                  aria-label={`Calls joined today: ${callsJoined}`}
                >
                  <span className="text-[13px] text-ima-text-secondary">Calls joined</span>
                  <span className="text-[14px] font-semibold tabular-nums text-ima-text">
                    {callsJoined}
                  </span>
                </motion.div>
              </div>

              <div className="border-t border-ima-border" aria-hidden="true" />

              {/* Lifetime */}
              <div className="flex flex-col gap-[14px]">
                <SectionLabel>All time</SectionLabel>
                <GoalRow
                  label="Outreach"
                  current={lifetimeOutreach}
                  target={KPI_TARGETS.lifetimeOutreach}
                  currentDisplay={lifetimeOutreach.toLocaleString()}
                  targetDisplay={KPI_TARGETS.lifetimeOutreach.toLocaleString()}
                  ragStatus={lifetimeRag}
                  ariaLabel={`Lifetime outreach: ${lifetimeOutreach} of ${KPI_TARGETS.lifetimeOutreach}`}
                  reduced={reduced}
                />
                <div className="grid grid-cols-3 gap-[6px]">
                  <StatTile
                    label="Hours"
                    value={formatHoursMinutes(lifetimeMinutesWorked)}
                    ariaLabel={`Lifetime hours worked: ${formatHoursMinutes(lifetimeMinutesWorked)}`}
                    reduced={reduced}
                  />
                  <StatTile
                    label="Revenue"
                    value={formatMoney(lifetimeRevenue)}
                    ariaLabel={`Lifetime revenue logged: ${formatMoney(lifetimeRevenue)}`}
                    reduced={reduced}
                  />
                  <StatTile
                    label="Profit"
                    value={formatMoney(lifetimeProfit)}
                    valueClassName={lifetimeProfit > 0 ? "text-ima-success" : "text-ima-text"}
                    ariaLabel={`Lifetime profit logged: ${formatMoney(lifetimeProfit)}`}
                    reduced={reduced}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      ) : (
        <motion.button
          key="bubble"
          layoutId="kpi-blob"
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          whileHover={reduced ? undefined : { y: -2 }}
          whileTap={reduced ? undefined : { scale: 0.92 }}
          transition={blobTransition}
          style={{ borderRadius: 26 }}
          aria-expanded={false}
          aria-label="Show KPI summary"
          className="relative flex h-[52px] w-[52px] items-center justify-center border border-ima-border bg-white text-ima-text shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_-8px_rgba(15,23,42,0.25)] hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_12px_28px_-8px_rgba(15,23,42,0.32)] motion-safe:transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2"
        >
          <motion.span
            initial={reduced ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18, delay: reduced ? 0 : 0.12 }}
            className="flex"
          >
            <Gauge className="h-5 w-5" aria-hidden="true" />
          </motion.span>
          {/* Today's outreach status at a glance — pings once the daily goal is hit */}
          <span className="absolute right-0.5 top-0.5 flex h-3 w-3" aria-hidden="true">
            {dailyComplete && !reduced && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-ima-live opacity-60 motion-safe:animate-ping" />
            )}
            <span
              className={cn(
                "relative inline-flex h-3 w-3 rounded-full ring-2 ring-white",
                dailyComplete || dailyRag === "green"
                  ? "bg-ima-live"
                  : ragFillClass(dailyRag, dailyComplete),
              )}
            />
          </span>
        </motion.button>
      )}
    </div>
  );
}
