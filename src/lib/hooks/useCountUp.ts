"use client";

import { useEffect, useState } from "react";

/**
 * Eased 0→1 progress for a one-time count-up on mount (expo-out, mirrors
 * cubic-bezier(0.16, 1, 0.3, 1)). Settles straight to 1 when there's nothing
 * to animate (`skip`) or the user prefers reduced motion. Callers multiply
 * their final values by the result.
 */
export function useCountUp(skip: boolean, duration = 1000): number {
  // Start at zero so the count-up has somewhere to travel from (no flash).
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || skip) {
      // One-time settle to the final value — no animation to drive.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(1);
      return;
    }

    let start: number | null = null;
    let raf = 0;
    const ease = (t: number) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

    const tick = (now: number) => {
      if (start === null) start = now;
      const p = Math.min((now - start) / duration, 1);
      setProgress(ease(p));
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [skip, duration]);

  return progress;
}
