"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import { WORK_TRACKER } from "@/lib/config";
import {
  MINUTES_PER_DAY,
  formatClock,
  formatHourLabel,
  formatRange,
  layoutColumns,
  parseDate,
  type BlockPatch,
  type BlockState,
  type ScheduleBlock,
} from "@/lib/schedule";

// Google-Calendar-style time grid: 48px per hour, scrolls inside a fixed pane.
// Click an empty slot to propose a block (snapped to 30 min); drag blocks to
// move them, drag their bottom edge to resize, drag empty space to draw one.
export const HOUR_PX = 48;
const SNAP_MINUTES = 30;
const DRAG_SNAP = 15;
const HOURS = Array.from({ length: 23 }, (_, i) => i + 1);
const MOUSE_SLOP_PX = 4; // mouse: a drag starts after this much movement
const TOUCH_HOLD_MS = 300; // touch: press-and-hold picks a block up…
const TOUCH_SLOP_PX = 8; // …unless the finger moves first (that's a scroll)
const EDGE_SCROLL_PX = 40;

const TONE: Record<BlockState, string> = {
  done: "bg-ima-success/10 border-ima-success/20 text-ima-success",
  running: "bg-ima-surface-accent border-ima-primary/30 border-l-[3px] border-l-ima-primary text-ima-text",
  now: "bg-white border-ima-primary/40 text-ima-text shadow-card",
  upcoming: "bg-white border-ima-border text-ima-text shadow-card",
  past: "bg-ima-surface-light border-ima-border text-ima-text-secondary",
};

const snap = (min: number, to = DRAG_SNAP) => Math.round(min / to) * to;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

type DragMode = "move" | "resize" | "create";

/** Live position of whatever is being dragged. */
interface Preview {
  mode: DragMode;
  blockId: string | null;
  date: string;
  start: number;
  duration: number;
}

/** Everything the window listeners need; kept in a ref so they stay stable. */
interface Gesture {
  mode: DragMode;
  block: ScheduleBlock | null;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  active: boolean;
  holdTimer: ReturnType<typeof setTimeout> | null;
  /** move: minutes between the grab point and the block's start. */
  grabOffset: number;
  /** create: the minute where the drag began. */
  anchorMinute: number;
  anchorDate: string;
  preview: Preview | null;
  /** The exact listeners bound for this gesture, so they can be removed. */
  handlers: {
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
    cancel: (e: PointerEvent) => void;
    touchMove: (e: TouchEvent) => void;
  } | null;
}

interface TimeGridProps {
  /** One column per date (1 for a day view, 7 for a week). */
  days: string[];
  today: string;
  now: number;
  blocks: ScheduleBlock[];
  stateOf: (b: ScheduleBlock) => BlockState;
  onSlot: (date: string, minute: number) => void;
  onBlock: (b: ScheduleBlock) => void;
  /** A block was dragged to a new time/day or resized. */
  onChange: (b: ScheduleBlock, patch: BlockPatch) => void;
  /** An empty range was drawn — open the editor for it. */
  onCreateRange: (date: string, start: number, duration: number) => void;
  /** Tailwind height for the scroll pane. */
  paneClassName: string;
  loading?: boolean;
  /** Show a weekday/date header per column (week view). */
  showDayHeaders?: boolean;
  onDayHeader?: (date: string) => void;
}

