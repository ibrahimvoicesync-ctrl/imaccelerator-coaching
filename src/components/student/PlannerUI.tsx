"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { WORK_TRACKER } from "@/lib/config";
import { formatHoursMinutes } from "@/lib/utils";
import type { PlanJson } from "@/lib/schemas/daily-plan";
import { Plus, Trash2, Clock, Coffee } from "lucide-react";

interface PlannerUIProps {
  onPlanConfirmed: () => void; // called after successful POST to trigger router.refresh()
}

type PlannerSession = {
  session_minutes: number;
  break_type: "short" | "long" | "none";
  break_minutes: number;
};

/**
 * Derives the break type for a session based on its 0-indexed position.
 * - Last session always has no break.
 * - Odd 0-indexed (even-numbered sessions 1-indexed) get long break.
 * - Even 0-indexed (odd-numbered sessions 1-indexed) get short break.
 * Examples: index 0 (1st) = short, index 1 (2nd) = long, index 2 (3rd) = short.
 */
function assignBreakType(
  sessionIndex: number,
  totalSessions: number
): "short" | "long" | "none" {
  if (sessionIndex === totalSessions - 1) return "none"; // last session has no break
  return sessionIndex % 2 === 0 ? "short" : "long";
}

/**
 * Re-derives all break types and default break_minutes for a list of sessions.
 * Must be called whenever sessions are added or removed so the last session
 * is always "none" and the previously-last session gets its proper type.
 */
function rebuildBreaks(sessions: PlannerSession[]): PlannerSession[] {
  return sessions.map((s, i) => {
    const break_type = assignBreakType(i, sessions.length);
    let break_minutes: number;
    if (break_type === "none") {
      break_minutes = 0;
    } else {
      // Preserve existing break_minutes if they are in the new break type's presets,
      // otherwise fall back to the first preset for the new type.
      const presets = WORK_TRACKER.breakOptions[break_type].presets as readonly number[];
      break_minutes = presets.includes(s.break_minutes) ? s.break_minutes : presets[0];
    }
    return { ...s, break_type, break_minutes };
  });
}

