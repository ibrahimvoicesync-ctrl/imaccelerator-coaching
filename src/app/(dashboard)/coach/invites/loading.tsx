export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        <div className="h-[14px] w-16 rounded bg-ima-surface-light motion-safe:animate-pulse" />
        <div className="mt-3 h-10 w-56 rounded bg-ima-surface-light motion-safe:animate-pulse" />
        <div className="mt-2 h-4 w-80 rounded bg-ima-surface-light motion-safe:animate-pulse" />

        <div className="mt-9 grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[72px] bg-white border border-ima-border rounded-[12px] motion-safe:animate-pulse"
            />
          ))}
        </div>

        <div className="mt-10 h-11 w-56 rounded-[10px] bg-white border border-ima-border motion-safe:animate-pulse" />

        <div className="mt-8 flex gap-1 border-b border-ima-border">
          <div className="h-11 w-32 bg-ima-surface-light rounded-t-md motion-safe:animate-pulse" />
          <div className="h-11 w-32 bg-ima-surface-light rounded-t-md motion-safe:animate-pulse" />
        </div>

        <div className="mt-6 h-[160px] bg-white border border-ima-border rounded-[14px] shadow-card motion-safe:animate-pulse" />

        <div className="mt-8 h-[14px] w-32 rounded bg-ima-surface-light motion-safe:animate-pulse" />
        <div className="mt-4 space-y-[10px]">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-[74px] bg-white border border-ima-border rounded-[14px] shadow-card motion-safe:animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
