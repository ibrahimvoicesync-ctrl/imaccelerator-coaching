import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva("rounded-xl", {
  variants: {
    variant: {
      default: "bg-ima-surface border border-ima-border shadow-sm",
      warm: "bg-ima-surface-light border border-ima-border shadow-sm",
      accent: "bg-ima-surface-accent border border-ima-border shadow-sm",
    },
    interactive: {
      true: "hover:shadow-md hover:-translate-y-0.5 motion-safe:transition-all motion-safe:duration-200 cursor-pointer",
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
