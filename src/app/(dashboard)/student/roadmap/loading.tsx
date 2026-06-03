import { ROADMAP_STEPS } from "@/lib/config";

export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-20 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-64 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-80 max-w-full rounded bg-ima-surface-light" />
        </div>

        {/* Hero — Overall Progress */}
        <div className="mt-9 rounded-[14px] border border-ima-border bg-white p-6 md:p-8 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-28 rounded bg-ima-surface-light" />
            <div className="h-4 w-24 rounded bg-ima-surface-light" />
          </div>
          <div className="mt-6 h-[60px] md:h-[72px] w-40 rounded bg-ima-surface-light" />
          <div className="mt-5 h-[6px] w-full rounded-full bg-ima-surface-light" />
        </div>

        {/* Stage row */}
        <div className="mt-[14px] grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-[14px] border border-ima-border bg-white p-6 motion-safe:animate-pulse"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="h-3 w-24 rounded bg-ima-surface-light" />
                <div className="h-2 w-2 rounded-full bg-ima-surface-light" />
              </div>
              <div className="mt-5 flex items-baseline justify-between gap-3">
                <div className="h-7 w-16 rounded bg-ima-surface-light" />
                <div className="h-3 w-10 rounded bg-ima-surface-light" />
              </div>
              <div className="mt-[10px] h-3 w-32 rounded bg-ima-surface-light" />
              <div className="mt-4 h-[4px] w-full rounded-full bg-ima-surface-light" />
            </div>
          ))}
        </div>

        {/* Current step card */}
        <div className="mt-10 rounded-[14px] border border-ima-border bg-white p-6 md:p-8 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-28 rounded bg-ima-surface-light" />
            <div className="h-3 w-16 rounded bg-ima-surface-light" />
          </div>
          <div className="mt-4 h-3 w-32 rounded bg-ima-surface-light" />
          <div className="mt-2 h-6 w-3/4 max-w-[360px] rounded bg-ima-surface-light" />
          <div className="mt-3 h-4 w-full max-w-[480px] rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-2/3 rounded bg-ima-surface-light" />
        </div>

        {/* Timeline card */}
        <div className="mt-10 rounded-[14px] border border-ima-border bg-white p-6 md:p-8 motion-safe:animate-pulse">
          <div className="space-y-4">
            {Array.from({ length: ROADMAP_STEPS.length }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-full bg-ima-surface-light shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-ima-surface-light" />
                  <div className="h-3 w-1/2 rounded bg-ima-surface-light" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
