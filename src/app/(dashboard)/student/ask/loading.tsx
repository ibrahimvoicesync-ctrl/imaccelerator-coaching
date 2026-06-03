export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-12 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-72 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-96 max-w-full rounded bg-ima-surface-light" />
        </div>

        {/* Iframe placeholder */}
        <div className="mt-9 h-[600px] rounded-[14px] border border-ima-border bg-white motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
