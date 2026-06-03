import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { CoachNote } from "@/lib/coach-comment";

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CoachNoteCard({ note, basePath }: { note: CoachNote; basePath: string }) {
  const when = formatDistanceToNow(new Date(note.created_at), { addSuffix: true });
  // Recency proxy for "new" — avoids needing a read-state column.
  const isNew = Date.now() - new Date(note.created_at).getTime() < 48 * 60 * 60 * 1000;

  return (
    <section
      aria-labelledby="coach-note-label"
      className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <p
          id="coach-note-label"
          className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted"
        >
          From your coach
        </p>
        {isNew && (
          <span className="inline-flex items-center rounded-full bg-ima-surface-accent px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-primary">
            New
          </span>
        )}
      </div>

      <p className="text-[15px] leading-relaxed text-ima-text">{note.comment}</p>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full bg-ima-primary text-xs font-semibold text-white"
            aria-hidden="true"
          >
            {initials(note.coach_name)}
          </div>
          <p className="text-sm font-medium text-ima-text">{note.coach_name}</p>
          <span className="text-[11px] text-ima-text-muted">· {when}</span>
        </div>
        <Link
          href={`${basePath}/report/history`}
          className="group inline-flex items-center gap-1.5 text-[13px] font-semibold text-ima-primary hover:text-ima-primary-hover min-h-[44px] rounded-md focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
        >
          All feedback
          <ArrowRight
            className="h-3.5 w-3.5 motion-safe:transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}
