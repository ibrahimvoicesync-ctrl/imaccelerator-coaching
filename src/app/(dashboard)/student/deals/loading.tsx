export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-14 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-56 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-80 max-w-full rounded bg-ima-surface-light" />
        </div>

        {/* Header row: pills + button */}
        <div className="mt-9 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between motion-safe:animate-pulse">
          <div className="flex flex-wrap gap-2">
            <div className="h-9 w-36 rounded-full bg-ima-surface-light" />
            <div className="h-9 w-40 rounded-full bg-ima-surface-light" />
            <div className="h-9 w-36 rounded-full bg-ima-surface-light" />
          </div>
          <div className="h-11 w-28 rounded-[10px] bg-ima-surface-light shrink-0" />
        </div>

        {/* Desktop table */}
        <div className="mt-8 hidden md:block overflow-hidden rounded-[14px] border border-ima-border bg-white motion-safe:animate-pulse">
          <div className="grid grid-cols-[140px_1fr_1fr_160px_140px_96px] gap-4 px-6 py-3 bg-ima-surface-light border-b border-ima-border">
            {[48, 80, 56, 80, 48].map((w, i) => (
              <div key={i} className="h-3 rounded bg-ima-surface-light" style={{ width: w }} />
            ))}
            <span />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[140px_1fr_1fr_160px_140px_96px] gap-4 items-center px-6 h-16 border-b border-ima-border last:border-b-0"
            >
              <div className="flex items-center gap-2.5">
                <div className="h-2 w-2 rounded-full bg-ima-surface-light" />
                <div className="h-4 w-20 rounded bg-ima-surface-light" />
              </div>
              <div className="h-4 w-24 rounded bg-ima-surface-light" />
              <div className="h-4 w-24 rounded bg-ima-surface-light" />
              <div className="h-6 w-28 rounded-full bg-ima-surface-light" />
              <div className="h-4 w-24 rounded bg-ima-surface-light" />
              <span />
            </div>
          ))}
        </div>

        {/* Mobile cards */}
        <ul className="mt-8 md:hidden space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="rounded-[14px] border border-ima-border bg-white px-4 py-4 space-y-4 motion-safe:animate-pulse"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-2 w-2 rounded-full bg-ima-surface-light shrink-0" />
                  <div className="space-y-1">
                    <div className="h-4 w-20 rounded bg-ima-surface-light" />
                    <div className="h-3 w-24 rounded bg-ima-surface-light" />
                  </div>
                </div>
                <div className="h-6 w-24 rounded-full bg-ima-surface-light" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="h-14 rounded-[10px] bg-ima-surface-light" />
                <div className="h-14 rounded-[10px] bg-ima-surface-light" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
