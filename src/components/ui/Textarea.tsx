import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, rows = 3, ...props }, ref) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = error ? `${inputId}-error` : undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-ima-text-secondary">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          rows={rows}
          aria-invalid={!!error}
          aria-describedby={errorId}
          className={cn(
            "w-full min-h-[44px] px-3 py-2 bg-ima-surface border border-ima-border rounded-lg text-ima-text placeholder:text-ima-text-secondary focus:outline-none focus:ring-2 focus:ring-ima-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none",
            error && "border-ima-error focus:ring-ima-error",
            className
          )}
          {...props}
        />
        {error && <p id={errorId} role="alert" className="text-xs text-ima-error">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
