"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Plus } from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { formatHoursMinutes } from "@/lib/utils";
import {
  addDays,
  addMonths,
  blockState,
  copyBlocks,
  daysBetween,
  fetchBlocks,
  patchBlock,
  type BlockPatch,
  formatClock,
  parseDate,
  startOfMonth,
  startOfWeek,
  type ScheduleBlock,
} from "@/lib/schedule";
import { TimeGrid } from "./TimeGrid";
import { BlockEditor, type EditorTarget } from "./BlockEditor";
import { useLocalClock } from "./useLocalClock";

export type CalendarViewMode = "day" | "week" | "month";
const VIEWS: { key: CalendarViewMode; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];
const MONTH_CHIPS = 3;

/** The dates a view covers, and a human title for them. */
function rangeFor(view: CalendarViewMode, anchor: string): { from: string; to: string; days: string[] } {
  if (view === "day") return { from: anchor, to: anchor, days: [anchor] };
  if (view === "week") {
    const from = startOfWeek(anchor);
    const to = addDays(from, 6);
    return { from, to, days: daysBetween(from, to) };
  }
  // Month: whole weeks covering the month, Monday-first (5 or 6 rows).
  const first = startOfMonth(anchor);
  const from = startOfWeek(first);
  const last = addDays(addMonths(anchor, 1), -1);
  const to = addDays(startOfWeek(last), 6);
  return { from, to, days: daysBetween(from, to) };
}

