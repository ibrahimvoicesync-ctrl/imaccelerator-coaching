export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20 space-y-8">
        {/* Header */}
        <div>
          <div className="h-[14px] w-16 rounded bg-ima-surface-light motion-safe:animate-pulse" />
          <div className="mt-3 h-10 w-60 rounded bg-ima-surface-light motion-safe:animate-pulse" />
          <div className="mt-2 h-4 w-96 rounded bg-ima-surface-light motion-safe:animate-pulse" />
        </div>

        {/* Summary + filter bar */}
        <div className="h-[72px] bg-white border border-ima-border rounded-[14px] motion-safe:animate-pulse" />

        {/* Alert card skeletons */}
        <div className="space-y-[10px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[130px] bg-white border border-ima-border rounded-[14px] motion-safe:animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
