import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The single dominant CTA on a student dashboard — the one element a student
 * should be able to hit without looking.
 *
 * Deliberately larger and heavier than `Button size="lg"` (64px tall, font-bold);
 * see docs/design/04-sections/card-surfaces.md § Primary CTA card. It is shared by
 * the `student` and `student_diy` lanes so the two stay 1:1, per
 * docs/design/01-project-brief.md. The *label/href logic* stays per-lane —
 * student_diy has no daily report, so its terminal branch differs.
 */
export function NextActionButton({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group inline-flex items-center justify-center gap-3 w-full rounded-[14px] bg-ima-primary text-white text-[15px] md:text-[17px] font-bold tracking-tight min-h-[60px] md:min-h-[64px] px-6 motion-safe:transition-all motion-safe:duration-200 ease-expo-out hover:bg-ima-primary-hover hover:shadow-[0_14px_32px_-14px_rgba(37,99,235,0.65)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
    >
      {label}
      <ArrowRight
        className="h-5 w-5 motion-safe:transition-transform duration-200 ease-expo-out group-hover:translate-x-1"
        aria-hidden="true"
      />
    </Link>
  );
}
