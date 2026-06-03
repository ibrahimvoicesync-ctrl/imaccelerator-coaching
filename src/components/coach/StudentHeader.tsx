import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface StudentHeaderProps {
  student: {
    name: string;
    email: string;
    joined_at: string;
    status: string;
  };
  isAtRisk: boolean;
  atRiskReasons: string[];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function StudentHeader({ student, isAtRisk, atRiskReasons }: StudentHeaderProps) {
  const joinDate = new Date(student.joined_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-5 motion-safe:animate-fadeIn">
      {/* Back link */}
      <Link
        href="/coach/students"
        className="inline-flex items-center gap-1 text-xs font-medium text-ima-primary hover:text-ima-primary-hover min-h-[44px] w-fit focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md px-1"
      >
        <ChevronLeft className="h-[14px] w-[14px]" aria-hidden="true" />
        All students
      </Link>

      {/* Eyebrow */}
      <div>
        <p
          className="text-xs font-semibold tracking-[0.2em] text-ima-text-secondary uppercase"
        >
          Student Profile
        </p>

        {/* Identity row */}
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center text-lg font-semibold text-ima-text-secondary shrink-0">
              {initials(student.name)}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-semibold leading-tight text-ima-text tracking-tight truncate">
                {student.name}
              </h1>
              <p className="mt-1 text-sm text-ima-text-secondary truncate">{student.email}</p>
              <p
                className="mt-1 text-[10px] font-medium text-ima-text-secondary tracking-widest uppercase"
              >
                Joined {joinDate}
              </p>
            </div>
          </div>

          {/* Status + risk pills */}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {student.status === "suspended" && (
              <span className="inline-flex items-center px-2 py-[3px] rounded-full bg-ima-warning/10 border border-ima-warning/10 text-[10px] font-semibold uppercase tracking-wider text-ima-warning">
                Suspended
              </span>
            )}
            {isAtRisk && (
              <span className="inline-flex items-center px-2 py-[3px] rounded-full bg-ima-error/10 border border-ima-error/10 text-[10px] font-semibold uppercase tracking-wider text-ima-error">
                At Risk
              </span>
            )}
          </div>
        </div>

        {/* Risk reason line */}
        {isAtRisk && atRiskReasons.length > 0 && (
          <p
            className="mt-4 text-[10px] font-medium text-ima-warning tracking-widest uppercase"
          >
            {atRiskReasons.join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
