"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { WorkTimer } from "@/components/student/WorkTimer";
import { CycleCard } from "@/components/student/CycleCard";
import { PlannerUI } from "@/components/student/PlannerUI";
import { PlannedSessionList } from "@/components/student/PlannedSessionList";
import { MotivationalCard } from "@/components/student/MotivationalCard";
import { planJsonSchema } from "@/lib/schemas/daily-plan";
import type { PlanJson } from "@/lib/schemas/daily-plan";
import { WORK_TRACKER } from "@/lib/config";

import { getToday, formatPausedRemaining, formatHoursMinutes } from "@/lib/utils";
import type { Database } from "@/lib/types";

type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];
type DailyPlan = Database["public"]["Tables"]["daily_plans"]["Row"];

type TrackerPhase =
  | { kind: "idle" }
  | { kind: "setup" }
  | { kind: "working" }
  | { kind: "break"; secondsRemaining: number };

interface WorkTrackerClientProps {
  initialSessions: WorkSession[];
  initialPlan: DailyPlan | null;
  dailyReportHref?: string;
}

export function WorkTrackerClient({ initialSessions, initialPlan, dailyReportHref }: WorkTrackerClientProps) {
  const routerRef = useRef(useRouter());
  const router = routerRef.current;
  const toastRef = useRef(useToast());

  const [sessions, setSessions] = useState<WorkSession[]>(initialSessions);
  const [isLoading, setIsLoading] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  // State machine phase
  const [phase, setPhase] = useState<TrackerPhase>({ kind: "idle" });
  const [selectedMinutes, setSelectedMinutes] = useState<number>(WORK_TRACKER.defaultSessionMinutes);
  const [breakType, setBreakType] = useState<"short" | "long">("short");
  const [breakMinutes, setBreakMinutes] = useState<number>(WORK_TRACKER.breakOptions.short.presets[0]);
  const [showAllSessions, setShowAllSessions] = useState(false);

  // Track motivational card display — once per day via localStorage (COMP-04)
  const [hasSeenCard, setHasSeenCard] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(`ima-motivational-seen-${getToday()}`) === "1";
  });

  // Keep sessions in sync when server re-renders with fresh initialSessions
  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  // Stale session auto-abandon on mount
  useEffect(() => {
    const today = getToday();
    const staleSessions = initialSessions.filter(
      (s) =>
        (s.status === "in_progress" || s.status === "paused") &&
        s.date < today
    );

    if (staleSessions.length === 0) return;

    const abandonStale = async () => {
      const results = await Promise.all(
        staleSessions.map((s) =>
          fetch(`/api/work-sessions/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "abandoned" }),
          })
        )
      );
      const allOk = results.every((r) => r.ok);
      if (!allOk) {
        console.error("[WorkTrackerClient] Some stale sessions failed to abandon");
      }
      router.refresh();
    };

    abandonStale().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived values
  const completedCount = sessions.filter((s) => s.status === "completed").length;
  const activeSession = sessions.find((s) => s.status === "in_progress");
  const pausedSession = sessions.find((s) => s.status === "paused");
  const nextCycleNumber = completedCount + 1;
  const totalMinutesWorked = sessions
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.duration_minutes, 0);
  const dailyGoalMinutes = WORK_TRACKER.dailyGoalHours * 60;
  const progressPercent = Math.min(100, Math.round((totalMinutesWorked / dailyGoalMinutes) * 100));

  // Parse plan_json through Zod — never trust raw JSONB (Pitfall 2)
  const parsedPlan: PlanJson | null = (() => {
    if (!initialPlan) return null;
    const result = planJsonSchema.safeParse(initialPlan.plan_json);
    if (!result.success) {
      console.error("[WorkTrackerClient] Invalid plan_json:", result.error);
      return null;
    }
    return result.data;
  })();

  // Derive mode from server data — never useState (survives refresh correctly)
  const planFulfilled =
    parsedPlan !== null && completedCount >= parsedPlan.sessions.length;
  const mode: "planning" | "executing" | "adhoc" =
    parsedPlan === null ? "planning" : !planFulfilled ? "executing" : "adhoc";

  // Phase initialization — sync phase with session state
  useEffect(() => {
    if (activeSession) {
      setPhase({ kind: "working" });
    } else if (pausedSession) {
      setPhase({ kind: "working" }); // paused is still "working" phase
    } else if (phase.kind === "working") {
      // Session just ended — handled by handleComplete
    } else if (phase.kind !== "setup" && phase.kind !== "break" && mode !== "planning" && mode !== "executing") {
      setPhase({ kind: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession, pausedSession]);

  // Break countdown — client state only, never touches DB
  useEffect(() => {
    if (phase.kind !== "break") return;
    if (phase.secondsRemaining <= 0) {
      setPhase({ kind: "idle" });
      return;
    }
    const id = setInterval(() => {
      setPhase((prev) => {
        if (prev.kind !== "break") return prev;
        const next = prev.secondsRemaining - 1;
        if (next <= 0) return { kind: "idle" };
        return { kind: "break", secondsRemaining: next };
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, phase.kind === "break" ? phase.secondsRemaining : 0]);

  // --- Mutation handlers ---

  const handleStart = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/work-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: getToday(),
          cycle_number: nextCycleNumber,
          session_minutes: selectedMinutes,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => { console.error("[WorkTrackerClient] Failed to parse error response:", parseErr); return { error: null }; });
        // 409 = a session is already running server-side that the client lost
        // track of (e.g. a dropped response after the row committed). Reconcile
        // by refreshing so the active/paused session resurfaces, rather than
        // dead-ending on an error the student can't act on.
        if (response.status === 409) {
          toastRef.current.toast({ type: "error", title: "You already have a session running. Finish or discard it first." });
          router.refresh();
          return;
        }
        console.error("[WorkTrackerClient] Failed to start session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Failed to start session" });
        return;
      }
      const newSession = await response.json();
      setSessions((prev) => [...prev, newSession]);
      setPhase({ kind: "working" });
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleStart error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [nextCycleNumber, selectedMinutes, router]);

  const handleStartWithConfig = useCallback(
    async (
      sessionMinutes: number,
      sessionBreakType: "short" | "long" | "none",
      sessionBreakMinutes: number
    ) => {
      setIsLoading(true);
      try {
        const response = await fetch("/api/work-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: getToday(),
            cycle_number: nextCycleNumber,
            session_minutes: sessionMinutes,
          }),
        });
        if (!response.ok) {
          const err = await response.json().catch((parseErr) => {
            console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
            return { error: null };
          });
          // 409 = a session is already running server-side the client lost track
          // of. Reconcile by refreshing so it resurfaces (see handleStart).
          if (response.status === 409) {
            toastRef.current.toast({ type: "error", title: "You already have a session running. Finish or discard it first." });
            router.refresh();
            return;
          }
          console.error("[WorkTrackerClient] Failed to start planned session:", err);
          toastRef.current.toast({ type: "error", title: err.error || "Failed to start session" });
          return;
        }
        const newSession = await response.json();
        setSessions((prev) => [...prev, newSession]);
        // Store break config for when this session completes
        setBreakType(sessionBreakType === "none" ? "short" : sessionBreakType);
        setBreakMinutes(sessionBreakType === "none" ? 0 : sessionBreakMinutes);
        setPhase({ kind: "working" });
        router.refresh();
      } catch (err) {
        console.error("[WorkTrackerClient] handleStartWithConfig error:", err);
        toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
      } finally {
        setIsLoading(false);
      }
    },
    [nextCycleNumber, router]
  );

  const handleStartPlanned = useCallback(
    (planIndex: number) => {
      if (!parsedPlan) return;
      const slot = parsedPlan.sessions[planIndex];
      if (!slot) return;
      handleStartWithConfig(slot.session_minutes, slot.break_type, slot.break_minutes);
    },
    [parsedPlan, handleStartWithConfig]
  );

  const handleComplete = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => { console.error("[WorkTrackerClient] Failed to parse error response:", parseErr); return { error: null }; });
        // Silently ignore race condition with auto-complete
        if (typeof err.error === "string" && err.error.includes("Cannot transition")) {
          router.refresh();
          return;
        }
        console.error("[WorkTrackerClient] Failed to complete session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Failed to complete session" });
        return;
      }
      // Optimistically mark the session completed in local state so the
      // active-session render block unmounts in the same paint that the break
      // countdown mounts — prevents a one-frame dual-render flicker between
      // setPhase(break) and router.refresh() landing fresh server props.
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId ? { ...s, status: "completed" } : s
        )
      );
      // After completion: trigger break with the selected break duration
      setPhase({ kind: "break", secondsRemaining: breakMinutes * 60 });
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleComplete error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [completedCount, breakMinutes, router]);

  const handlePause = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => { console.error("[WorkTrackerClient] Failed to parse error response:", parseErr); return { error: null }; });
        console.error("[WorkTrackerClient] Failed to pause session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Failed to pause session" });
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handlePause error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const handleResume = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => { console.error("[WorkTrackerClient] Failed to parse error response:", parseErr); return { error: null }; });
        console.error("[WorkTrackerClient] Failed to resume session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Failed to resume session" });
        return;
      }
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleResume error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const handleAbandon = useCallback(async (sessionId: string) => {
    // Look up target session by ID — safe for both active and paused states
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;

    // Grace period check
    const elapsed = Date.now() - new Date(target.started_at).getTime();
    if (elapsed > WORK_TRACKER.abandonGraceSeconds * 1000 && !showAbandonConfirm) {
      setShowAbandonConfirm(true);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "abandoned" }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => { console.error("[WorkTrackerClient] Failed to parse error response:", parseErr); return { error: null }; });
        console.error("[WorkTrackerClient] Failed to abandon session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Failed to abandon session" });
        return;
      }
      setShowAbandonConfirm(false);
      setPhase({ kind: "idle" });
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleAbandon error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [sessions, showAbandonConfirm, router]);

  const handleEditSession = useCallback(async (sessionId: string, minutes: number) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duration_minutes: minutes }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => { console.error("[WorkTrackerClient] Failed to parse error response:", parseErr); return { error: null }; });
        console.error("[WorkTrackerClient] Failed to edit session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Failed to update session" });
        return;
      }
      const updated = await response.json();
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? updated : s)));
      toastRef.current.toast({ type: "success", title: "Session updated" });
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleEditSession error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => { console.error("[WorkTrackerClient] Failed to parse error response:", parseErr); return { error: null }; });
        console.error("[WorkTrackerClient] Failed to delete session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Failed to delete session" });
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      toastRef.current.toast({ type: "success", title: "Entry deleted" });
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleDeleteSession error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  function handleSkipBreak() {
    setPhase({ kind: "idle" });
  }

  function markCardSeen() {
    localStorage.setItem(`ima-motivational-seen-${getToday()}`, "1");
    setHasSeenCard(true);
  }

  const handleStartNextSession = useCallback(() => {
    markCardSeen();
    // Reset break state to defaults for ad-hoc mode (Pitfall 5)
    setBreakType("short");
    setBreakMinutes(WORK_TRACKER.breakOptions.short.presets[0]);
    setSelectedMinutes(WORK_TRACKER.defaultSessionMinutes);
    setPhase({ kind: "setup" });
  }, []);

  const handleDismissCard = useCallback(() => {
    markCardSeen();
    // Reset break state to defaults for ad-hoc mode (Pitfall 5)
    setBreakType("short");
    setBreakMinutes(WORK_TRACKER.breakOptions.short.presets[0]);
    setSelectedMinutes(WORK_TRACKER.defaultSessionMinutes);
  }, []);

  // --- Render ---

    const goalMet = progressPercent >= 100;
  const isCustomDuration = !(
    WORK_TRACKER.sessionDurationOptions as readonly number[]
  ).includes(selectedMinutes);
  const isActiveView = !!activeSession && phase.kind !== "break";
  const isPausedView = !!pausedSession && !activeSession;
  const isBreakView = phase.kind === "break";
  const isSetupView = phase.kind === "setup";
  const isFocusedView = isActiveView || isPausedView || isBreakView || isSetupView;

  return (
    <div>
      {/* Hero — Today's Work card (mirrors student dashboard) */}
      <section
        aria-labelledby="todays-work-label"
        className="motion-safe:animate-fadeIn"
      >
        <div className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8">
          <div className="flex items-center justify-between gap-3">
            <p
              id="todays-work-label"
              className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
            >
              Today&apos;s Work
            </p>
            {goalMet ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success">
                <span className="inline-block h-[6px] w-[6px] rounded-full bg-ima-success" aria-hidden="true" />
                Goal Reached
              </span>
            ) : (
              <span
                className="text-[10px] font-semibold tracking-[0.14em] text-ima-text-secondary uppercase tabular-nums"
              >
                {completedCount} Session{completedCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          <div className="mt-5 flex items-end gap-2">
            <span
              className={`text-[44px] md:text-[52px] font-bold tabular-nums tracking-[-0.02em] leading-none ${
                goalMet ? "text-ima-success" : "text-ima-primary"
              }`}
            >
              {formatHoursMinutes(totalMinutesWorked)}
            </span>
            <span className="pb-[6px] text-[15px] font-medium text-ima-text-secondary tabular-nums">
              / {WORK_TRACKER.dailyGoalHours}h
            </span>
          </div>

          <div
            className="mt-5 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
            role="progressbar"
            aria-valuenow={totalMinutesWorked}
            aria-valuemin={0}
            aria-valuemax={dailyGoalMinutes}
            aria-label={`Daily hours progress: ${formatHoursMinutes(totalMinutesWorked)} of ${WORK_TRACKER.dailyGoalHours}h`}
          >
            <div
              className={`h-full rounded-full motion-safe:transition-[width] duration-700 ease-out ${
                goalMet ? "bg-ima-success" : "bg-ima-primary"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </section>

      {/* Focused states — break / setup / active / paused — each render inside a white editorial card */}
      {isFocusedView && (
        <section
          aria-label="Current session"
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <div className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8">
            {/* Break countdown */}
            {isBreakView && phase.kind === "break" && (
              <div className="flex flex-col items-center gap-5 text-center">
                <p
                  className="text-[11px] uppercase tracking-[0.22em] font-semibold text-ima-text-secondary"
                >
                  Break
                </p>
                <p
                  className="text-[56px] md:text-[72px] font-bold tabular-nums tracking-[-0.02em] text-ima-text leading-none"
                  role="timer"
                  aria-label={`Break: ${Math.floor(phase.secondsRemaining / 60)} minutes ${phase.secondsRemaining % 60} seconds remaining`}
                >
                  {String(Math.floor(phase.secondsRemaining / 60)).padStart(2, "0")}:
                  {String(phase.secondsRemaining % 60).padStart(2, "0")}
                </p>
                <p className="text-[13px] text-ima-text-secondary tabular-nums">
                  {`Next up \u00B7 Session ${String(nextCycleNumber).padStart(2, "0")}`}
                </p>
                <button
                  onClick={handleSkipBreak}
                  className="bg-white border border-ima-border text-ima-text rounded-[12px] px-6 min-h-[48px] text-[14px] font-semibold hover:border-ima-border hover:bg-ima-bg motion-safe:transition-colors"
                >
                  Skip break
                </button>
              </div>
            )}

            {/* Setup phase */}
            {isSetupView && (
              <div className="flex flex-col items-center gap-8">
                <div className="text-center w-full">
                  <p
                    className="text-[11px] uppercase tracking-[0.22em] font-semibold text-ima-text-secondary mb-4"
                  >
                    Session duration
                  </p>
                  <div className="flex gap-2.5 justify-center flex-wrap">
                    {WORK_TRACKER.sessionDurationOptions.map((min) => (
                      <button
                        key={min}
                        onClick={() => setSelectedMinutes(min)}
                        className={`min-h-[52px] min-w-[72px] px-5 rounded-[12px] text-[16px] font-semibold tabular-nums motion-safe:transition-colors ${
                          selectedMinutes === min
                            ? "bg-ima-primary text-white"
                            : "bg-white border border-ima-border text-ima-text-secondary hover:border-ima-border hover:text-ima-text"
                        }`}
                        aria-pressed={selectedMinutes === min}
                      >
                        {min}
                        <span className="text-[13px] font-medium ml-0.5">m</span>
                      </button>
                    ))}
                  </div>
                  {/* Custom duration — any value between 5 and 240 minutes */}
                  <div className="mt-3 flex items-center justify-center gap-2.5">
                    <label
                      htmlFor="custom-session-minutes"
                      className={`text-[11px] uppercase tracking-[0.18em] font-semibold motion-safe:transition-colors ${
                        isCustomDuration ? "text-ima-primary" : "text-ima-text-secondary"
                      }`}
                    >
                      Custom
                    </label>
                    <input
                      id="custom-session-minutes"
                      type="number"
                      inputMode="numeric"
                      min={WORK_TRACKER.minSessionMinutes}
                      max={WORK_TRACKER.maxSessionMinutes}
                      value={isCustomDuration ? selectedMinutes : ""}
                      onChange={(e) => {
                        const raw = parseInt(e.target.value, 10);
                        if (Number.isNaN(raw)) {
                          setSelectedMinutes(WORK_TRACKER.minSessionMinutes);
                          return;
                        }
                        const clamped = Math.max(
                          WORK_TRACKER.minSessionMinutes,
                          Math.min(WORK_TRACKER.maxSessionMinutes, raw)
                        );
                        setSelectedMinutes(clamped);
                      }}
                      placeholder="min"
                      aria-label="Custom session duration in minutes"
                      className={`min-h-[44px] w-[88px] text-center rounded-[12px] text-[15px] font-semibold tabular-nums motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-1 ${
                        isCustomDuration
                          ? "bg-ima-surface-accent text-ima-primary border border-ima-primary"
                          : "bg-white border border-ima-border text-ima-text hover:border-ima-border"
                      }`}
                    />
                    <span className="text-[13px] text-ima-text-secondary">min</span>
                  </div>
                </div>

                <div className="text-center w-full">
                  <p
                    className="text-[11px] uppercase tracking-[0.22em] font-semibold text-ima-text-secondary mb-4"
                  >
                    Break before next session
                  </p>
                  <div className="flex gap-2.5 justify-center mb-3">
                    {(Object.keys(WORK_TRACKER.breakOptions) as Array<"short" | "long">).map((type) => (
                      <button
                        key={type}
                        onClick={() => {
                          setBreakType(type);
                          setBreakMinutes(WORK_TRACKER.breakOptions[type].presets[0]);
                        }}
                        className={`min-h-[48px] px-5 rounded-[12px] text-[14px] font-semibold motion-safe:transition-colors ${
                          breakType === type
                            ? "bg-ima-text text-white"
                            : "bg-white border border-ima-border text-ima-text-secondary hover:border-ima-border hover:text-ima-text"
                        }`}
                        aria-pressed={breakType === type}
                      >
                        {WORK_TRACKER.breakOptions[type].label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2.5 justify-center flex-wrap">
                    {WORK_TRACKER.breakOptions[breakType].presets.map((min) => (
                      <button
                        key={min}
                        onClick={() => setBreakMinutes(min)}
                        className={`min-h-[48px] min-w-[60px] px-4 rounded-[12px] text-[15px] font-semibold tabular-nums motion-safe:transition-colors ${
                          breakMinutes === min
                            ? "bg-ima-surface-accent text-ima-primary border border-ima-primary"
                            : "bg-white border border-ima-border text-ima-text-secondary hover:border-ima-border hover:text-ima-text"
                        }`}
                        aria-pressed={breakMinutes === min}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleStart}
                  disabled={isLoading}
                  className="group w-full inline-flex items-center justify-center gap-2 rounded-[12px] bg-ima-primary text-white text-[15px] font-semibold min-h-[56px] px-4 hover:bg-ima-primary-hover focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-colors"
                >
                  {isLoading ? "Starting\u2026" : `Begin session ${String(nextCycleNumber).padStart(2, "0")}`}
                  {!isLoading && (
                    <ArrowRight
                      className="h-4 w-4 motion-safe:transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </div>
            )}

            {/* Active timer */}
            {isActiveView && activeSession && (
              <div className="flex flex-col items-center gap-6">
                <div
                  className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-semibold text-ima-primary"
                >
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-ima-primary opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-ima-primary" />
                  </span>
                  In progress
                </div>

                <WorkTimer
                  sessionId={activeSession.id}
                  startedAt={activeSession.started_at}
                  cycleNumber={activeSession.cycle_number}
                  totalSeconds={(activeSession.session_minutes ?? WORK_TRACKER.defaultSessionMinutes) * 60}
                  onComplete={() => handleComplete(activeSession.id)}
                />

                <div className="flex items-center gap-3 flex-wrap justify-center w-full max-w-md">
                  <button
                    onClick={() => handleComplete(activeSession.id)}
                    disabled={isLoading}
                    className="flex-1 basis-48 bg-ima-success text-white rounded-[12px] px-6 min-h-[52px] text-[15px] font-semibold hover:bg-ima-success focus-visible:outline-2 focus-visible:outline-ima-success focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-colors"
                  >
                    Complete session
                  </button>
                  <button
                    onClick={() => handlePause(activeSession.id)}
                    disabled={isLoading}
                    className="flex-1 basis-32 bg-white border border-ima-border text-ima-text rounded-[12px] px-6 min-h-[52px] text-[14px] font-semibold hover:border-ima-border hover:bg-ima-bg focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-colors"
                  >
                    Pause
                  </button>
                  <button
                    onClick={() => handleAbandon(activeSession.id)}
                    disabled={isLoading}
                    className="text-ima-text-secondary hover:text-ima-error hover:bg-ima-error/10 rounded-[10px] px-4 min-h-[44px] text-[11px] uppercase tracking-[0.18em] font-semibold motion-safe:transition-colors"
                  >
                    Abandon
                  </button>
                </div>

                {showAbandonConfirm && (
                  <div className="bg-ima-error/10 border border-ima-error/10 rounded-[12px] p-4 text-[13px] text-ima-error w-full max-w-sm text-center">
                    <p>Are you sure? You have significant progress on this cycle.</p>
                    <div className="flex justify-center gap-3 mt-3">
                      <button
                        onClick={() => handleAbandon(activeSession.id)}
                        className="bg-ima-error text-white rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:bg-ima-error motion-safe:transition-colors"
                      >
                        Confirm Abandon
                      </button>
                      <button
                        onClick={() => setShowAbandonConfirm(false)}
                        className="bg-white border border-ima-border text-ima-text rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:border-ima-border motion-safe:transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Paused state */}
            {isPausedView && pausedSession && (
              <div className="flex flex-col items-center gap-5 text-center">
                <div className="flex flex-col items-center gap-2">
                  <p
                    className="text-[11px] uppercase tracking-[0.22em] font-semibold text-ima-text-secondary"
                  >
                    {`Session ${String(pausedSession.cycle_number).padStart(2, "0")} \u00B7 Paused`}
                  </p>
                  <p className="text-[44px] md:text-[56px] font-bold tabular-nums tracking-[-0.02em] text-ima-text leading-none">
                    {formatPausedRemaining(
                      pausedSession.started_at,
                      pausedSession.paused_at!,
                      pausedSession.session_minutes ?? WORK_TRACKER.defaultSessionMinutes
                    )}
                  </p>
                  <p
                    className="text-[10px] uppercase tracking-[0.22em] font-medium text-ima-text-secondary mt-1"
                  >
                    Remaining
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-center w-full max-w-md">
                  <button
                    onClick={() => handleResume(pausedSession.id)}
                    disabled={isLoading}
                    className="flex-1 basis-52 bg-ima-primary text-white rounded-[12px] px-6 min-h-[52px] text-[15px] font-semibold hover:bg-ima-primary-hover focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-colors"
                  >
                    Resume session
                  </button>
                  <button
                    onClick={() => handleAbandon(pausedSession.id)}
                    disabled={isLoading}
                    className="text-ima-text-secondary hover:text-ima-error hover:bg-ima-error/10 rounded-[10px] px-4 min-h-[44px] text-[11px] uppercase tracking-[0.18em] font-semibold motion-safe:transition-colors"
                  >
                    Abandon
                  </button>
                </div>

                {showAbandonConfirm && (
                  <div className="bg-ima-error/10 border border-ima-error/10 rounded-[12px] p-4 text-[13px] text-ima-error w-full max-w-sm text-center">
                    <p>Are you sure? You have significant progress on this cycle.</p>
                    <div className="flex justify-center gap-3 mt-3">
                      <button
                        onClick={() => handleAbandon(pausedSession.id)}
                        className="bg-ima-error text-white rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:bg-ima-error motion-safe:transition-colors"
                      >
                        Confirm Abandon
                      </button>
                      <button
                        onClick={() => setShowAbandonConfirm(false)}
                        className="bg-white border border-ima-border text-ima-text rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:border-ima-border motion-safe:transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Planning mode: no plan exists yet — show PlannerUI (PLAN-01) */}
      {mode === "planning" && !isFocusedView && (
        <div
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <PlannerUI onPlanConfirmed={() => {}} />
        </div>
      )}

      {/* Executing mode: plan exists, not yet fulfilled */}
      {mode === "executing" && !isFocusedView && phase.kind !== "working" && (
        <div
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <PlannedSessionList
            plan={parsedPlan!}
            completedCount={completedCount}
            activeSession={!!activeSession}
            pausedSession={!!pausedSession}
            isLoading={isLoading}
            onStartSession={handleStartPlanned}
          />
        </div>
      )}

      {/* Motivational card — plan fulfilled, card not yet seen today */}
      {mode === "adhoc" && !hasSeenCard && !activeSession && !pausedSession && !isBreakView && !isSetupView && (
        <div
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <MotivationalCard
            onStartNextSession={handleStartNextSession}
            onDismiss={handleDismissCard}
          />
        </div>
      )}

      {/* Ad-hoc mode: plan fulfilled, card seen — render "Ready" card in editorial style */}
      {mode === "adhoc" && hasSeenCard && phase.kind === "idle" && !activeSession && !pausedSession && (
        <section
          aria-label="Ready for next session"
          className="mt-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <div className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8">
            <div className="flex flex-col items-center gap-3 text-center">
              <p
                className="text-[11px] uppercase tracking-[0.22em] font-semibold text-ima-success"
              >
                Plan complete
              </p>
              <p className="text-[24px] md:text-[28px] font-bold tracking-[-0.02em] text-ima-text leading-tight">
                {`Ready for session ${String(nextCycleNumber).padStart(2, "0")}`}
              </p>
              <p className="text-[13px] text-ima-text-secondary mb-3">
                Extra session &mdash; no daily cap
              </p>
              <button
                onClick={() => setPhase({ kind: "setup" })}
                disabled={isLoading}
                className="group w-full inline-flex items-center justify-center gap-2 rounded-[12px] bg-ima-primary text-white text-[15px] font-semibold min-h-[56px] px-4 hover:bg-ima-primary-hover focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-colors"
              >
                Set up session
                <ArrowRight
                  className="h-4 w-4 motion-safe:transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Daily report CTA — editorial row card (student only; student_diy omits dailyReportHref) */}
      {dailyReportHref && completedCount > 0 && !isFocusedView && (
        <Link
          href={dailyReportHref}
          className="group mt-[14px] flex items-center gap-4 bg-white border border-ima-border rounded-[14px] px-6 py-5 min-h-[84px] motion-safe:animate-fadeIn motion-safe:transition-[transform,border-color] hover:-translate-y-[1px] hover:border-ima-border focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
          style={{ animationDelay: "150ms" }}
        >
          <div className="w-9 h-9 rounded-[8px] bg-ima-surface-accent flex items-center justify-center shrink-0">
            <FileText className="h-[18px] w-[18px] text-ima-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p
              className="text-[11px] uppercase tracking-[0.22em] font-semibold text-ima-primary leading-none"
            >
              Daily report
            </p>
            <p className="mt-[6px] text-[15px] font-semibold text-ima-text leading-tight">
              Submit today&apos;s progress
            </p>
            <p className="mt-[4px] text-[12px] text-ima-text-secondary leading-snug">
              Share wins, roadblocks, and tomorrow&apos;s plan with your coach
            </p>
          </div>
          <ArrowRight
            className="h-4 w-4 text-ima-primary shrink-0 motion-safe:transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      )}

      {/* Session history — editorial compact list */}
      {(() => {
        const visibleSessions = [...sessions]
          .filter((s) => s.status !== "abandoned")
          .sort((a, b) => b.cycle_number - a.cycle_number);
        const DEFAULT_VISIBLE = 4;
        const displayed = showAllSessions ? visibleSessions : visibleSessions.slice(0, DEFAULT_VISIBLE);
        const hiddenCount = visibleSessions.length - DEFAULT_VISIBLE;

        if (visibleSessions.length === 0) return null;

        const completedOnly = visibleSessions.filter((s) => s.status === "completed").length;
        return (
          <section
            aria-label="Today's sessions"
            className="mt-10 motion-safe:animate-fadeIn"
            style={{ animationDelay: "200ms" }}
          >
            <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap mb-4">
              <p
                className="text-[11px] uppercase tracking-[0.22em] font-semibold text-ima-text-secondary"
              >
                Today&apos;s sessions
              </p>
              <p
                className="text-[10px] uppercase tracking-[0.18em] font-medium text-ima-text-secondary tabular-nums"
              >
                {`${visibleSessions.length} logged`}
              </p>
              {completedOnly > 0 && (
                <p
                  className="text-[10px] uppercase tracking-[0.18em] font-semibold text-ima-success tabular-nums"
                >
                  {`${completedOnly} win${completedOnly !== 1 ? "s" : ""}`}
                </p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
              {displayed.map((session) => {
                let timeInfo: string;
                let onResume: (() => void) | undefined;

                if (session.status === "completed") {
                  timeInfo = `${session.session_minutes ?? WORK_TRACKER.defaultSessionMinutes} min`;
                } else if (session.status === "in_progress") {
                  timeInfo = "In progress";
                } else if (session.status === "paused") {
                  timeInfo = `${formatPausedRemaining(
                    session.started_at,
                    session.paused_at!,
                    session.session_minutes ?? WORK_TRACKER.defaultSessionMinutes
                  )} left`;
                  onResume = () => handleResume(session.id);
                } else {
                  timeInfo = "Abandoned";
                }

                return (
                  <CycleCard
                    key={session.id}
                    cycleNumber={session.cycle_number}
                    status={session.status}
                    timeInfo={timeInfo}
                    sessionMinutes={session.session_minutes ?? WORK_TRACKER.defaultSessionMinutes}
                    onResume={onResume}
                    onEdit={
                      session.status === "completed"
                        ? (mins) => handleEditSession(session.id, mins)
                        : undefined
                    }
                    onDelete={
                      session.status === "completed"
                        ? () => handleDeleteSession(session.id)
                        : undefined
                    }
                    isBusy={isLoading}
                  />
                );
              })}
            </div>
            {hiddenCount > 0 && !showAllSessions && (
              <button
                onClick={() => setShowAllSessions(true)}
                className="mt-4 text-[11px] uppercase tracking-[0.18em] font-semibold text-ima-primary hover:text-ima-primary-hover min-h-[44px] motion-safe:transition-colors"
              >
                {`Show ${hiddenCount} more session${hiddenCount !== 1 ? "s" : ""}`}
              </button>
            )}
            {showAllSessions && hiddenCount > 0 && (
              <button
                onClick={() => setShowAllSessions(false)}
                className="mt-4 text-[11px] uppercase tracking-[0.18em] font-semibold text-ima-primary hover:text-ima-primary-hover min-h-[44px] motion-safe:transition-colors"
              >
                Show less
              </button>
            )}
          </section>
        );
      })()}
    </div>
  );
}
