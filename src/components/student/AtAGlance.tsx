import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type GlanceRow = {
  icon: LucideIcon;
  label: string;
  detail: string;
  /** Short status on the right, e.g. "Sent" / "Not yet". */
  status?: { text: string; tone: "done" | "todo" | "neutral" };
  href?: string;
};

/**
 * One quiet card of single-line rows for everything that isn't today's main
 * number — the report, the roadmap, the streak. Replaces three full cards so
 * the dashboard has one obvious thing to look at.
 */
export function AtAGlance({ rows }: { rows: GlanceRow[] }) {
  return (
    <section
      aria-labelledby="glance-label"
      className="bg-white border border-ima-border rounded-[14px] shadow-card overflow-hidden"
    >
      <p
        id="glance-label"
        className="px-6 pt-5 pb-2 text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
      >
        At a glance
      </p>
      <ul className="divide-y divide-ima-border">
        {rows.map((row) => {
          const Icon = row.icon;
          const inner = (
            <>
              <span className="flex h-9 w-9 items-center justify-center rounded-[8px] bg-ima-surface-light shrink-0">
                <Icon className="h-[18px] w-[18px] text-ima-text-secondary" aria-hidden="true" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[15px] font-semibold text-ima-text leading-tight">{row.label}</span>
                <span className="mt-[3px] block text-[13px] text-ima-text-secondary leading-snug">{row.detail}</span>
              </span>
              {row.status && (
                <span
                  className={cn(
                    "shrink-0 px-2 py-[3px] rounded-full text-[10px] font-semibold uppercase tracking-[0.08em]",
                    row.status.tone === "done" && "bg-ima-success/10 text-ima-success",
                    row.status.tone === "todo" && "bg-ima-surface-light text-ima-text-secondary",
                    row.status.tone === "neutral" && "bg-ima-surface-light text-ima-text",
                  )}
                >
                  {row.status.text}
                </span>
              )}
              {row.href && <ChevronRight className="h-4 w-4 text-ima-text-secondary shrink-0" aria-hidden="true" />}
            </>
          );
          return (
            <li key={row.label}>
              {row.href ? (
                <Link
                  href={row.href}
                  className="flex items-center gap-[14px] px-6 min-h-[72px] py-3 hover:bg-ima-surface-light motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:-outline-offset-2"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-center gap-[14px] px-6 min-h-[72px] py-3">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
