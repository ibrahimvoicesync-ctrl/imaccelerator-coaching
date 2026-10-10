"use client";

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, ArrowRight, Play, Pencil, Check, Timer, Mail, CalendarDays, type LucideIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { WorkTimer } from "@/components/student/WorkTimer";
import { CycleCard } from "@/components/student/CycleCard";
import { DaySchedule } from "@/components/student/DaySchedule";
import { WORK_TRACKER } from "@/lib/config";
import { getToday, formatPausedRemaining, formatHoursMinutes } from "@/lib/utils";
import type { Database } from "@/lib/types";

type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];

// The only choices a student ever needs. Default is one hour; the edit
// affordance lets them drop to 30 minutes or stretch to 1h30 / two hours.
// 90 exists for students who run two back-to-back 1.5-hour deep-work blocks.
const DURATION_PRESETS = [30, 60, 90, 120] as const;
const DEFAULT_MINUTES = 60;

/** 60 -> "1-hour", 120 -> "2-hour", 30 -> "30-minute". */
function durationPhrase(min: number): string {
  if (min % 60 === 0) {
    const h = min / 60;
    return `${h}-hour`;
  }
  return `${min}-minute`;
}

/** 60 -> "1 hour", 90 -> "1 hour 30 min", 120 -> "2 hours", 30 -> "30 min". */
function presetLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  const hours = h === 1 ? "1 hour" : `${h} hours`;
  return m === 0 ? hours : `${hours} ${m} min`;
}

interface WorkTrackerClientProps {
  initialSessions: WorkSession[];
  dailyReportHref?: string;
  /** Full calendar page (week / month views), opened from the day planner. */
  calendarHref: string;
  /** Optional quick email log card, shown under the timer. */
  emailLog?: ReactNode;
}

