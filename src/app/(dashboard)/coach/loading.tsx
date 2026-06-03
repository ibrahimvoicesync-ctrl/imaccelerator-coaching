export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Header */}
        <div>
          <div className="h-[14px] w-20 rounded bg-ima-surface-light motion-safe:animate-pulse" />
          <div className="mt-3 h-10 w-72 rounded bg-ima-surface-light motion-safe:animate-pulse" />
          <div className="mt-2 h-4 w-64 rounded bg-ima-surface-light motion-safe:animate-pulse" />
        </div>

        {/* Stats Row A — 3 cards */}
        <div className="mt-9 grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] bg-white border border-ima-border rounded-[12px] motion-safe:animate-pulse"
            />
          ))}
        </div>

        {/* Stats Row B — 4 cards */}
        <div className="mt-[14px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[14px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] bg-white border border-ima-border rounded-[12px] motion-safe:animate-pulse"
            />
          ))}
        </div>

        {/* Feed row */}
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-[14px]">
          <div className="h-[360px] bg-white border border-ima-border rounded-[14px] motion-safe:animate-pulse" />
          <div className="h-[360px] bg-white border border-ima-border rounded-[14px] motion-safe:animate-pulse" />
        </div>
      </div>
    </div>
  );
}