function titleFor(view: CalendarViewMode, anchor: string): string {
  const d = parseDate(anchor);
  if (view === "day") {
    return d.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
  }
  if (view === "month") return d.toLocaleDateString([], { month: "long", year: "numeric" });
  const from = parseDate(startOfWeek(anchor));
  const to = parseDate(addDays(startOfWeek(anchor), 6));
  const sameMonth = from.getMonth() === to.getMonth();
  const left = from.toLocaleDateString([], { month: "short", day: "numeric" });
  const right = to.toLocaleDateString([], sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${left} – ${right}, ${to.getFullYear()}`;
}

function step(view: CalendarViewMode, anchor: string, dir: 1 | -1): string {
  if (view === "day") return addDays(anchor, dir);
  if (view === "week") return addDays(anchor, 7 * dir);
  return addMonths(anchor, dir);
}

interface CalendarViewProps {
  initialView: CalendarViewMode;
  /** From the URL; null means "today" (resolved on the client, in local time). */
  initialDate: string | null;
  /** This page's path — view/date are mirrored into its query string. */
  basePath: string;
  /** Work Tracker — where timers are started. */
  timerHref: string;
}

export function CalendarView({ initialView, initialDate, basePath, timerHref }: CalendarViewProps) {
  const toastRef = useRef(useToast());
  const routerRef = useRef(useRouter());
  const clock = useLocalClock();
  const [view, setView] = useState<CalendarViewMode>(initialView);
  const [anchor, setAnchor] = useState<string | null>(initialDate);
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editor, setEditor] = useState<EditorTarget | null>(null);

  const today = clock?.today ?? null;
  const now = clock?.now ?? 0;
  const current = anchor ?? today;
  const range = useMemo(() => (current ? rangeFor(view, current) : null), [view, current]);

  // Keep the URL in step so refresh / back / sharing a link lands on the same view.
  useEffect(() => {
    if (!current) return;
    routerRef.current.replace(`${basePath}?view=${view}&date=${current}`, { scroll: false });
  }, [basePath, view, current]);

  useEffect(() => {
    if (!range) return;
    let cancelled = false;
    setLoaded(false);
    fetchBlocks(range.from, range.to)
      .then((data) => {
        if (!cancelled) setBlocks(data);
      })
      .catch((err: Error) => {
        console.error("[CalendarView] Failed to load blocks:", err);
        toastRef.current.toast({ type: "error", title: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const stateOf = useCallback((b: ScheduleBlock) => blockState(b, today ?? "", now), [today, now]);

  const upsert = useCallback(
    (block: ScheduleBlock) => {
      setBlocks((prev) => {
        const without = prev.filter((b) => b.id !== block.id);
        const inRange = range && block.date >= range.from && block.date <= range.to;
        return inRange ? [...without, block] : without;
      });
    },
    [range],
  );

  const openDay = useCallback((d: string) => {
    setView("day");
    setAnchor(d);
  }, []);

  // Drag-to-move/resize: show it immediately, roll back if the save fails.
  const moveBlock = useCallback(
    async (b: ScheduleBlock, patch: BlockPatch) => {
      setBlocks((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
      try {
        upsert(await patchBlock(b.id, patch));
      } catch (err) {
        console.error("[CalendarView] moveBlock error:", err);
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
    (d: string, minute?: number) => {
      const fallback = d === today ? Math.ceil(now / 30) * 30 : 9 * 60;
      setEditor({ kind: "create", date: d, startMinute: Math.min(minute ?? fallback, 1410) });
    },
    [today, now],
  );

  // Most weeks look like the last one — copy it forward in one request.
  const copyLastWeek = useCallback(async () => {
    if (!range || view !== "week") return;
    setBusy(true);
    try {
      const created = await copyBlocks(addDays(range.from, -7), addDays(range.from, -1), 7);
      if (created.length === 0) {
        toastRef.current.toast({ type: "error", title: "Nothing planned last week to copy" });
        return;
      }
      setBlocks((p) => [...p, ...created]);
      toastRef.current.toast({
        type: "success",
        title: `Copied ${created.length} block${created.length === 1 ? "" : "s"} from last week`,
      });
    } catch (err) {
      console.error("[CalendarView] copyLastWeek error:", err);
      toastRef.current.toast({
        type: "error",
        title: err instanceof Error ? err.message : "Couldn't copy those blocks",
      });
    } finally {
      setBusy(false);
    }
  }, [range, view]);

  const plannedMinutes = blocks.reduce((sum, b) => sum + b.duration_minutes, 0);
  const segBtn = (active: boolean) =>
    `min-h-[40px] px-4 rounded-[9px] text-[13px] font-semibold motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 ${
      active ? "bg-ima-text text-white" : "text-ima-text-secondary hover:text-ima-text"
    }`;
  const iconButton =
    "h-11 w-11 inline-flex items-center justify-center rounded-lg border border-ima-border text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2";

  return (
    <div>
      {/* Masthead */}
      <header className="motion-safe:animate-fadeIn">
        <Link
          href={timerHref}
          className="inline-flex items-center gap-[6px] min-h-[44px] -ml-2 px-2 rounded-lg text-[13px] font-semibold text-ima-text-secondary hover:text-ima-primary motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Work
        </Link>
        <p className="mt-3 text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase">
          Calendar
        </p>
        <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em] min-h-[1.05em]">
          {current ? titleFor(view, current) : " "}
        </h1>
        <p className="mt-3 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
          Plan your blocks here, then start them from the Work Tracker. Planned time doesn&apos;t
          count as worked time.
          {plannedMinutes > 0 && (
            <span className="ml-1 font-semibold text-ima-text tabular-nums">
              {`${formatHoursMinutes(plannedMinutes)} planned.`}
            </span>
          )}
        </p>
      </header>

      {/* Toolbar */}
      <div className="mt-8 flex flex-wrap items-center gap-[10px]">
        <Button variant="secondary" onClick={() => setAnchor(null)} disabled={!today || current === today}>
          Today
        </Button>
        <div className="flex items-center gap-[6px]">
          <button
            type="button"
            aria-label={`Previous ${view}`}
            onClick={() => current && setAnchor(step(view, current, -1))}
            className={iconButton}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Next ${view}`}
            onClick={() => current && setAnchor(step(view, current, 1))}
            className={iconButton}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="inline-flex rounded-[12px] border border-ima-border bg-white p-1" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={view === v.key}
              onClick={() => setView(v.key)}
              className={segBtn(view === v.key)}
            >
              {v.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-[10px]">
          {view === "week" && loaded && blocks.length === 0 && (
            <Button variant="ghost" onClick={copyLastWeek} loading={busy}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy last week
            </Button>
          )}
          <Button onClick={() => current && openCreate(view === "month" ? (today ?? current) : current)} disabled={!current}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New block
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="mt-[14px] bg-white border border-ima-border rounded-[14px] shadow-card overflow-hidden motion-safe:animate-fadeIn">
        {!range || !today ? (
          <div className="h-[calc(100vh-320px)] min-h-[480px] bg-ima-surface-light motion-safe:animate-pulse" />
        ) : view === "month" ? (
          <MonthGrid
            days={range.days}
            month={parseDate(current!).getMonth()}
            today={today}
            blocks={blocks}
            loading={!loaded}
            stateOf={stateOf}
            onDay={openDay}
            onCreate={(d) => openCreate(d)}
            onBlock={(b) => setEditor({ kind: "edit", block: b })}
          />
        ) : (
          <TimeGrid
            days={range.days}
            today={today}
            now={now}
            blocks={blocks}
            stateOf={stateOf}
            loading={!loaded}
            showDayHeaders={view === "week"}
            onDayHeader={openDay}
            onSlot={(d, m) => openCreate(d, m)}
            onBlock={(b) => setEditor({ kind: "edit", block: b })}
            onChange={moveBlock}
            onCreateRange={(d, start, duration) =>
              setEditor({ kind: "create", date: d, startMinute: start, durationMinutes: duration })
            }
            paneClassName="h-[calc(100vh-320px)] min-h-[480px]"
          />
        )}
      </div>

      <BlockEditor
        target={editor}
        onClose={() => setEditor(null)}
        onSaved={upsert}
        onDeleted={(id) => setBlocks((prev) => prev.filter((b) => b.id !== id))}
        timerHref={timerHref}
        canStart={editor?.kind === "edit" && editor.block.date === today}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Month grid
// ---------------------------------------------------------------------------

interface MonthGridProps {
  days: string[];
  month: number;
  today: string;
  blocks: ScheduleBlock[];
  loading: boolean;
  stateOf: (b: ScheduleBlock) => ReturnType<typeof blockState>;
  onDay: (date: string) => void;
  onCreate: (date: string) => void;
  onBlock: (b: ScheduleBlock) => void;
}

function MonthGrid({ days, month, today, blocks, loading, stateOf, onDay, onCreate, onBlock }: MonthGridProps) {
  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleBlock[]>();
    for (const b of blocks) {
      const list = map.get(b.date) ?? [];
      list.push(b);
      map.set(b.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start_minute - b.start_minute);
    return map;
  }, [blocks]);

  const weekdays = days.slice(0, 7).map((d) => parseDate(d).toLocaleDateString([], { weekday: "short" }));

  return (
    <div className={loading ? "motion-safe:animate-pulse" : undefined}>
      <div className="grid grid-cols-7 border-b border-ima-border">
        {weekdays.map((w) => (
          <p
            key={w}
            className="py-[10px] text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
          >
            {w}
          </p>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const date = parseDate(d);
          const inMonth = date.getMonth() === month;
          const isToday = d === today;
          const list = byDay.get(d) ?? [];
          const total = list.reduce((s, b) => s + b.duration_minutes, 0);
          return (
            <div
              key={d}
              onClick={(e) => e.target === e.currentTarget && onCreate(d)}
              className={`relative min-h-[88px] md:min-h-[124px] p-1 md:p-[6px] border-ima-border cursor-pointer hover:bg-ima-surface-light/60 motion-safe:transition-colors ${
                i % 7 !== 6 ? "border-r" : ""
              } ${i < days.length - 7 ? "border-b" : ""}`}
            >
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onDay(d)}
                  aria-label={`Open ${date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}`}
                  className={`h-7 min-w-7 px-1 inline-flex items-center justify-center rounded-full text-[12px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-1 ${
                    isToday
                      ? "bg-ima-primary text-white"
                      : inMonth
                        ? "text-ima-text hover:bg-ima-surface-light"
                        : "text-ima-text-muted hover:bg-ima-surface-light"
                  }`}
                >
                  {date.getDate()}
                </button>
                {total > 0 && (
                  <span className="hidden md:inline text-[10px] font-medium text-ima-text-secondary tabular-nums">
                    {formatHoursMinutes(total)}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-col gap-[3px]">
                {list.slice(0, MONTH_CHIPS).map((b) => {
                  const state = stateOf(b);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => onBlock(b)}
                      className={`w-full truncate rounded-[6px] px-1 md:px-[6px] py-[2px] text-left text-[10px] md:text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-1 ${
                        state === "done"
                          ? "bg-ima-success/10 text-ima-success"
                          : state === "past"
                            ? "text-ima-text-secondary hover:bg-ima-surface-light"
                            : "bg-ima-surface-accent text-ima-text hover:bg-ima-primary/15"
                      }`}
                    >
                      <span className="hidden md:inline font-medium tabular-nums text-ima-text-secondary mr-1">
                        {formatClock(b.start_minute)}
                      </span>
                      {b.title}
                    </button>
                  );
                })}
                {list.length > MONTH_CHIPS && (
                  <button
                    type="button"
                    onClick={() => onDay(d)}
                    className="w-full text-left px-1 md:px-[6px] text-[10px] md:text-[11px] font-semibold text-ima-text-secondary hover:text-ima-primary focus-visible:outline-2 focus-visible:outline-ima-primary"
                  >
                    {`+${list.length - MONTH_CHIPS} more`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
