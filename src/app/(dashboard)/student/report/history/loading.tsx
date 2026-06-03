export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-3xl px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Back link */}
        <div className="h-4 w-28 rounded bg-ima-surface-light motion-safe:animate-pulse" />

        {/* Masthead */}
        <div className="mt-4 motion-safe:animate-pulse">
          <div className="h-[11px] w-28 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-56 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-64 rounded bg-ima-surface-light" />
        </div>

        {/* Report cards */}
        <div className="mt-9 space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[14px] border border-ima-border bg-white p-6 space-y-3 motion-safe:animate-pulse"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="h-4 w-48 rounded bg-ima-surface-light" />
                <div className="h-3 w-20 rounded bg-ima-surface-light" />
              </div>
              <div className="flex gap-2">
                <div className="h-5 w-16 rounded-full bg-ima-surface-light" />
                <div className="h-5 w-24 rounded-full bg-ima-surface-light" />
              </div>
              <div className="h-3 w-full rounded bg-ima-surface-light" />
              <div className="h-3 w-3/4 rounded bg-ima-surface-light" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
