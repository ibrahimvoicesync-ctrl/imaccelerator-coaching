export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-20 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-80 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-56 rounded bg-ima-surface-light" />
        </div>

        {/* Referral nudge */}
        <div className="mt-9 h-[56px] rounded-[12px] border border-ima-border bg-white motion-safe:animate-pulse" />

        {/* Hero — Today's Work */}
        <div className="mt-[14px] rounded-[14px] border border-ima-border bg-white p-6 md:p-8 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-24 rounded bg-ima-surface-light" />
            <div className="h-4 w-20 rounded bg-ima-surface-light" />
          </div>
          <div className="mt-6 h-[60px] md:h-[72px] w-48 rounded bg-ima-surface-light" />
          <div className="mt-5 h-[6px] w-full rounded-full bg-ima-surface-light" />
        </div>
        <div className="mt-[14px] h-12 rounded-[12px] bg-ima-surface-light motion-safe:animate-pulse" />

        {/* KPI row */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-[14px] border border-ima-border bg-white p-6 motion-safe:animate-pulse"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-[8px] bg-ima-surface-light" />
                  <div className="h-3 w-24 rounded bg-ima-surface-light" />
                </div>
                <div className="h-2 w-2 rounded-full bg-ima-surface-light" />
              </div>
              <div className="mt-5 flex items-baseline justify-between gap-3">
                <div className="h-7 w-20 rounded bg-ima-surface-light" />
                <div className="h-3 w-10 rounded bg-ima-surface-light" />
              </div>
              <div className="mt-[10px] h-3 w-28 rounded bg-ima-surface-light" />
              <div className="mt-4 h-[4px] w-full rounded-full bg-ima-surface-light" />
            </div>
          ))}
        </div>

        {/* Deals compact row */}
        <div className="mt-[14px] grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-[12px] border border-ima-border bg-white px-[18px] py-[16px] min-h-[72px] motion-safe:animate-pulse"
            >
              <div className="h-9 w-9 rounded-[8px] bg-ima-surface-light shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="h-6 w-20 rounded bg-ima-surface-light" />
                <div className="mt-[6px] h-3 w-28 rounded bg-ima-surface-light" />
              </div>
            </div>
          ))}
        </div>

        {/* Roadmap + Daily Report */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-[14px]">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="rounded-[14px] border border-ima-border bg-white p-6 motion-safe:animate-pulse"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-[8px] bg-ima-surface-light" />
                  <div className="min-w-0">
                    <div className="h-4 w-28 rounded bg-ima-surface-light" />
                    <div className="mt-[3px] h-3 w-40 rounded bg-ima-surface-light" />
                  </div>
                </div>
                <div className="h-3 w-10 rounded bg-ima-surface-light" />
              </div>
              <div className="mt-5 h-[6px] w-full rounded-full bg-ima-surface-light" />
              <div className="mt-5 h-4 w-32 rounded bg-ima-surface-light" />
            </div>
          ))}
        </div>

        {/* Referral */}
        <div className="mt-10 h-[120px] rounded-[14px] border border-ima-border bg-white motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