export function TimeGrid({
  days,
  today,
  now,
  blocks,
  stateOf,
  onSlot,
  onBlock,
  onChange,
  onCreateRange,
  paneClassName,
  loading = false,
  showDayHeaders = false,
  onDayHeader,
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrolledFor = useRef<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const rangeKey = `${days[0]}:${days.length}`;

  // Latest props for the window listeners, without re-binding them.
  const latest = useRef({ days, onChange, onCreateRange });
  useEffect(() => {
    latest.current = { days, onChange, onCreateRange };
  }, [days, onChange, onCreateRange]);

  // Blocks as they should be drawn — the dragged one at its preview position.
  const shown = useMemo(() => {
    if (!preview || !preview.blockId) return blocks;
    return blocks.map((b) =>
      b.id === preview.blockId
        ? { ...b, date: preview.date, start_minute: preview.start, duration_minutes: preview.duration }
        : b,
    );
  }, [blocks, preview]);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleBlock[]>();
    for (const d of days) map.set(d, []);
    for (const b of shown) map.get(b.date)?.push(b);
    return map;
  }, [days, shown]);

  const columns = useMemo(() => {
    const out = new Map<string, { col: number; cols: number }>();
    for (const list of byDay.values()) {
      for (const [id, pos] of layoutColumns(list)) out.set(id, pos);
    }
    return out;
  }, [byDay]);

  // Scroll once per range shown: an hour before now if today is visible,
  // otherwise to the earliest block (or 8am) — like opening a calendar.
  useEffect(() => {
    if (loading || !scrollRef.current || scrolledFor.current === rangeKey) return;
    scrolledFor.current = rangeKey;
    const anchor = days.includes(today)
      ? now
      : blocks.length > 0
        ? Math.min(...blocks.map((b) => b.start_minute))
        : 8 * 60;
    scrollRef.current.scrollTop = Math.max(0, ((anchor - 60) / 60) * HOUR_PX);
  }, [loading, rangeKey, days, today, now, blocks]);

  // --- Drag gesture -------------------------------------------------------

  /** Pointer position → (column date, minute of day), using live geometry. */
  const locate = useCallback((clientX: number, clientY: number) => {
    const rect = gridRef.current!.getBoundingClientRect();
    const { days: ds } = latest.current;
    const col = clamp(Math.floor(((clientX - rect.left) / rect.width) * ds.length), 0, ds.length - 1);
    const minute = ((clientY - rect.top) / HOUR_PX) * 60;
    return { date: ds[col], minute };
  }, []);

  const compute = useCallback(
    (g: Gesture, clientX: number, clientY: number): Preview => {
      const { date, minute } = locate(clientX, clientY);
      if (g.mode === "move" && g.block) {
        const dur = g.block.duration_minutes;
        const start = clamp(snap(minute - g.grabOffset), 0, MINUTES_PER_DAY - dur);
        return { mode: "move", blockId: g.block.id, date, start, duration: dur };
      }
      if (g.mode === "resize" && g.block) {
        const start = g.block.start_minute;
        const end = clamp(
          snap(minute),
          start + DRAG_SNAP,
          Math.min(start + WORK_TRACKER.maxSessionMinutes, MINUTES_PER_DAY),
        );
        return { mode: "resize", blockId: g.block.id, date: g.block.date, start, duration: end - start };
      }
      // create — a range within the column the drag began in
      const a = g.anchorMinute;
      const b = clamp(snap(minute), 0, MINUTES_PER_DAY);
      let start = Math.min(a, b);
      let end = Math.max(a, b);
      if (end - start < DRAG_SNAP) end = start + DRAG_SNAP;
      if (end - start > WORK_TRACKER.maxSessionMinutes) {
        if (b < a) start = end - WORK_TRACKER.maxSessionMinutes;
        else end = start + WORK_TRACKER.maxSessionMinutes;
      }
      return { mode: "create", blockId: null, date: g.anchorDate, start, duration: end - start };
    },
    [locate],
  );

  const endGesture = useCallback(
    (commit: boolean) => {
      const g = gesture.current;
      if (!g) return;
      gesture.current = null;
      if (g.holdTimer) clearTimeout(g.holdTimer);
      if (g.handlers) {
        window.removeEventListener("pointermove", g.handlers.move);
        window.removeEventListener("pointerup", g.handlers.up);
        window.removeEventListener("pointercancel", g.handlers.cancel);
        window.removeEventListener("touchmove", g.handlers.touchMove);
      }
      setPreview(null);
      if (!g.active) return;

      // The click that follows a drag must not also open the editor.
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);

      const p = g.preview;
      if (!commit || !p) return;
      if (p.mode === "create") {
        latest.current.onCreateRange(p.date, p.start, p.duration);
        return;
      }
      const b = g.block!;
      if (p.date !== b.date || p.start !== b.start_minute || p.duration !== b.duration_minutes) {
        latest.current.onChange(b, { date: p.date, start_minute: p.start, duration_minutes: p.duration });
      }
    },
    [],
  );

  function activate(g: Gesture, clientX: number, clientY: number) {
    g.active = true;
    if (g.touch && "vibrate" in navigator) navigator.vibrate?.(10);
    g.preview = compute(g, clientX, clientY);
    setPreview(g.preview);
  }

  function onMove(e: PointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const dist = Math.hypot(e.clientX - g.startX, e.clientY - g.startY);
    if (!g.active) {
      if (g.touch) {
        // Finger moved before the hold completed — it's a scroll, let it be.
        if (dist > TOUCH_SLOP_PX) endGesture(false);
        return;
      }
      if (dist < MOUSE_SLOP_PX) return;
      activate(g, e.clientX, e.clientY);
      return;
    }
    // Nudge the pane when dragging near its top/bottom edge.
    const pane = scrollRef.current;
    if (pane) {
      const r = pane.getBoundingClientRect();
      if (e.clientY < r.top + EDGE_SCROLL_PX) pane.scrollTop -= 12;
      else if (e.clientY > r.bottom - EDGE_SCROLL_PX) pane.scrollTop += 12;
    }
    g.preview = compute(g, e.clientX, e.clientY);
    setPreview(g.preview);
  }

  function onUp(e: PointerEvent) {
    if (gesture.current && e.pointerId === gesture.current.pointerId) endGesture(true);
  }

  function onCancel(e: PointerEvent) {
    if (gesture.current && e.pointerId === gesture.current.pointerId) endGesture(false);
  }

  // Once a touch drag is live, stop the page from scrolling under the finger.
  function onTouchMove(e: TouchEvent) {
    if (gesture.current?.active) e.preventDefault();
  }

  const begin = (
    e: React.PointerEvent,
    mode: DragMode,
    block: ScheduleBlock | null,
    date: string,
  ) => {
    if (e.button !== 0 || gesture.current) return;
    const touch = e.pointerType !== "mouse";
    if (mode === "create" && touch) return; // on touch, empty space scrolls; tap still adds
    const { minute } = locate(e.clientX, e.clientY);
    const g: Gesture = {
      mode,
      block,
      pointerId: e.pointerId,
      touch,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      holdTimer: null,
      grabOffset: block ? minute - block.start_minute : 0,
      anchorMinute: clamp(snap(minute), 0, MINUTES_PER_DAY - DRAG_SNAP),
      anchorDate: date,
      preview: null,
      handlers: { move: onMove, up: onUp, cancel: onCancel, touchMove: onTouchMove },
    };
    gesture.current = g;
    if (touch) {
      const { clientX, clientY } = e;
      g.holdTimer = setTimeout(() => {
        if (gesture.current === g) activate(g, clientX, clientY);
      }, TOUCH_HOLD_MS);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", onTouchMove, { passive: false });
  };

  // Tear down if unmounted mid-drag.
  useEffect(() => () => endGesture(false), [endGesture]);

  const multi = days.length > 1;
  const dragging = preview !== null;

  // No text selection across the page while something is being dragged.
  useEffect(() => {
    if (!dragging) return;
    const body = document.body;
    const prev = body.style.userSelect;
    body.style.userSelect = "none";
    return () => {
      body.style.userSelect = prev;
    };
  }, [dragging]);

  return (
    <div ref={scrollRef} className={`overflow-auto ${paneClassName}`}>
      <div className={multi ? "min-w-[640px]" : undefined}>
        {showDayHeaders && (
          <div className="sticky top-0 z-20 flex bg-white border-b border-ima-border">
            <div className="w-14 shrink-0" />
            <div
              className="grid flex-1 mr-[10px]"
              style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
            >
              {days.map((d) => {
                const date = parseDate(d);
                const isToday = d === today;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onDayHeader?.(d)}
                    className="flex flex-col items-center gap-[3px] py-[10px] min-h-[44px] rounded-lg hover:bg-ima-surface-light motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-[-2px]"
                  >
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-[0.08em] ${isToday ? "text-ima-primary" : "text-ima-text-secondary"}`}
                    >
                      {date.toLocaleDateString([], { weekday: "short" })}
                    </span>
                    <span
                      className={`h-8 w-8 inline-flex items-center justify-center rounded-full text-[15px] font-semibold tabular-nums ${isToday ? "bg-ima-primary text-white" : "text-ima-text"}`}
                    >
                      {date.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="relative flex" style={{ height: 24 * HOUR_PX }}>
          {/* Hour labels */}
          <div className="relative w-14 shrink-0" aria-hidden="true">
            {HOURS.map((h) => (
              <span
                key={h}
                className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-ima-text-secondary tabular-nums whitespace-nowrap"
                style={{ top: h * HOUR_PX }}
              >
                {formatHourLabel(h)}
              </span>
            ))}
          </div>

          <div
            ref={gridRef}
            className={`relative grid flex-1 mr-[10px] ${dragging ? "cursor-grabbing" : ""}`}
            style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
          >
            {HOURS.map((h) => (
              <div
                key={h}
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 border-t border-ima-border"
                style={{ top: h * HOUR_PX }}
              />
            ))}

            {days.map((d) => (
              <div
                key={d}
                className={`relative border-l border-ima-border ${dragging ? "" : "cursor-pointer"} ${d === today ? "bg-ima-surface-accent/30" : ""}`}
                onPointerDown={(e) => e.target === e.currentTarget && begin(e, "create", null, d)}
                onClick={(e) => {
                  if (suppressClick.current || e.target !== e.currentTarget) return;
                  const { minute } = locate(e.clientX, e.clientY);
                  onSlot(d, clamp(Math.floor(minute / SNAP_MINUTES) * SNAP_MINUTES, 0, MINUTES_PER_DAY - SNAP_MINUTES));
                }}
              >
                {(byDay.get(d) ?? []).map((b) => {
                  const state = stateOf(b);
                  // Blocks with a running/finished timer are a record of work — locked.
                  const draggable = state !== "running" && state !== "done";
                  const isDragged = preview?.blockId === b.id;
                  const { col, cols } = columns.get(b.id) ?? { col: 0, cols: 1 };
                  const height = Math.max((b.duration_minutes / 60) * HOUR_PX, 22);
                  const compact = height < 44;
                  const range = formatRange(b);
                  const suffix =
                    state === "done" ? ", done" : state === "running" ? ", timer running" : "";
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onPointerDown={draggable ? (e) => begin(e, "move", b, b.date) : undefined}
                      onClick={() => !suppressClick.current && onBlock(b)}
                      onContextMenu={draggable ? (e) => e.preventDefault() : undefined}
                      aria-label={`${b.title}, ${range}${suffix}`}
                      className={`group absolute overflow-hidden rounded-[8px] border px-2 text-left select-none [-webkit-touch-callout:none] motion-safe:transition-colors hover:border-ima-primary/50 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-1 ${TONE[state]} ${compact ? "py-0 flex items-center gap-[6px]" : "py-[3px]"} ${draggable ? "cursor-grab" : ""} ${isDragged ? "z-30 shadow-card-hover ring-2 ring-ima-primary/40" : ""}`}
                      style={{
                        top: (b.start_minute / 60) * HOUR_PX + 1,
                        height: height - 2,
                        left: isDragged ? "3px" : `calc(${(col / cols) * 100}% + 3px)`,
                        width: isDragged ? "calc(100% - 6px)" : `calc(${100 / cols}% - 6px)`,
                      }}
                    >
                      <span className="flex items-center gap-1 min-w-0">
                        {state === "done" && <Check className="h-3 w-3 shrink-0" aria-hidden="true" />}
                        <span className="text-[12px] font-semibold leading-tight truncate">{b.title}</span>
                      </span>
                      <span
                        className={`text-[11px] tabular-nums truncate ${compact ? "" : "block mt-[1px]"} ${state === "done" ? "" : "text-ima-text-secondary"}`}
                      >
                        {compact ? formatClock(b.start_minute) : range}
                      </span>
                      {draggable && (
                        <span
                          aria-hidden="true"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            begin(e, "resize", b, b.date);
                          }}
                          className="absolute inset-x-0 bottom-0 h-[8px] cursor-ns-resize"
                        >
                          <span className="absolute left-1/2 bottom-[2px] -translate-x-1/2 h-[3px] w-6 rounded-full bg-ima-text-secondary/40 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity" />
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Range being drawn */}
                {preview?.mode === "create" && preview.date === d && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-[3px] z-30 rounded-[8px] border border-ima-primary/40 bg-ima-surface-accent px-2 py-[3px]"
                    style={{
                      top: (preview.start / 60) * HOUR_PX + 1,
                      height: (preview.duration / 60) * HOUR_PX - 2,
                    }}
                  >
                    <span className="text-[11px] font-semibold tabular-nums text-ima-text">
                      {formatRange({ start_minute: preview.start, duration_minutes: preview.duration })}
                    </span>
                  </div>
                )}

                {/* Now line */}
                {d === today && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 z-10"
                    style={{ top: (now / 60) * HOUR_PX }}
                  >
                    <div className="relative h-[2px] bg-ima-primary">
                      <span className="absolute -left-[5px] -top-[4px] h-[10px] w-[10px] rounded-full bg-ima-primary" />
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="pointer-events-none absolute inset-0 bg-white/60 motion-safe:animate-pulse" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
