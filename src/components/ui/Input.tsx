import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
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
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={errorId}
          className={cn(
            "w-full h-11 px-3 bg-ima-surface border border-ima-border rounded-lg text-ima-text placeholder:text-ima-text-secondary focus:outline-none focus:ring-2 focus:ring-ima-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed",
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

Input.displayName = "Input";
