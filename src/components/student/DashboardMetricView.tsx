"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Hourglass, Mail } from "lucide-react";
import { TodaysWorkMetric } from "@/components/student/TodaysWorkMetric";
import { TodaysEmailsMetric } from "@/components/student/TodaysEmailsMetric";
import { WeeklyHoursChart } from "@/components/student/WeeklyHoursChart";
import { WeeklyEmailsChart } from "@/components/student/WeeklyEmailsChart";
import { KPI_TARGETS } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { EmailCounts } from "@/lib/emails";
import type { DailyHours } from "@/lib/weekly-hours";
import type { DailyEmails } from "@/lib/weekly-emails";

type Metric = "emails" | "hours";

const METRICS: { value: Metric; label: string; icon: typeof Mail }[] = [
  { value: "emails", label: "Emails sent", icon: Mail },
  { value: "hours", label: "Hours worked", icon: Hourglass },
];

const badgeClass =
  "text-[10px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase tabular-nums";

function GoalReachedBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Goal Reached
    </span>
  );
}

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

/** Content slides in the direction of travel on the vertical switch:
 *  emails (top) → hours (bottom) rises up from below, and back again drops in. */
const swapVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, y: dir * 14, filter: "blur(2px)" }),
  center: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.32, ease: EASE_OUT },
  },
  exit: (dir: number) => ({
    opacity: 0,
    y: dir * -10,
    filter: "blur(2px)",
    transition: { duration: 0.16, ease: "easeIn" },
  }),
};

const fadeVariants: Variants = {
  enter: { opacity: 0, scale: 0.96 },
  center: { opacity: 1, scale: 1, transition: { duration: 0.22, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.96, transition: { duration: 0.12, ease: "easeIn" } },
};

/** Animates its own height to follow its content, so swapping to a taller or
 *  shorter metric glides the card instead of snapping it. */
function AutoHeight({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setHeight(el.getBoundingClientRect().height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={reduced ? { duration: 0 } : { duration: 0.34, ease: EASE_OUT }}
      // Bleed 6px so focus rings on the content aren't clipped by overflow-hidden
      className="-m-[6px] overflow-hidden"
    >
      <div ref={innerRef} className="p-[6px]">
        {children}
      </div>
    </motion.div>
  );
}

/**
 * Vertical segmented switch — envelope (emails, default) over hourglass
 * (hours). A radiogroup: one tab stop, arrow keys move the selection.
 */
function MetricSwitch({
  value,
  onChange,
  reduced,
}: {
  value: Metric;
  onChange: (m: Metric) => void;
  reduced: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const next = METRICS[(METRICS.findIndex((m) => m.value === value) + 1) % METRICS.length];
    onChange(next.value);
    refs.current[METRICS.indexOf(next)]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Dashboard metric"
      onKeyDown={onKeyDown}
      className="flex flex-col gap-1 p-1 rounded-full bg-ima-surface-light border border-ima-border self-start shrink-0"
    >
      {METRICS.map((m, i) => {
        const checked = m.value === value;
        const Icon = m.icon;
        return (
          <button
            key={m.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={m.label}
            title={m.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(m.value)}
            className={cn(
              "relative h-11 w-11 rounded-full flex items-center justify-center motion-safe:transition-[color,transform] duration-200 ease-out focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 active:scale-95",
              checked ? "text-ima-primary" : "text-ima-text-secondary hover:text-ima-text",
            )}
          >
            {/* The white thumb slides between the two slots */}
            {checked && (
              <motion.span
                layoutId="metric-switch-thumb"
                className="absolute inset-0 rounded-full bg-white shadow-card"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 500, damping: 34, mass: 0.7 }
                }
                aria-hidden="true"
              />
            )}
            <Icon className="relative h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * The dashboard's metric-driven band: the Today's Work hero card and the
 * weekly chart further down both follow one Emails / Hours switch. Server-
 * rendered pieces between them (next action, coach note) come in as
 * slots so they stay server components.
 */
export function DashboardMetricView({
  emails,
  weeklyEmails,
  totalMinutes,
  hoursGoalMet,
  completedSessions,
  weeklyHours,
  logEmailsHref,
  nextAction,
  coachNote,
}: {
  emails: EmailCounts;
  weeklyEmails: DailyEmails[];
  totalMinutes: number;
  hoursGoalMet: boolean;
  completedSessions: number;
  weeklyHours: DailyHours[];
  logEmailsHref: string;
  nextAction: ReactNode;
  coachNote: ReactNode;
}) {
  const [metric, setMetric] = useState<Metric>("emails");
  const reduced = useReducedMotion() ?? false;
  // +1 = moving down the switch (emails → hours), -1 = moving up
  const dir = metric === "hours" ? 1 : -1;
  const swap = reduced ? undefined : swapVariants;
  const emailsGoalMet = emails.total >= KPI_TARGETS.dailyOutreach;
  const emailsLeft = Math.max(0, KPI_TARGETS.dailyOutreach - emails.total);

  return (
    <>
      {/* Hero — Today's Work + the one next action */}
      <section
        className="mt-9 motion-safe:animate-riseIn"
        style={{ animationDelay: "100ms" }}
      >
        <div className="flex flex-col gap-5">
          <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-8">
            <div className="flex gap-[14px] md:gap-[18px]">
              <MetricSwitch value={metric} onChange={setMetric} reduced={reduced} />

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <p
                    id="todays-work-label"
                    className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
                  >
                    Today&apos;s Work
                  </p>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={metric}
                      variants={reduced ? undefined : fadeVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      className="inline-flex"
                    >
                      {metric === "emails" ? (
                        emailsGoalMet ? (
                          <GoalReachedBadge />
                        ) : (
                          <span className={badgeClass}>{emailsLeft} to go</span>
                        )
                      ) : hoursGoalMet ? (
                        <GoalReachedBadge />
                      ) : (
                        <span className={badgeClass}>
                          {completedSessions} done
                        </span>
                      )}
                    </motion.span>
                  </AnimatePresence>
                </div>

                <AutoHeight reduced={reduced}>
                  <AnimatePresence mode="wait" initial={false} custom={dir}>
                    <motion.div
                      key={metric}
                      custom={dir}
                      variants={swap}
                      initial="enter"
                      animate="center"
                      exit="exit"
                    >
                    {metric === "emails" ? (
                      <>
                        <TodaysEmailsMetric counts={emails} />
                        <Link
                          href={logEmailsHref}
                          className="group mt-[14px] inline-flex items-center gap-1.5 text-[13px] font-semibold text-ima-primary min-h-[44px] rounded-md focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                        >
                          Log emails
                          <ArrowRight
                            className="h-3.5 w-3.5 motion-safe:transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                            aria-hidden="true"
                          />
                        </Link>
                      </>
                    ) : (
                      <TodaysWorkMetric totalMinutes={totalMinutes} goalMet={hoursGoalMet} />
                    )}
                    </motion.div>
                  </AnimatePresence>
                </AutoHeight>
              </div>
            </div>
          </div>

          {nextAction}
        </div>
      </section>

      {coachNote}

      {/* This week — follows the switch */}
      <div
        className="mt-[14px] motion-safe:animate-riseIn"
        style={{ animationDelay: "175ms" }}
      >
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={metric}
            custom={dir}
            variants={swap}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {metric === "emails" ? (
              <WeeklyEmailsChart data={weeklyEmails} />
            ) : (
              <WeeklyHoursChart data={weeklyHours} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
