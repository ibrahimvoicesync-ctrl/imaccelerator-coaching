import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Returns today's date as YYYY-MM-DD in local time */
export function getToday(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Returns today's date as YYYY-MM-DD in UTC */
export function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Monday of the current week as a YYYY-MM-DD string, in local time to match
 * how work_sessions.date is stamped (getToday). ISO week: Monday is day 1;
 * on Sunday (0) the week's Monday is 6 days back.
 */
export function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayOfMonth = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayOfMonth}`;
}

/** Validates a date string matches YYYY-MM-DD format and is a real date */
export function isValidDateString(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(new Date(date + "T00:00:00Z").getTime());
}

/** Format remaining time for a paused session as "MM:SS" */
export function formatPausedRemaining(
  startedAt: string,
  pausedAt: string,
  sessionMinutes: number
): string {
  const totalMs = sessionMinutes * 60 * 1000;
  const elapsedMs = new Date(pausedAt).getTime() - new Date(startedAt).getTime();
  if (Number.isNaN(elapsedMs)) return "--:--";
  const remainingMs = Math.max(0, totalMs - elapsedMs);
  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Format total minutes as hours string: 90 -> "1.5h", 45 -> "0.8h", 0 -> "0h" */
export function formatHours(minutes: number): string {
  if (minutes <= 0) return "0h";
  const hours = (minutes / 60).toFixed(1);
  return `${hours}h`;
}

/** Format total minutes as human-readable duration: 90 -> "1h 30m", 60 -> "1h", 5 -> "5m", 0 -> "0m" */
export function formatHoursMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Time-of-day greeting */
export function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