export function PlannerUI({ onPlanConfirmed }: PlannerUIProps) {
  const [plannerSessions, setPlannerSessions] = useState<PlannerSession[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const routerRef = useRef(useRouter());
  const toastRef = useRef(useToast());

  // Derived values
  const totalPlannedMinutes = plannerSessions.reduce(
    (s, p) => s + p.session_minutes,
    0
  );
  const maxMinutes = WORK_TRACKER.dailyCapHours * 60; // 480 (8h hard cap)
  const remainingMinutes = maxMinutes - totalPlannedMinutes;
  const canAddSession = remainingMinutes >= WORK_TRACKER.minSessionMinutes;
  const canConfirm = plannerSessions.length > 0;

  // Custom-duration input state
  const [customMinutes, setCustomMinutes] = useState("");

  // Only presets that fit under the remaining cap
  const availableDurations = (
    WORK_TRACKER.sessionDurationOptions as readonly number[]
  ).filter((min) => totalPlannedMinutes + min <= maxMinutes);

  const handleAddSession = useCallback(
    (duration: number) => {
      setPlannerSessions((prev) => {
        const next: PlannerSession[] = [
          ...prev,
          { session_minutes: duration, break_type: "none", break_minutes: 0 },
        ];
        return rebuildBreaks(next);
      });
    },
    []
  );

  const handleAddCustom = useCallback(() => {
    const raw = parseInt(customMinutes, 10);
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(
      WORK_TRACKER.minSessionMinutes,
      Math.min(WORK_TRACKER.maxSessionMinutes, raw)
    );
    // Don't allow exceeding the daily cap
    if (totalPlannedMinutes + clamped > maxMinutes) {
      toastRef.current.toast({
        type: "error",
        title: `That would exceed the ${WORK_TRACKER.dailyCapHours}h daily cap`,
      });
      return;
    }
    handleAddSession(clamped);
    setCustomMinutes("");
  }, [customMinutes, totalPlannedMinutes, maxMinutes, handleAddSession]);

  const handleRemoveSession = useCallback((index: number) => {
    setPlannerSessions((prev) => {
      const next = prev.filter((_, i) => i !== index);
      return rebuildBreaks(next);
    });
  }, []);

  const handleBreakMinutesChange = useCallback(
    (index: number, minutes: number) => {
      setPlannerSessions((prev) =>
        prev.map((s, i) => {
          if (i !== index) return s;
          if (s.break_type === "none") return s;
          const presets = WORK_TRACKER.breakOptions[s.break_type]
            .presets as readonly number[];
          if (!presets.includes(minutes)) return s;
          return { ...s, break_minutes: minutes };
        })
      );
    },
    []
  );

  const handleConfirmPlan = useCallback(async () => {
    setIsSubmitting(true);
    try {
      const plan_json: PlanJson = {
        version: 1,
        total_work_minutes: totalPlannedMinutes,
        sessions: plannerSessions.map((s) => ({
          session_minutes: s.session_minutes,
          break_type: s.break_type,
          break_minutes: s.break_minutes,
        })),
      };
      const response = await fetch("/api/daily-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_json }),
      });
      if (!response.ok) {
        const err = await response.json().catch((parseErr) => {
          console.error("[PlannerUI] Failed to parse error response:", parseErr);
          return { error: null };
        });
        console.error("[PlannerUI] Failed to create plan:", err);
        toastRef.current.toast({
          type: "error",
          title: err.error || "Failed to create plan",
        });
        return;
      }
      toastRef.current.toast({
        type: "success",
        title: "Plan confirmed! Let's get to work.",
      });
      routerRef.current.refresh();
      onPlanConfirmed();
    } catch (err) {
      console.error("[PlannerUI] handleConfirmPlan error:", err);
      toastRef.current.toast({
        type: "error",
        title: "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [totalPlannedMinutes, plannerSessions, onPlanConfirmed]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-ima-text mb-1">Plan Your Day</h2>
        <p className="text-sm text-ima-text-secondary">
          Add sessions up to {WORK_TRACKER.dailyCapHours}h of work time
        </p>
      </div>

      {/* Running total progress bar */}
      <div>
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm font-medium text-ima-text">
            {formatHoursMinutes(totalPlannedMinutes)} /{" "}
            {WORK_TRACKER.dailyCapHours}h planned
          </span>
          <span className="text-xs text-ima-text-secondary">
            {plannerSessions.length} session
            {plannerSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div
          className="bg-ima-bg rounded-full h-3 overflow-hidden"
          role="progressbar"
          aria-valuenow={totalPlannedMinutes}
          aria-valuemin={0}
          aria-valuemax={maxMinutes}
          aria-label={`Planned time: ${formatHoursMinutes(totalPlannedMinutes)} of ${WORK_TRACKER.dailyCapHours}h`}
        >
          <div
            className="bg-ima-primary h-full rounded-full motion-safe:transition-all duration-500"
            style={{
              width: `${Math.min(100, Math.round((totalPlannedMinutes / maxMinutes) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* Session list */}
      {plannerSessions.length > 0 && (
        <div className="flex flex-col gap-3">
          {plannerSessions.map((session, index) => (
            <div
              key={index}
              className="bg-ima-surface border border-ima-border rounded-xl p-4 flex flex-col gap-3"
            >
              {/* Session header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock
                    className="w-4 h-4 text-ima-text-secondary"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold text-ima-text">
                    Session {index + 1}
                  </span>
                  <span className="text-xs text-ima-text-secondary bg-ima-bg px-2 py-0.5 rounded-full">
                    {session.session_minutes} min
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveSession(index)}
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center text-ima-error hover:bg-ima-error/10 rounded-lg motion-safe:transition-colors"
                  aria-label={`Remove session ${index + 1}`}
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>

              {/* Break section */}
              {session.break_type === "none" ? (
                <div className="flex items-center gap-2 text-sm text-ima-text-secondary">
                  <Coffee className="w-4 h-4" aria-hidden="true" />
                  <span>No break (last session)</span>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Coffee
                      className="w-4 h-4 text-ima-text-secondary"
                      aria-hidden="true"
                    />
                    <span className="text-sm font-medium text-ima-text">
                      {WORK_TRACKER.breakOptions[session.break_type].label}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {(
                      WORK_TRACKER.breakOptions[session.break_type]
                        .presets as readonly number[]
                    ).map((min) => (
                      <button
                        key={min}
                        onClick={() => handleBreakMinutesChange(index, min)}
                        className={`min-h-[44px] min-w-[44px] px-3 rounded-lg text-sm font-medium motion-safe:transition-colors ${
                          session.break_minutes === min
                            ? "bg-ima-primary/15 text-ima-primary border border-ima-primary"
                            : "bg-ima-bg border border-ima-border text-ima-text-secondary hover:bg-ima-surface"
                        }`}
                        aria-pressed={session.break_minutes === min}
                        aria-label={`${min} minute break for session ${index + 1}`}
                      >
                        {min}m
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Session section */}
      {canAddSession && (
        <div className="bg-ima-surface border border-ima-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Plus className="w-4 h-4 text-ima-text-secondary" aria-hidden="true" />
            <span className="text-sm font-medium text-ima-text">Add Session</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {availableDurations.map((min) => (
              <button
                key={min}
                onClick={() => handleAddSession(min)}
                className="min-h-[44px] min-w-[44px] px-4 rounded-lg font-medium bg-ima-bg border border-ima-border text-ima-text hover:bg-ima-primary hover:text-white hover:border-ima-primary motion-safe:transition-colors"
                aria-label={`Add ${min} minute session`}
              >
                {min} min
              </button>
            ))}
          </div>
          {/* Custom duration */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <label htmlFor="planner-custom-minutes" className="sr-only">
              Custom session duration in minutes
            </label>
            <input
              id="planner-custom-minutes"
              type="number"
              inputMode="numeric"
              min={WORK_TRACKER.minSessionMinutes}
              max={WORK_TRACKER.maxSessionMinutes}
              value={customMinutes}
              onChange={(e) => setCustomMinutes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCustom();
                }
              }}
              placeholder="Custom min"
              className="min-h-[44px] w-[120px] px-3 rounded-lg font-medium tabular-nums bg-ima-bg border border-ima-border text-ima-text focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-1"
            />
            <button
              onClick={handleAddCustom}
              disabled={!customMinutes}
              className="min-h-[44px] px-4 rounded-lg font-medium bg-ima-bg border border-ima-border text-ima-text hover:bg-ima-primary hover:text-white hover:border-ima-primary disabled:opacity-50 motion-safe:transition-colors"
              aria-label="Add custom-length session"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {/* Confirm button */}
      <button
        onClick={handleConfirmPlan}
        disabled={!canConfirm || isSubmitting}
        className="w-full bg-ima-primary text-white rounded-xl min-h-[56px] text-lg font-semibold hover:bg-ima-primary-hover disabled:opacity-50 motion-safe:transition-colors"
        aria-label={`Confirm plan: ${formatHoursMinutes(totalPlannedMinutes)}`}
      >
        {isSubmitting
          ? "Confirming..."
          : `Confirm Plan (${formatHoursMinutes(totalPlannedMinutes)})`}
      </button>
    </div>
  );
}
