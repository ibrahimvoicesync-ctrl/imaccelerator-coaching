/**
 * Skeleton for /student. Mirrors the real page's geometry block-for-block —
 * same wrapper, same grid ratios, same mt- rhythm, same radii — so the swap to
 * real content doesn't shift layout (CLS).
 *
 * If you change the dashboard's section order or grid, change this in the same
 * commit. See docs/design/04-sections/states-and-feedback.md.
 *
 * Conditional blocks (CoachNoteCard) are deliberately omitted: they're absent
 * more often than present, so reserving space for them would jump every load.
 */
export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[880px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Masthead — eyebrow / h1 / blue rule / lede */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-20 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-80 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-3 h-[3px] w-10 rounded-full bg-ima-surface-light" />
          <div className="mt-3 h-4 w-56 rounded bg-ima-surface-light" />
        </div>

        {/* Hero — Today's Work (metric switch + metric) + next-action CTA */}
        <div className="mt-9 flex flex-col gap-5">
          <div className="rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
            <div className="flex gap-[14px] md:gap-[18px]">
              <div className="h-[98px] w-[54px] shrink-0 rounded-full bg-ima-surface-light" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3">
                  <div className="h-3 w-24 rounded bg-ima-surface-light" />
                  <div className="h-4 w-20 rounded bg-ima-surface-light" />
                </div>
                <div className="mt-6 h-[60px] md:h-[72px] w-48 rounded bg-ima-surface-light" />
                <div className="mt-5 h-[6px] w-full rounded-full bg-ima-surface-light" />
                <div className="mt-[14px] h-3 w-56 max-w-full rounded bg-ima-surface-light" />
              </div>
            </div>
          </div>
          <div className="h-[60px] md:h-[64px] rounded-[14px] bg-ima-surface-light motion-safe:animate-pulse" />
        </div>

        {/* Weekly chart (emails by default) — 200px recharts canvas */}
        <div className="mt-[14px] rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <div className="h-3 w-32 rounded bg-ima-surface-light" />
            <div className="h-4 w-16 rounded bg-ima-surface-light" />
          </div>
          <div className="h-[200px] w-full rounded bg-ima-surface-light" />
        </div>

        {/* At a glance — report / steps / streak rows */}
        <div className="mt-[14px] rounded-[14px] border border-ima-border bg-white shadow-card overflow-hidden motion-safe:animate-pulse">
          <div className="px-6 pt-5 pb-2">
            <div className="h-3 w-24 rounded bg-ima-surface-light" />
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-[14px] px-6 min-h-[72px] border-t border-ima-border first:border-t-0">
              <div className="h-9 w-9 rounded-[8px] bg-ima-surface-light" />
              <div className="flex-1">
                <div className="h-4 w-28 rounded bg-ima-surface-light" />
                <div className="mt-[6px] h-3 w-48 max-w-full rounded bg-ima-surface-light" />
              </div>
              <div className="h-5 w-14 rounded-full bg-ima-surface-light" />
            </div>
          ))}
        </div>

        {/* Weekly leaderboard */}
        <div className="mt-[14px] rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <div className="h-3 w-36 rounded bg-ima-surface-light" />
            <div className="h-4 w-16 rounded bg-ima-surface-light" />
          </div>
          <div className="h-6 w-52 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-[6px] h-3 w-40 max-w-full rounded bg-ima-surface-light" />
        </div>
      </div>
    </div>
  );
}
