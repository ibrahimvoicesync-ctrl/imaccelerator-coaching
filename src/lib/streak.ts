import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type StreakDay = {
  /** YYYY-MM-DD (UTC) */
  date: string;
  /** A completed work session was logged on this day. */
  active: boolean;
  isToday: boolean;
};

export type StreakInfo = {
  /** Length of the consecutive-day run ending today (or yesterday, grace). */
  current: number;
  /** Longest run within the lookback window. */
  longest: number;
  /** Whether a completed session has already been logged today. */
  activeToday: boolean;
  /** Last 7 days, oldest → newest, for the dot strip. */
  week: StreakDay[];
};

/** YYYY-MM-DD in UTC for a given Date. */
function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Returns whether `b` is exactly the calendar day after `a` (both YYYY-MM-DD). */
function isNextDay(a: string, b: string): boolean {
  const next = new Date(a + "T00:00:00Z");
  next.setUTCDate(next.getUTCDate() + 1);
  return ymd(next) === b;
}

/**
 * Computes a student's daily work streak from completed work sessions.
 *
 * A day "counts" when it has at least one completed session. The current streak
 * is the run of consecutive counting days ending today; if today has no session
 * yet but yesterday did, the streak still stands (the student has today to keep
 * it going) — this is the "don't break the chain" grace that makes the streak a
 * reason to return rather than a punishment for not having worked yet today.
 */
export async function getStreakInfo(studentId: string): Promise<StreakInfo> {
  const admin = createAdminClient();

  // Look back far enough to capture any realistic streak (~4 months).
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 120);

  // Only distinct active dates matter here, but a high-volume student can log
  // many sessions/day and blow past PostgREST's max_rows (1000) cap. Order by
  // date DESC so that if truncation happens it drops the OLDEST rows, never a
  // recent day — a lost recent day would falsely reset the current streak.
  // `date` is NOT NULL (completed_at is nullable), so it's the safe sort key.
  const { data, error } = await admin
    .from("work_sessions")
    .select("date")
    .eq("student_id", studentId)
    .eq("status", "completed")
    .gte("date", ymd(since))
    .order("date", { ascending: false });

  if (error) {
    console.error("[streak] query failed:", error);
  }

  const activeDates = new Set((data ?? []).map((r) => r.date));

  const now = new Date();
  const todayStr = ymd(now);
  const activeToday = activeDates.has(todayStr);

  // Current streak — walk backwards from today (or yesterday if today is blank).
  const cursor = new Date(now);
  if (!activeToday) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let current = 0;
  while (activeDates.has(ymd(cursor))) {
    current++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  // Longest streak in the window.
  const sorted = [...activeDates].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const ds of sorted) {
    run = prev && isNextDay(prev, ds) ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = ds;
  }

  // Last 7 days for the dot strip (oldest → newest).
  const week: StreakDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = ymd(d);
    week.push({ date: ds, active: activeDates.has(ds), isToday: ds === todayStr });
  }

  return { current, longest, activeToday, week };
}
