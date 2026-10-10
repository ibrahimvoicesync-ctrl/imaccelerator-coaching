import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Spinner } from "./Spinner";

export const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ima-bg disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "bg-ima-primary text-white hover:bg-ima-primary-hover",
        secondary: "bg-ima-surface-light text-ima-text border border-ima-border hover:bg-ima-border",
        ghost: "bg-transparent text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text",
        danger: "bg-ima-error text-white hover:bg-ima-error/80",
        outline: "bg-transparent text-ima-primary border border-ima-primary hover:bg-ima-primary/10",
      },
      size: {
        sm: "min-h-[44px] px-3 text-xs rounded-md gap-1.5",
        md: "h-11 px-4 text-sm rounded-lg gap-2",
        lg: "h-12 px-6 text-base rounded-lg gap-2",
        icon: "h-11 w-11 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading = false, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), "relative", className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* Children stay in the layout (via display:contents) so the button's
            resting width is preserved when loading swaps in the spinner. When
            loading, visibility:hidden is inherited to the children — they
            reserve their box without rendering. */}
        <span className={cn("contents", loading && "invisible")}>{children}</span>
        {loading && (
          <span
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            <Spinner size="sm" className="text-current" />
          </span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";
