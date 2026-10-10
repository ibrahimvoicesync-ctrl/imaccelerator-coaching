export default function AnalyticsLoading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16 space-y-10">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-32 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-72 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-80 max-w-full rounded bg-ima-surface-light" />
        </div>

        {/* Hero — Lifetime Hours */}
        <div className="rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-32 rounded bg-ima-surface-light" />
            <div className="h-5 w-28 rounded-full bg-ima-surface-light" />
          </div>
          <div className="mt-6 h-16 md:h-20 w-56 rounded bg-ima-surface-light" />
        </div>

        {/* KPI strip */}
        <section aria-busy="true" aria-label="Loading lifetime totals" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[14px]">
          <span className="sr-only">Loading analytics</span>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-start gap-4 rounded-[12px] border border-ima-border bg-white px-[18px] py-[16px] min-h-[72px] motion-safe:animate-pulse"
            >
              <div className="h-9 w-9 rounded-[8px] bg-ima-surface-light shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="h-6 w-20 rounded bg-ima-surface-light" />
                <div className="mt-[8px] h-3 w-24 rounded bg-ima-surface-light" />
              </div>
            </div>
          ))}
        </section>

        {/* Trend cards */}
        <section aria-busy="true" aria-label="Loading trend charts" className="grid grid-cols-1 lg:grid-cols-2 gap-[14px]">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[14px] border border-ima-border bg-white shadow-card p-5 md:p-6 motion-safe:animate-pulse"
            >
              <div className="flex items-baseline justify-between gap-3 mb-5">
                <div className="h-3 w-24 rounded bg-ima-surface-light" />
                <div className="h-3 w-16 rounded bg-ima-surface-light" />
              </div>
              <div className="h-[240px] w-full rounded bg-ima-surface-light" />
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
