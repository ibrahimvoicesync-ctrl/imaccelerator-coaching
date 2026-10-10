"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange: (rating: number) => void;
  max?: number;
  disabled?: boolean;
}

/**
 * Day rating selector — a 1..max segmented control. Brand is anti-gamified and
 * blue-as-signal, so the rating fills with ima-primary (a calm strength meter)
 * rather than amber stars. Keeps the radiogroup a11y contract: arrow keys move,
 * only the active segment is in the tab order.
 */
export function StarRating({ value, onChange, max = 5, disabled = false }: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        e.preventDefault();
        onChange(Math.min(value + 1, max));
      } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        e.preventDefault();
        onChange(Math.max(value - 1, 1));
      }
    },
    [disabled, value, max, onChange]
  );

  return (
    <div
      id="star-rating-group"
      role="radiogroup"
      aria-labelledby="star-rating-label"
      className="flex gap-2"
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHovered(0)}
    >
      {Array.from({ length: max }, (_, i) => {
        const ratingValue = i + 1;
        const active = hovered || value;
        const filled = ratingValue <= active;
        const isPreview = hovered > 0 && ratingValue <= hovered && ratingValue > value;

        return (
          <button
            key={ratingValue}
            type="button"
            role="radio"
            aria-checked={ratingValue === value}
            aria-label={`${ratingValue} of ${max}`}
            tabIndex={ratingValue === value || (value === 0 && ratingValue === 1) ? 0 : -1}
            disabled={disabled}
            className={cn(
              "flex-1 min-h-[44px] rounded-xl border text-sm font-semibold tabular-nums",
              "motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2",
              filled && !isPreview && "bg-ima-primary border-ima-primary text-white",
              isPreview && "bg-ima-primary/15 border-ima-primary/40 text-ima-primary",
              !filled && "bg-ima-surface border-ima-border text-ima-text-secondary hover:border-ima-primary/40 hover:text-ima-text",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            onClick={() => !disabled && onChange(ratingValue)}
            onMouseEnter={() => !disabled && setHovered(ratingValue)}
          >
            {ratingValue}
          </button>
        );
      })}
    </div>
  );
}
