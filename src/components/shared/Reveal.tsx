"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveals its children as they scroll into view — a quiet rise + fade on an
 * expo-out curve. Uses IntersectionObserver and fires once. Reduced-motion
 * users get the content immediately with no transform (the hidden state is
 * gated behind motion-safe), so nothing is ever stuck invisible for them.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced-motion users never receive the hidden styles (they're gated
    // behind motion-safe below), so there's nothing to observe for them.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
      className={cn(
        "motion-safe:transition-all motion-safe:duration-[650ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]",
        shown
          ? "opacity-100 translate-y-0"
          : "motion-safe:opacity-0 motion-safe:translate-y-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
