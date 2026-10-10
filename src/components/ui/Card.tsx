import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// 14px is the house card radius (docs/design/05-style-guide.md § Border Radius) —
// it matches the ~145 hand-rolled `rounded-[14px]` shells this primitive shares
// pages with. `rounded-xl` (12px) left the two systems visibly out of step.
const cardVariants = cva("rounded-[14px]", {
  variants: {
    variant: {
      default: "bg-ima-surface border border-ima-border shadow-card",
      warm: "bg-ima-surface-light border border-ima-border shadow-card",
      accent: "bg-ima-surface-accent border border-ima-border shadow-card",
    },
    interactive: {
      true: "hover:shadow-card-hover hover:-translate-y-0.5 motion-safe:transition-all motion-safe:duration-200 cursor-pointer",
      false: "",
    },
  },
  defaultVariants: {
    variant: "default",
    interactive: false,
  },
});

export type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>;

interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ variant, interactive }), className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold text-ima-text", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-ima-text-secondary mt-1", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0 flex items-center gap-3", className)} {...props} />;
}
