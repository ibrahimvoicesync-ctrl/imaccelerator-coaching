import Link from "next/link";

interface CoachCardProps {
  coach: {
    id: string;
    name: string;
    email: string;
    studentCount: number;
    avgRating: number | null;
  };
}

export function CoachCard({ coach }: CoachCardProps) {
  const initials = coach.name
    .split(" ")
    .map((n) => n[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Link
      href={`/owner/coaches/${coach.id}`}
      aria-label={coach.name}
      className="block rounded-[14px] border border-ima-border bg-white p-5 min-h-[128px] motion-safe:transition-[transform,border-color] hover:-translate-y-[1px] hover:border-ima-border focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
    >
      {/* Top row: avatar + name/email */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-ima-surface-light border border-ima-border flex items-center justify-center text-[12px] font-semibold text-ima-text-secondary shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-ima-text truncate leading-tight">
            {coach.name}
          </p>
          <p className="mt-[3px] text-[12px] text-ima-text-secondary truncate">
            {coach.email}
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-ima-surface-light mt-4" aria-hidden="true" />

      {/* Stats row */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <p
            className="text-[10px] font-semibold tracking-[0.14em] text-ima-text-secondary uppercase"
          >
            Students
          </p>
          <p className="mt-[6px] text-[16px] font-semibold text-ima-text tabular-nums slashed-zero tracking-[-0.005em]">
            {coach.studentCount}
          </p>
        </div>
        <div>
          <p
            className="text-[10px] font-semibold tracking-[0.14em] text-ima-text-secondary uppercase"
          >
            Avg Rating (7d)
          </p>
          <p className="mt-[6px] text-[16px] font-semibold text-ima-text tabular-nums slashed-zero tracking-[-0.005em]">
            {coach.avgRating !== null ? coach.avgRating.toFixed(1) : "—"}
          </p>
        </div>
      </div>
    </Link>
  );
}
