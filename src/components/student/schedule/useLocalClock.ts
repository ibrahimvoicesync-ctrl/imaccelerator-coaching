"use client";

import { useEffect, useState } from "react";
import { getToday } from "@/lib/utils";
import { nowMinute } from "@/lib/schedule";

/**
 * The student's local date and minute-of-day, ticking every 30s. Null until
 * mount — the server doesn't know the student's timezone, so anything that
 * depends on it renders a skeleton first rather than risk a hydration mismatch.
 */
export function useLocalClock(): { today: string; now: number } | null {
  const [clock, setClock] = useState<{ today: string; now: number } | null>(null);
  useEffect(() => {
    const tick = () => setClock({ today: getToday(), now: nowMinute() });
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);
  return clock;
}
