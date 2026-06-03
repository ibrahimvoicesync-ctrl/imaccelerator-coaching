"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface WorkTimerProps {
  sessionId: string;
  startedAt: string;
  cycleNumber: number;
  totalSeconds: number;
  onComplete: () => void;
}

export function WorkTimer({
  sessionId,
  startedAt,
  cycleNumber,
  totalSeconds,
  onComplete,
}: WorkTimerProps) {
  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const calcRemaining = useCallback(() => {
    const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
    return Math.max(0, totalSeconds - elapsed);
  }, [startedAt, totalSeconds]);

  const [remainingSeconds, setRemainingSeconds] = useState(() => calcRemaining());

  // Restore from started_at on mount / startedAt change
  useEffect(() => {
    setRemainingSeconds(calcRemaining());
  }, [calcRemaining]);

  // Tick interval
  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = calcRemaining();
      setRemainingSeconds(remaining);

      // Update tab title every tick
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      const timeStr = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
      document.title = `${timeStr} - Work Tracker | IMA`;

      if (remaining <= 0) {
        clearInterval(interval);
        document.title = "Work Tracker | IMA";
        onCompleteRef.current();
      }
    }, 1000);

    return () => {
      clearInterval(interval);
      document.title = "Work Tracker | IMA";
    };
  }, [sessionId, startedAt, calcRemaining]);

  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;

  // SVG circular progress ring
  const size = 280;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  // Announce every 15 seconds for screen readers
  const announceText =
    remainingSeconds > 0 && remainingSeconds % 15 === 0
      ? `${minutes} minutes ${seconds} seconds remaining in Session ${cycleNumber}`
      : "";

  return (
    <div
      className="flex flex-col items-center gap-4"
      role="timer"
      aria-label={`${minutes} minutes and ${seconds} seconds remaining in Session ${cycleNumber}`}
    >
      {/* Screen reader live region */}
      <div aria-live="polite" className="sr-only">
        {announceText}
      </div>

      <div className="relative w-[240px] h-[240px] md:w-[320px] md:h-[320px]">
        <svg
          className="w-full h-full -rotate-90"
          viewBox={`0 0 ${size} ${size}`}
          aria-hidden="true"
        >
          {/* Track ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth={strokeWidth}
          />
          {/* Progress ring */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#2563EB"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="motion-safe:transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>

        {/* Centered countdown text — editorial scale, tabular-nums */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-[10px] md:text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary mb-2"
          >
            Session {cycleNumber}
          </span>
          <span className="text-[56px] md:text-[72px] font-bold tabular-nums tracking-[-0.02em] text-ima-primary leading-none">
            {timeStr}
          </span>
          <span
            className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary mt-3"
          >
            Remaining
          </span>
        </div>
      </div>
    </div>
  );
}
