export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading coach analytics"
      className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg"
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div
              className="h-[14px] w-20 rounded bg-ima-surface-light motion-safe:animate-pulse"
              aria-hidden="true"
            />
            <div
              className="mt-3 h-10 w-72 rounded bg-ima-surface-light motion-safe:animate-pulse"
              aria-hidden="true"
            />
            <div
              className="mt-2 h-4 w-80 rounded bg-ima-surface-light motion-safe:animate-pulse"
              aria-hidden="true"
            />
          </div>
          <div
            className="h-11 w-32 rounded-[10px] bg-white border border-ima-border motion-safe:animate-pulse"
            aria-hidden="true"
          />
        </div>

        {/* 5 KPI cards */}
        <div className="mt-9 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[14px]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] bg-white border border-ima-border rounded-[12px] motion-safe:animate-pulse"
              aria-hidden="true"
            />
          ))}
        </div>

        {/* 3 leaderboards */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-[14px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[300px] bg-white border border-ima-border rounded-[14px] motion-safe:animate-pulse"
              aria-hidden="true"
            />
          ))}
        </div>

        {/* Chart */}
        <div
          className="mt-8 h-[380px] bg-white border border-ima-border rounded-[14px] motion-safe:animate-pulse"
          aria-hidden="true"
        />

        {/* Student list */}
        <div
          className="mt-8 h-[720px] bg-white border border-ima-border rounded-[14px] motion-safe:animate-pulse"
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
