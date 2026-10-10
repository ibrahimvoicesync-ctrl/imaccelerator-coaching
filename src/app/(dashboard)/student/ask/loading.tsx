export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[880px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-12 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-72 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-96 max-w-full rounded bg-ima-surface-light" />
        </div>

        {/* Iframe placeholder */}
        <div className="mt-9 h-[600px] rounded-[14px] border border-ima-border bg-white shadow-card motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
