"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Play, Copy, Maximize2 } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { formatHoursMinutes } from "@/lib/utils";
import {
  MINUTES_PER_DAY,
  addDays,
  blockState,
  copyBlocks,
  fetchBlocks,
  patchBlock,
  type BlockPatch,
  formatRange,
  parseDate,
  readError,
  type ScheduleBlock,
} from "@/lib/schedule";
import { TimeGrid } from "@/components/student/schedule/TimeGrid";
import { BlockEditor, type EditorTarget } from "@/components/student/schedule/BlockEditor";
import { useLocalClock } from "@/components/student/schedule/useLocalClock";
import type { Database } from "@/lib/types";

type WorkSession = Database["public"]["Tables"]["work_sessions"]["Row"];

function formatDayLabel(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  if (date === addDays(today, -1)) return "Yesterday";
  return parseDate(date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

const iconButton =
  "h-11 w-11 inline-flex items-center justify-center rounded-lg text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2";

interface DayScheduleProps {
  /** Today's work sessions — the live source for linked blocks' status. */
  sessions: WorkSession[];
  /** False while a session is running/paused or a request is in flight. */
  canStart: boolean;
  /** Starts a timer session; resolves to the new session, or null on failure. */
  onStartSession: (minutes: number) => Promise<WorkSession | null>;
  /** The full-screen calendar (week / month views). */
  calendarHref: string;
}

/**
 * The Work Tracker's day planner: today's blocks on a timeline next to the
 * timer, with "up next" and one-click start. Week/month planning lives on the
 * full calendar page (calendarHref).
 */
export function DaySchedule({ sessions, canStart, onStartSession, calendarHref }: DayScheduleProps) {
  const toastRef = useRef(useToast());
  const clock = useLocalClock();
  const [date, setDate] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const today = clock?.today ?? null;
  const now = clock?.now ?? 0;
  const viewDate = date ?? today;

  useEffect(() => {
    if (!viewDate) return;
    let cancelled = false;
    setLoaded(false);
    fetchBlocks(viewDate, viewDate)
      .then((data) => {
        if (!cancelled) setBlocks(data);
      })
      .catch((err: Error) => {
        console.error("[DaySchedule] Failed to load blocks:", err);
        toastRef.current.toast({ type: "error", title: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [viewDate]);

  const liveStatus = useMemo(() => new Map(sessions.map((s) => [s.id, s.status])), [sessions]);
  const stateOf = useCallback(
    (b: ScheduleBlock) =>
      blockState(b, today ?? "", now, b.session_id ? liveStatus.get(b.session_id) : undefined),
    [today, now, liveStatus],
  );

  const isToday = viewDate !== null && viewDate === today;

  // The block to surface: running > scheduled now > next upcoming.
  const focusBlock = useMemo(() => {
    if (!isToday) return null;
    const sorted = [...blocks].sort((a, b) => a.start_minute - b.start_minute);
    return (
      sorted.find((b) => stateOf(b) === "running") ??
      sorted.find((b) => stateOf(b) === "now") ??
      sorted.find((b) => stateOf(b) === "upcoming") ??
      null
    );
  }, [blocks, stateOf, isToday]);

  const upsert = useCallback((block: ScheduleBlock) => {
    setBlocks((prev) => {
      const without = prev.filter((b) => b.id !== block.id);
      // A block moved to another day leaves this view.
      return block.date === viewDate ? [...without, block] : without;
    });
  }, [viewDate]);

  const startBlock = useCallback(
    async (b: ScheduleBlock): Promise<boolean> => {
      setBusy(true);
      try {
        const session = await onStartSession(b.duration_minutes);
        if (!session) return false;
        // Link the block to its session so it reads as running / done. The
        // timer is already going, so a failure here is cosmetic only.
        const response = await fetch(`/api/schedule-blocks/${b.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: session.id }),
        });
        if (!response.ok) {
          console.error(
            "[DaySchedule] Failed to link block to session:",
            await readError(response, "link failed"),
          );
          return true;
        }
        upsert(((await response.json()) as { data: ScheduleBlock }).data);
        return true;
      } catch (err) {
        console.error("[DaySchedule] startBlock error:", err);
        toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onStartSession, upsert],
  );

  const copyDayBefore = useCallback(async () => {
    if (!viewDate) return;
    setBusy(true);
    try {
      const prev = addDays(viewDate, -1);
      const created = await copyBlocks(prev, prev, 1);
      if (created.length === 0) {
        toastRef.current.toast({ type: "error", title: "Nothing planned the day before to copy" });
        return;
      }
      setBlocks((p) => [...p, ...created]);
    } catch (err) {
      console.error("[DaySchedule] copyDayBefore error:", err);
      toastRef.current.toast({
        type: "error",
        title: err instanceof Error ? err.message : "Couldn't copy those blocks",
      });
    } finally {
      setBusy(false);
    }
  }, [viewDate]);

  // Drag-to-move/resize: show it immediately, roll back if the save fails.
  const moveBlock = useCallback(
    async (b: ScheduleBlock, patch: BlockPatch) => {
      setBlocks((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
      try {
        upsert(await patchBlock(b.id, patch));
      } catch (err) {
        console.error("[DaySchedule] moveBlock error:", err);
        setBlocks((prev) => prev.map((x) => (x.id === b.id ? b : x)));
        toastRef.current.toast({
          type: "error",
          title: err instanceof Error ? err.message : "Couldn't move that block",
        });
      }
    },
    [upsert],
  );

  const openCreate = useCallback(
    (day: string, minute?: number) => {
      const fallback = day === today ? Math.ceil(now / 30) * 30 : 9 * 60;
      setEditor({
        kind: "create",
        date: day,
        startMinute: Math.min(minute ?? fallback, MINUTES_PER_DAY - 30),
      });
    },
    [today, now],
  );

  if (!viewDate || !today) {
    return (
      <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-[18px] motion-safe:animate-pulse">
        <div className="h-3 w-20 rounded bg-ima-surface-light" />
        <div className="mt-[14px] h-[520px] rounded-[12px] bg-ima-surface-light" />
      </div>
    );
  }

  const plannedMinutes = blocks.reduce((sum, b) => sum + b.duration_minutes, 0);

  return (
    <section
      aria-label="Day schedule"
      className="bg-white border border-ima-border rounded-[14px] shadow-card motion-safe:animate-fadeIn"
    >
      {/* Header — day navigation, add, open full calendar */}
      <div className="flex items-center gap-2 px-[18px] pt-[16px]">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
            My day
          </p>
          <p className="mt-[6px] text-[15px] font-semibold text-ima-text truncate">
            {formatDayLabel(viewDate, today)}
            {plannedMinutes > 0 && (
              <span className="ml-2 text-[12px] font-medium text-ima-text-secondary tabular-nums">
                {`${formatHoursMinutes(plannedMinutes)} planned`}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center">
          <button type="button" onClick={() => setDate(addDays(viewDate, -1))} aria-label="Previous day" className={iconButton}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="min-h-[44px] px-2 rounded-lg text-[12px] font-semibold text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
            >
              Today
            </button>
          )}
          <button type="button" onClick={() => setDate(addDays(viewDate, 1))} aria-label="Next day" className={iconButton}>
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => openCreate(viewDate)} aria-label="Add block" className={iconButton}>
            <Plus className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          <Link
            href={`${calendarHref}?view=week&date=${viewDate}`}
            aria-label="Open full calendar — week and month views"
            title="Week & month view"
            className={iconButton}
          >
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      {/* Up next — what's coming, startable without touching the timeline */}
      {isToday && loaded && (
        <div className="mx-[18px] mt-[14px] rounded-[12px] bg-ima-surface-light px-[14px] py-[10px] min-h-[64px] flex items-center gap-3">
          {focusBlock ? (
            (() => {
              const state = stateOf(focusBlock);
              const eyebrow =
                state === "running"
                  ? "Timer running"
                  : state === "now"
                    ? "Scheduled now · not started"
                    : `Up next · in ${formatHoursMinutes(focusBlock.start_minute - now)}`;
              return (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary tabular-nums">
                      {eyebrow}
                    </p>
                    <p className="mt-[3px] text-[14px] font-semibold text-ima-text truncate">
                      {focusBlock.title}
                    </p>
                    <p className="text-[12px] text-ima-text-secondary tabular-nums">{formatRange(focusBlock)}</p>
                  </div>
                  {state !== "running" && canStart && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={busy}
                      onClick={() => startBlock(focusBlock)}
                      className="shrink-0 bg-white"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                      Start
                    </Button>
                  )}
                </>
              );
            })()
          ) : (
            <p className="text-[13px] text-ima-text-secondary">
              {blocks.length === 0
                ? "Plan today's work blocks — tap a time below to add one."
                : "Nothing else planned today."}
            </p>
          )}
        </div>
      )}

      {/* Empty day — offer to repeat the day before */}
      {loaded && blocks.length === 0 && (
        <div className="px-[18px] mt-[10px]">
          <button
            type="button"
            onClick={copyDayBefore}
            disabled={busy}
            className="inline-flex items-center gap-[6px] min-h-[44px] px-2 -ml-2 rounded-lg text-[13px] font-semibold text-ima-text-secondary hover:text-ima-primary motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-50"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copy the day before
          </button>
        </div>
      )}

      <div className="mt-[14px] border-t border-ima-border rounded-b-[14px] overflow-hidden">
        <TimeGrid
          days={[viewDate]}
          today={today}
          now={now}
          blocks={blocks}
          stateOf={stateOf}
          loading={!loaded}
          onSlot={(d, m) => openCreate(d, m)}
          onBlock={(b) => setEditor({ kind: "edit", block: b })}
          onChange={moveBlock}
          onCreateRange={(d, start, duration) =>
            setEditor({ kind: "create", date: d, startMinute: start, durationMinutes: duration })
          }
          paneClassName="h-[560px]"
        />
      </div>

      <BlockEditor
        target={editor}
        onClose={() => setEditor(null)}
        onSaved={upsert}
        onDeleted={(id) => setBlocks((prev) => prev.filter((b) => b.id !== id))}
        onStart={startBlock}
        canStart={canStart && editor?.kind === "edit" && editor.block.date === today}
      />
    </section>
  );
}
