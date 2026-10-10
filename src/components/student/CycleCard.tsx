"use client";

import { useState } from "react";
import { Check, Play, Pause, X, Circle, Pencil, Trash2 } from "lucide-react";
import { WORK_TRACKER } from "@/lib/config";

interface CycleCardProps {
  cycleNumber: number;
  status: "completed" | "in_progress" | "paused" | "abandoned" | "pending";
  timeInfo: string;
  sessionMinutes?: number;
  onResume?: () => void;
  /** Save a corrected duration (minutes) for a completed entry. */
  onEdit?: (minutes: number) => void;
  /** Delete a completed entry outright. */
  onDelete?: () => void;
  /** Disables edit controls while a mutation is in flight. */
  isBusy?: boolean;
}


export function CycleCard({
  cycleNumber,
  status,
  timeInfo,
  sessionMinutes,
  onResume,
  onEdit,
  onDelete,
  isBusy = false,
}: CycleCardProps) {
  const isCompleted = status === "completed";
  const isInProgress = status === "in_progress";
  const isPaused = status === "paused";
  const editable = isCompleted && (!!onEdit || !!onDelete);

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [draftMinutes, setDraftMinutes] = useState(
    String(sessionMinutes ?? WORK_TRACKER.defaultSessionMinutes)
  );

  // Editorial icon tile — matches dashboard's w-9 h-9 rounded-[8px] tinted badge
  const iconTile = isCompleted
    ? { bg: "bg-ima-success/10", color: "text-ima-success" }
    : isInProgress
    ? { bg: "bg-ima-surface-accent", color: "text-ima-primary" }
    : isPaused
    ? { bg: "bg-ima-warning/10", color: "text-ima-warning" }
    : { bg: "bg-ima-surface-light", color: "text-ima-text-secondary" };

  function openEditor() {
    setDraftMinutes(String(sessionMinutes ?? WORK_TRACKER.defaultSessionMinutes));
    setConfirmingDelete(false);
    setEditing(true);
  }

  function saveEdit() {
    const raw = parseInt(draftMinutes, 10);
    if (Number.isNaN(raw)) return;
    const clamped = Math.max(
      WORK_TRACKER.minSessionMinutes,
      Math.min(WORK_TRACKER.maxSessionMinutes, raw)
    );
    onEdit?.(clamped);
    setEditing(false);
  }

  return (
    <div className="bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px] motion-safe:transition-[transform,border-color] hover:-translate-y-[1px] hover:border-ima-border">
      <div className="flex items-center gap-4">
        <div
          className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${iconTile.bg}`}
          aria-hidden="true"
        >
          {isCompleted && <Check className={`h-[18px] w-[18px] ${iconTile.color}`} strokeWidth={2.5} aria-hidden="true" />}
          {isInProgress && <Play className={`h-[16px] w-[16px] ${iconTile.color}`} strokeWidth={2.5} fill="currentColor" aria-hidden="true" />}
          {isPaused && <Pause className={`h-[16px] w-[16px] ${iconTile.color}`} strokeWidth={2.5} aria-hidden="true" />}
          {status === "abandoned" && <X className={`h-[16px] w-[16px] ${iconTile.color}`} strokeWidth={2.5} aria-hidden="true" />}
          {status === "pending" && <Circle className={`h-[16px] w-[16px] ${iconTile.color}`} strokeWidth={2} aria-hidden="true" />}
        </div>

        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase leading-none"
          >
            {`Work time ${cycleNumber}`}
          </p>
          <p className="mt-[6px] text-[15px] font-semibold text-ima-text tabular-nums leading-tight">
            {sessionMinutes ? `${sessionMinutes} min` : "—"}
          </p>
          {!isCompleted && (
            <p className="mt-[2px] text-[12px] text-ima-text-secondary tabular-nums leading-tight">{timeInfo}</p>
          )}
        </div>

        {isPaused && onResume && (
          <button
            onClick={onResume}
            className="shrink-0 min-h-[44px] px-3 text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-primary hover:bg-ima-surface-accent rounded-[8px] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 motion-safe:transition-colors"
            aria-label={`Keep going with work time ${cycleNumber}`}
          >
            Keep going
          </button>
        )}

        {editable && !editing && (
          <button
            onClick={openEditor}
            disabled={isBusy}
            className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center text-ima-text-secondary hover:text-ima-primary hover:bg-ima-surface-accent rounded-[8px] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 motion-safe:transition-colors"
            aria-label={`Change work time ${cycleNumber}`}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Inline editor — adjust the logged duration or delete the entry */}
      {editable && editing && (
        <div className="mt-3 pt-3 border-t border-ima-border">
          {!confirmingDelete ? (
            <div className="flex items-center gap-2 flex-wrap">
              <label htmlFor={`edit-minutes-${cycleNumber}`} className="sr-only">
                Corrected duration in minutes for session {cycleNumber}
              </label>
              <input
                id={`edit-minutes-${cycleNumber}`}
                type="number"
                inputMode="numeric"
                min={WORK_TRACKER.minSessionMinutes}
                max={WORK_TRACKER.maxSessionMinutes}
                value={draftMinutes}
                onChange={(e) => setDraftMinutes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
                className="min-h-[44px] w-[84px] px-3 text-center rounded-[10px] text-[15px] font-semibold tabular-nums bg-white border border-ima-border text-ima-text focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-1"
              />
              <span className="text-[13px] text-ima-text-secondary">min</span>
              <button
                onClick={saveEdit}
                disabled={isBusy || !draftMinutes}
                className="min-h-[44px] px-4 rounded-[10px] text-[13px] font-semibold bg-ima-primary text-white hover:bg-ima-primary-hover disabled:opacity-50 motion-safe:transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                disabled={isBusy}
                className="min-h-[44px] px-3 rounded-[10px] text-[13px] font-semibold text-ima-text-secondary hover:bg-ima-bg disabled:opacity-50 motion-safe:transition-colors"
              >
                Cancel
              </button>
              {onDelete && (
                <button
                  onClick={() => setConfirmingDelete(true)}
                  disabled={isBusy}
                  className="ml-auto min-h-[44px] min-w-[44px] flex items-center justify-center text-ima-text-secondary hover:text-ima-error hover:bg-ima-error/10 rounded-[8px] disabled:opacity-50 motion-safe:transition-colors"
                  aria-label={`Delete work time ${cycleNumber}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-[13px] text-ima-error flex-1 min-w-[140px]">
                Delete this entry? This can&apos;t be undone.
              </p>
              <button
                onClick={() => {
                  onDelete?.();
                  setConfirmingDelete(false);
                  setEditing(false);
                }}
                disabled={isBusy}
                className="min-h-[44px] px-4 rounded-[10px] text-[13px] font-semibold bg-ima-error text-white hover:bg-ima-error disabled:opacity-50 motion-safe:transition-colors"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={isBusy}
                className="min-h-[44px] px-3 rounded-[10px] text-[13px] font-semibold text-ima-text-secondary hover:bg-ima-bg disabled:opacity-50 motion-safe:transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