export function WorkTrackerClient({
  initialSessions,
  dailyReportHref,
  calendarHref,
  emailLog,
}: WorkTrackerClientProps) {
  const routerRef = useRef(useRouter());
  const router = routerRef.current;
  const toastRef = useRef(useToast());

  const [sessions, setSessions] = useState<WorkSession[]>(initialSessions);
  const [isLoading, setIsLoading] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);

  // One thing on screen at a time: the timer, the email counters, or the day
  // plan. The dashboard's "Log emails" link lands on #log-emails.
  const [view, setView] = useState<TrackerView>("timer");
  useEffect(() => {
    if (emailLog && window.location.hash === "#log-emails") setView("emails");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [selectedMinutes, setSelectedMinutes] = useState<number>(DEFAULT_MINUTES);
  const [editingDuration, setEditingDuration] = useState(false);

  // Manual logging — record work done away from the live timer (outreach,
  // calls, study). The real job rarely happens with this tab open.
  const [showManualLog, setShowManualLog] = useState(false);
  const [manualMinutes, setManualMinutes] = useState<number>(DEFAULT_MINUTES);

  // Keep sessions in sync when server re-renders with fresh initialSessions
  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions]);

  // Stale session auto-abandon on mount
  useEffect(() => {
    const today = getToday();
    const staleSessions = initialSessions.filter(
      (s) =>
        (s.status === "in_progress" || s.status === "paused") && s.date < today,
    );
    if (staleSessions.length === 0) return;

    const abandonStale = async () => {
      const results = await Promise.all(
        staleSessions.map((s) =>
          fetch(`/api/work-sessions/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "abandoned" }),
          }),
        ),
      );
      if (!results.every((r) => r.ok)) {
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
  const nextCycleNumber =
    sessions
      .filter((s) => s.status !== "abandoned")
      .reduce((max, s) => Math.max(max, s.cycle_number), 0) + 1;
  const totalMinutesWorked = sessions
    .filter((s) => s.status === "completed")
    .reduce((sum, s) => sum + s.duration_minutes, 0);
  const dailyGoalMinutes = WORK_TRACKER.dailyGoalHours * 60;
  const progressPercent = Math.min(
    100,
    Math.round((totalMinutesWorked / dailyGoalMinutes) * 100),
  );
  const goalMet = progressPercent >= 100;

  const isFocusedView = Boolean(activeSession) || Boolean(pausedSession);

  // --- Mutation handlers ---

  /** Start a timer session. Resolves to the new session, or null on failure. */
  const startSession = useCallback(async (minutes: number): Promise<WorkSession | null> => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/work-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: getToday(),
          cycle_number: nextCycleNumber,
          session_minutes: minutes,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        if (response.status === 409) {
          toastRef.current.toast({
            type: "error",
            title: "Your timer is already running. Finish or delete it first.",
          });
          router.refresh();
          return null;
        }
        console.error("[WorkTrackerClient] Failed to start session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't start the timer — please try again" });
        return null;
      }
      const newSession: WorkSession = await response.json();
      setSessions((prev) => [...prev, newSession]);
      setEditingDuration(false);
      router.refresh();
      return newSession;
    } catch (err) {
      console.error("[WorkTrackerClient] startSession error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [nextCycleNumber, router]);

  const handleStart = useCallback(() => {
    startSession(selectedMinutes);
  }, [startSession, selectedMinutes]);

  const handleComplete = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        if (typeof err.error === "string" && err.error.includes("Cannot transition")) {
          router.refresh();
          return;
        }
        console.error("[WorkTrackerClient] Failed to complete session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't save — please try again" });
        return;
      }
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: "completed" } : s)),
      );
      toastRef.current.toast({ type: "success", title: "Done — nice work!" });
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleComplete error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const handlePause = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/work-sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paused" }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        console.error("[WorkTrackerClient] Failed to pause session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't pause — please try again" });
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
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        console.error("[WorkTrackerClient] Failed to resume session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't restart the timer — please try again" });
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
    const target = sessions.find((s) => s.id === sessionId);
    if (!target) return;

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
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        console.error("[WorkTrackerClient] Failed to abandon session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't delete — please try again" });
        return;
      }
      setShowAbandonConfirm(false);
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
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        console.error("[WorkTrackerClient] Failed to edit session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't save the change — please try again" });
        return;
      }
      const updated = await response.json();
      setSessions((prev) => prev.map((s) => (s.id === sessionId ? updated : s)));
      toastRef.current.toast({ type: "success", title: "Saved" });
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
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        console.error("[WorkTrackerClient] Failed to delete session:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't delete — please try again" });
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

  const handleLogManual = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/work-sessions/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: getToday(), duration_minutes: manualMinutes }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => {
          console.error("[WorkTrackerClient] Failed to parse error response:", parseErr);
          return { error: null };
        });
        console.error("[WorkTrackerClient] Failed to log manual work:", err);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't log that work" });
        return;
      }
      const newSession = await response.json();
      setSessions((prev) => [...prev, newSession]);
      setShowManualLog(false);
      toastRef.current.toast({
        type: "success",
        title: `Logged ${formatHoursMinutes(manualMinutes)} of work`,
      });
      router.refresh();
    } catch (err) {
      console.error("[WorkTrackerClient] handleLogManual error:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [manualMinutes, router]);

  // --- Render ---

  return (
    <div className="mx-auto max-w-[880px]">
      <TrackerTabs
        view={view}
        onChange={setView}
        showEmails={Boolean(emailLog)}
        timerRunning={Boolean(activeSession)}
      />

      {/* Kept mounted (just hidden) so counts and unsaved taps survive tab switches. */}
      {emailLog && (
        <div
          id="tracker-panel-emails"
          role="tabpanel"
          aria-labelledby="tracker-tab-emails"
          hidden={view !== "emails"}
          className="mt-5"
        >
          {emailLog}
        </div>
      )}

      {view === "day" && (
        <div id="tracker-panel-day" role="tabpanel" aria-labelledby="tracker-tab-day" className="mt-5">
          <DaySchedule
            sessions={sessions}
            canStart={!isFocusedView && !isLoading}
            onStartSession={async (minutes) => {
              const started = await startSession(minutes);
              if (started) setView("timer");
              return started;
            }}
            calendarHref={calendarHref}
          />
        </div>
      )}

      <div
        id="tracker-panel-timer"
        role="tabpanel"
        aria-labelledby="tracker-tab-timer"
        hidden={view !== "timer"}
        className="mt-5 min-w-0"
      >
        {/* Active timer */}
        {activeSession && (
          <section aria-label="Current session" className="motion-safe:animate-fadeIn">
            <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-10">
              <div className="flex flex-col items-center gap-6">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-primary">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-ima-primary opacity-60 motion-safe:animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-ima-primary" />
                  </span>
                  Working…
                </div>

                <WorkTimer
                  sessionId={activeSession.id}
                  startedAt={activeSession.started_at}
                  cycleNumber={activeSession.cycle_number}
                  totalSeconds={(activeSession.session_minutes ?? DEFAULT_MINUTES) * 60}
                  onComplete={() => handleComplete(activeSession.id)}
                />

                <div className="flex items-center gap-3 flex-wrap justify-center w-full max-w-md">
                  <button
                    onClick={() => handleComplete(activeSession.id)}
                    disabled={isLoading}
                    className="flex-1 basis-48 bg-ima-success text-white rounded-[12px] px-6 min-h-[52px] text-[15px] font-semibold hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ima-success focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-[opacity,transform] motion-safe:duration-150 ease-expo-out"
                  >
                    I&apos;m done
                  </button>
                  <button
                    onClick={() => handlePause(activeSession.id)}
                    disabled={isLoading}
                    className="flex-1 basis-32 bg-white border border-ima-border text-ima-text rounded-[12px] px-6 min-h-[52px] text-[14px] font-semibold hover:bg-ima-bg active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 ease-expo-out"
                  >
                    Pause
                  </button>
                  <button
                    onClick={() => handleAbandon(activeSession.id)}
                    disabled={isLoading}
                    className="text-ima-text-secondary hover:text-ima-text hover:bg-ima-surface-light active:scale-[0.98] rounded-[10px] px-4 min-h-[44px] text-[11px] uppercase tracking-[0.08em] font-semibold motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 ease-expo-out"
                  >
                    Delete
                  </button>
                </div>

                {showAbandonConfirm && (
                  <div className="bg-ima-surface-light border border-ima-border rounded-[12px] p-4 text-[13px] text-ima-text-secondary w-full max-w-sm text-center">
                    <p>Delete this timer? This time won&apos;t be counted — that&apos;s okay, things come up.</p>
                    <div className="flex justify-center gap-3 mt-3">
                      <button
                        onClick={() => handleAbandon(activeSession.id)}
                        className="bg-ima-text text-white rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:opacity-90 active:scale-[0.98] motion-safe:transition-[opacity,transform] motion-safe:duration-150 ease-expo-out"
                      >
                        Yes, delete it
                      </button>
                      <button
                        onClick={() => setShowAbandonConfirm(false)}
                        className="bg-white border border-ima-border text-ima-text rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:bg-ima-bg active:scale-[0.98] motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 ease-expo-out"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Paused state */}
        {pausedSession && !activeSession && (
          <section aria-label="Paused session" className="motion-safe:animate-fadeIn">
            <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-10">
              <div className="flex flex-col items-center gap-5 text-center">
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary">
                  Paused
                </p>
                <p className="text-[44px] md:text-[56px] font-bold tabular-nums tracking-[-0.02em] text-ima-text leading-none">
                  {formatPausedRemaining(
                    pausedSession.started_at,
                    pausedSession.paused_at!,
                    pausedSession.session_minutes ?? DEFAULT_MINUTES,
                  )}
                </p>
                <p className="text-[10px] uppercase tracking-[0.08em] font-medium text-ima-text-secondary">
                  Remaining
                </p>
                <div className="flex items-center gap-3 flex-wrap justify-center w-full max-w-md">
                  <button
                    onClick={() => handleResume(pausedSession.id)}
                    disabled={isLoading}
                    className="flex-1 basis-52 bg-ima-primary text-white rounded-[12px] px-6 min-h-[52px] text-[15px] font-semibold hover:bg-ima-primary-hover active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 ease-expo-out"
                  >
                    Keep going
                  </button>
                  <button
                    onClick={() => handleAbandon(pausedSession.id)}
                    disabled={isLoading}
                    className="text-ima-text-secondary hover:text-ima-text hover:bg-ima-surface-light active:scale-[0.98] rounded-[10px] px-4 min-h-[44px] text-[11px] uppercase tracking-[0.08em] font-semibold motion-safe:transition-[background-color,color,transform] motion-safe:duration-150 ease-expo-out"
                  >
                    Delete
                  </button>
                </div>

                {showAbandonConfirm && (
                  <div className="bg-ima-surface-light border border-ima-border rounded-[12px] p-4 text-[13px] text-ima-text-secondary w-full max-w-sm text-center">
                    <p>Delete this timer? This time won&apos;t be counted — that&apos;s okay, things come up.</p>
                    <div className="flex justify-center gap-3 mt-3">
                      <button
                        onClick={() => handleAbandon(pausedSession.id)}
                        className="bg-ima-text text-white rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:opacity-90 active:scale-[0.98] motion-safe:transition-[opacity,transform] motion-safe:duration-150 ease-expo-out"
                      >
                        Yes, delete it
                      </button>
                      <button
                        onClick={() => setShowAbandonConfirm(false)}
                        className="bg-white border border-ima-border text-ima-text rounded-[10px] px-4 min-h-[44px] text-[13px] font-semibold hover:bg-ima-bg active:scale-[0.98] motion-safe:transition-[background-color,border-color,color,transform] motion-safe:duration-150 ease-expo-out"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Idle — the one big start button + duration edit + manual log */}
        {!isFocusedView && (
          <section aria-label="Start a work session" className="motion-safe:animate-fadeIn">
            <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-10">
              {/* Compact today readout */}
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary">
                  Today
                </p>
                <p className="text-[12px] font-semibold tabular-nums text-ima-text-secondary">
                  <span className={goalMet ? "text-ima-success" : "text-ima-text"}>
                    {formatHoursMinutes(totalMinutesWorked)}
                  </span>
                  {` / ${WORK_TRACKER.dailyGoalHours}h`}
                </p>
              </div>
              <div
                className="mt-3 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
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

              {/* Focus stage — gives the one CTA real presence */}
              <div className="mt-8 rounded-[18px] bg-ima-surface-accent/70 p-6 md:p-8 text-center">
                <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-ima-primary">
                  Ready when you are
                </p>
                <p className="mt-2 text-[15px] text-ima-text-secondary">
                  Press the big button to start. We&apos;ll let you know when time&apos;s up.
                </p>

                {/* The one button */}
                <button
                  onClick={handleStart}
                  disabled={isLoading}
                  className="group mt-6 w-full inline-flex items-center justify-center gap-3 rounded-full bg-ima-primary text-white text-[17px] md:text-[19px] font-bold tracking-tight min-h-[72px] md:min-h-[80px] px-6 shadow-[0_14px_34px_-12px_rgba(37,99,235,0.6)] motion-safe:transition-all motion-safe:duration-200 ease-expo-out hover:bg-ima-primary-hover hover:shadow-[0_20px_44px_-14px_rgba(37,99,235,0.78)] hover:-translate-y-[2px] active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-60"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <Play className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
                  </span>
                  {isLoading ? "Starting…" : "Start working"}
                </button>

                {/* Change duration — quiet affordance, expands to the presets */}
                <div className="mt-4 flex flex-col items-center">
                  <button
                    type="button"
                    onClick={() => setEditingDuration((v) => !v)}
                    aria-expanded={editingDuration}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-[10px] text-[13px] font-medium text-ima-text-secondary hover:text-ima-primary motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      <span className="text-ima-text">{durationPhrase(selectedMinutes)} timer</span>
                      {" · Change"}
                    </span>
                  </button>

                  {editingDuration && (
                    <div
                      className="mt-2 grid grid-cols-2 sm:inline-flex rounded-[12px] border border-ima-border bg-white p-1 motion-safe:animate-fadeIn"
                      role="group"
                      aria-label="How long to work"
                    >
                      {DURATION_PRESETS.map((min) => (
                        <button
                          key={min}
                          type="button"
                          onClick={() => setSelectedMinutes(min)}
                          aria-pressed={selectedMinutes === min}
                          className={`min-h-[44px] px-4 rounded-[9px] text-[14px] whitespace-nowrap font-semibold tabular-nums motion-safe:transition-colors ${
                            selectedMinutes === min
                              ? "bg-ima-primary text-white"
                              : "text-ima-text-secondary hover:text-ima-text"
                          }`}
                        >
                          {presetLabel(min)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Log work done away from the timer */}
              <div className="mt-6 pt-6 border-t border-ima-border">
                {!showManualLog ? (
                  <button
                    type="button"
                    onClick={() => setShowManualLog(true)}
                    className="mx-auto block min-h-[44px] text-[13px] font-semibold text-ima-text-secondary hover:text-ima-primary motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md"
                  >
                    Log work I already did
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary">
                      How long did you work?
                    </p>
                    <div className="grid grid-cols-2 sm:inline-flex rounded-[12px] border border-ima-border p-1" role="group" aria-label="Logged duration">
                      {DURATION_PRESETS.map((min) => (
                        <button
                          key={min}
                          type="button"
                          onClick={() => setManualMinutes(min)}
                          aria-pressed={manualMinutes === min}
                          className={`min-h-[44px] px-4 rounded-[9px] text-[14px] whitespace-nowrap font-semibold tabular-nums motion-safe:transition-colors ${
                            manualMinutes === min
                              ? "bg-ima-primary text-white"
                              : "text-ima-text-secondary hover:text-ima-text"
                          }`}
                        >
                          {presetLabel(min)}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleLogManual}
                        disabled={isLoading}
                        className="inline-flex items-center gap-2 rounded-[12px] bg-ima-primary text-white text-[14px] font-semibold min-h-[48px] px-5 hover:bg-ima-primary-hover focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50 motion-safe:transition-colors"
                      >
                        {isLoading ? "Logging…" : `Log ${formatHoursMinutes(manualMinutes)}`}
                        {!isLoading && <Check className="h-4 w-4" aria-hidden="true" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowManualLog(false)}
                        className="min-h-[48px] px-4 rounded-[12px] text-[13px] font-semibold text-ima-text-secondary hover:bg-ima-surface-light motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Daily report CTA — appears once there's something to report */}
        {dailyReportHref && completedCount > 0 && !isFocusedView && (
          <Link
            href={dailyReportHref}
            className="group mt-[14px] flex items-center gap-4 bg-white border border-ima-border rounded-[14px] shadow-card px-6 py-5 min-h-[84px] motion-safe:animate-fadeIn motion-safe:transition-[transform,border-color] hover:-translate-y-[1px] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
            style={{ animationDelay: "100ms" }}
          >
            <div className="w-9 h-9 rounded-[8px] bg-ima-surface-accent flex items-center justify-center shrink-0">
              <FileText className="h-[18px] w-[18px] text-ima-primary" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-primary leading-none">
                Daily report
              </p>
              <p className="mt-[6px] text-[15px] font-semibold text-ima-text leading-tight">
                Send today&apos;s report
              </p>
              <p className="mt-[4px] text-[12px] text-ima-text-secondary leading-snug">
                Tell your coach how today went — about 2 minutes
              </p>
            </div>
            <ArrowRight
              className="h-4 w-4 text-ima-primary shrink-0 motion-safe:transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        )}

        {/* Today's sessions — compact, read-only feedback */}
        {(() => {
          const visibleSessions = [...sessions]
            .filter((s) => s.status === "completed" || s.status === "paused")
            .sort((a, b) => b.cycle_number - a.cycle_number);

          if (visibleSessions.length === 0) return null;

          const completedOnly = visibleSessions.filter((s) => s.status === "completed").length;
          return (
            <section
              aria-label="Today's sessions"
              className="mt-10 motion-safe:animate-fadeIn"
              style={{ animationDelay: "150ms" }}
            >
              <div className="flex items-baseline gap-x-3 gap-y-1 flex-wrap mb-4">
                <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary">
                  Work done today
                </p>
                {completedOnly > 0 && (
                  <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-success tabular-nums">
                    {`${completedOnly} done`}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[14px]">
                {visibleSessions.map((session) => {
                  let timeInfo: string;
                  let onResume: (() => void) | undefined;

                  if (session.status === "completed") {
                    timeInfo = `${session.session_minutes ?? DEFAULT_MINUTES} min`;
                  } else {
                    timeInfo = `${formatPausedRemaining(
                      session.started_at,
                      session.paused_at!,
                      session.session_minutes ?? DEFAULT_MINUTES,
                    )} left`;
                    onResume = () => handleResume(session.id);
                  }

                  return (
                    <CycleCard
                      key={session.id}
                      cycleNumber={session.cycle_number}
                      status={session.status}
                      timeInfo={timeInfo}
                      sessionMinutes={session.session_minutes ?? DEFAULT_MINUTES}
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
            </section>
          );
        })()}
      </div>
    </div>
  );
}

type TrackerView = "timer" | "emails" | "day";

/**
 * The three big choices at the top of the Work Tracker. Icon + plain word,
 * thumb-sized, so it reads at a glance for students who aren't power users.
 * The Timer tab shows a live dot while a session is running elsewhere.
 */
function TrackerTabs({
  view,
  onChange,
  showEmails,
  timerRunning,
}: {
  view: TrackerView;
  onChange: (v: TrackerView) => void;
  showEmails: boolean;
  timerRunning: boolean;
}) {
  const tabs: { value: TrackerView; label: string; icon: LucideIcon }[] = [
    { value: "timer", label: "Timer", icon: Timer },
    ...(showEmails ? [{ value: "emails" as const, label: "Emails", icon: Mail }] : []),
    { value: "day", label: "My day", icon: CalendarDays },
  ];

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = tabs.findIndex((t) => t.value === view);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    onChange(next.value);
    document.getElementById(`tracker-tab-${next.value}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Work tracker"
      onKeyDown={onKeyDown}
      className={`grid gap-[10px] ${tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
    >
      {tabs.map((t) => {
        const active = t.value === view;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            id={`tracker-tab-${t.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={`tracker-panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            className={`relative flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 min-h-[64px] rounded-[14px] border text-[15px] font-semibold motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 ${
              active
                ? "bg-ima-primary border-ima-primary text-white shadow-card"
                : "bg-white border-ima-border text-ima-text-secondary hover:text-ima-text shadow-card"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            {t.label}
            {t.value === "timer" && timerRunning && !active && (
              <span className="absolute top-2.5 right-2.5 flex h-2 w-2" aria-label="Timer running">
                <span className="absolute inline-flex h-full w-full rounded-full bg-ima-primary opacity-60 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-ima-primary" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
