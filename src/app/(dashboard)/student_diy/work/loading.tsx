export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-24 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-56 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-48 rounded bg-ima-surface-light" />
        </div>

        {/* Hero — metric + bar */}
        <div className="mt-9 rounded-[14px] border border-ima-border bg-white p-6 md:p-8 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-32 rounded bg-ima-surface-light" />
            <div className="h-5 w-20 rounded-full bg-ima-surface-light" />
          </div>
          <div className="mt-5 h-16 md:h-20 w-56 rounded bg-ima-surface-light" />
          <div className="mt-5 h-[6px] w-full rounded-full bg-ima-surface-light" />
        </div>

        {/* Session list */}
        <div className="mt-10 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-[88px] rounded-[14px] border border-ima-border bg-white motion-safe:animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
