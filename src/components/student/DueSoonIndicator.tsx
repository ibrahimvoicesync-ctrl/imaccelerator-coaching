"use client";

import { useEffect, useState } from "react";
import { DAILY_REPORT } from "@/lib/config";
import { cn } from "@/lib/utils";

export function DueSoonIndicator() {
  const [text, setText] = useState(`Due before ${DAILY_REPORT.deadlineHour % 12 || 12} PM tonight.`);
  const [tone, setTone] = useState<"muted" | "warning">("muted");

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const deadline = new Date(now);
      deadline.setHours(DAILY_REPORT.deadlineHour, 0, 0, 0);

      if (now >= deadline) {
        setText("Past tonight's deadline — you can still submit until 6 AM.");
        setTone("muted");
        return;
      }

      const minutes = Math.floor((deadline.getTime() - now.getTime()) / 60000);
      if (minutes < 60) {
        setText(`Due in ${minutes} minute${minutes !== 1 ? "s" : ""} — submit when you can.`);
        setTone("warning");
      } else {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        setText(
          mins === 0
            ? `Your report is due in ${hours}h.`
            : `Your report is due in ${hours}h ${mins}m.`,
        );
        setTone("muted");
      }
    };

    compute();
    const id = setInterval(compute, 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <p
      className={cn(
        "text-sm",
        tone === "warning" ? "text-ima-warning font-medium" : "text-ima-text-secondary",
      )}
    >
      {text}
    </p>
  );
}
