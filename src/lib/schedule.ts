/**
 * Client-safe helpers for the day planner / calendar (schedule_blocks,
 * migration 00051). Everything here is local wall-clock time: a block lives on
 * the student's local calendar date at `start_minute` minutes after their local
 * midnight. Nothing in the planner converts through UTC.
 */
import type { Database } from "@/lib/types";
import { MINUTES_PER_DAY } from "@/lib/schemas/schedule-block";

export { MINUTES_PER_DAY };

type BlockRow = Database["public"]["Tables"]["schedule_blocks"]["Row"];
export type SessionStatus = Database["public"]["Tables"]["work_sessions"]["Row"]["status"];

/** A block plus the status of the timer session started from it, if any. */
export type ScheduleBlock = BlockRow & { session: { status: SessionStatus } | null };

/** The embed the API selects so every block carries its session status. */
export const BLOCK_SELECT = "*, session:work_sessions(status)";

export type BlockState = "done" | "running" | "now" | "past" | "upcoming";

// ---------------------------------------------------------------------------
// Dates — "YYYY-MM-DD" strings in local time
// ---------------------------------------------------------------------------

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return toDateString(d);
}

/** Weeks start on Monday. */
export function startOfWeek(date: string): string {
  const offset = (parseDate(date).getDay() + 6) % 7;
  return addDays(date, -offset);
}

export function startOfMonth(date: string): string {
  const d = parseDate(date);
  return toDateString(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function addMonths(date: string, n: number): string {
  const d = parseDate(date);
  return toDateString(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Times — minutes after local midnight
// ---------------------------------------------------------------------------

export function nowMinute(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** 570 -> "09:30". 1440 (end of day) wraps to "00:00", which reads back as midnight. */
export function toTimeInput(min: number): string {
  const m = min % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function fromTimeInput(value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Locale clock time — 12h or 24h per the student's browser. */
export function formatClock(min: number): string {
  return new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatHourLabel(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });
}

export function formatRange(b: { start_minute: number; duration_minutes: number }): string {
  return `${formatClock(b.start_minute)} – ${formatClock(b.start_minute + b.duration_minutes)}`;
}

// ---------------------------------------------------------------------------
// Block state & layout
// ---------------------------------------------------------------------------

/**
 * Where a block stands. `liveStatus` (the tracker's in-memory sessions) wins
 * over the status embedded at fetch time, so starting/finishing a timer shows
 * immediately.
 */
export function blockState(
  b: ScheduleBlock,
  today: string,
  now: number,
  liveStatus?: SessionStatus,
): BlockState {
  const status = liveStatus ?? b.session?.status;
  if (status === "completed") return "done";
  if (status === "in_progress" || status === "paused") return "running";
  if (b.date < today) return "past";
  if (b.date > today) return "upcoming";
  if (b.start_minute + b.duration_minutes <= now) return "past";
  if (b.start_minute <= now) return "now";
  return "upcoming";
}

/**
 * Side-by-side columns for overlapping blocks within one day, like a calendar
 * day view. Returns each block's column index and its cluster's column count.
 */
export function layoutColumns(
  blocks: ScheduleBlock[],
): Map<string, { col: number; cols: number }> {
  const out = new Map<string, { col: number; cols: number }>();
  const sorted = [...blocks].sort(
    (a, b) => a.start_minute - b.start_minute || b.duration_minutes - a.duration_minutes,
  );
  let cluster: ScheduleBlock[] = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;

  const flush = () => {
    for (const b of cluster) out.set(b.id, { col: out.get(b.id)!.col, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };

  for (const b of sorted) {
    if (b.start_minute >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= b.start_minute);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(0);
    }
    colEnds[col] = b.start_minute + b.duration_minutes;
    out.set(b.id, { col, cols: 0 });
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, b.start_minute + b.duration_minutes);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

export async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch((err) => {
    console.error("[schedule] Failed to parse error response:", err);
    return null;
  });
  return typeof body?.error === "string" ? body.error : fallback;
}

/** Blocks between two local dates, inclusive. Throws with a readable message. */
export async function fetchBlocks(from: string, to: string): Promise<ScheduleBlock[]> {
  const response = await fetch(`/api/schedule-blocks?from=${from}&to=${to}`);
  if (!response.ok) throw new Error(await readError(response, "Couldn't load your schedule"));
  const json = await response.json();
  return json.data as ScheduleBlock[];
}

/**
 * Copy every block in [from, to] forward by `shiftDays` in one request.
 * Returns the created blocks (empty if there was nothing to copy).
 */
export async function copyBlocks(
  from: string,
  to: string,
  shiftDays: number,
): Promise<ScheduleBlock[]> {
  const source = await fetchBlocks(from, to);
  if (source.length === 0) return [];
  const response = await fetch("/api/schedule-blocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      blocks: source.map((b) => ({
        date: addDays(b.date, shiftDays),
        title: b.title,
        start_minute: b.start_minute,
        duration_minutes: b.duration_minutes,
      })),
    }),
  });
  if (!response.ok) throw new Error(await readError(response, "Couldn't copy those blocks"));
  const json = await response.json();
  return json.data as ScheduleBlock[];
}

export type BlockPatch = Pick<ScheduleBlock, "date" | "start_minute" | "duration_minutes">;

/** Move/resize a block. Resolves to the saved block; throws with a readable message. */
export async function patchBlock(id: string, patch: Partial<BlockPatch>): Promise<ScheduleBlock> {
  const response = await fetch(`/api/schedule-blocks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(await readError(response, "Couldn't move that block"));
  const json = await response.json();
  return json.data as ScheduleBlock;
}
