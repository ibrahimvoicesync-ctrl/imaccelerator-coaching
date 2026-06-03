/**
 * Phase 54: Loading skeleton for /owner/analytics.
 */
export default function OwnerAnalyticsLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="px-4 py-6 max-w-7xl mx-auto"
    >
      <div className="h-8 w-56 rounded bg-ima-surface-light motion-safe:animate-pulse" />
      <div className="mt-2 h-4 w-72 rounded bg-ima-surface-light motion-safe:animate-pulse" />
      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-lg border border-ima-border bg-white p-4"
          >
            <div className="h-5 w-40 rounded bg-ima-surface-light motion-safe:animate-pulse" />
            <div className="mt-2 h-3 w-52 rounded bg-ima-surface-light motion-safe:animate-pulse" />
            <div className="mt-4 space-y-2">
              {[0, 1, 2].map((r) => (
                <div
                  key={r}
                  className="h-11 rounded bg-ima-surface-light motion-safe:animate-pulse"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading owner analytics…</span>
    </section>
  );
}
