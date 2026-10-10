/**
 * Skeleton for /student_diy. Mirrors the real page's geometry block-for-block.
 *
 * Shares the masthead and hero with /student (the two lanes are 1:1 there), then
 * diverges: DIY has a 3-up deals row and a full-width roadmap instead of the
 * student lane's Roadmap + Daily Report pair, because DIY has no daily reports.
 *
 * If you change the dashboard's section order or grid, change this in the same
 * commit. See docs/design/04-sections/states-and-feedback.md.
 *
 * Conditional blocks (CoachNoteCard) are deliberately omitted — reserving space
 * for a block that's usually absent would jump every load.
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

        {/* Hero — Today's Work + next-action CTA (left) / Consistency (right) */}
        <div className="mt-9 grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-[14px] items-start">
          <div className="flex flex-col gap-5">
            <div className="rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
              <div className="flex items-center justify-between gap-3">
                <div className="h-3 w-24 rounded bg-ima-surface-light" />
                <div className="h-4 w-20 rounded bg-ima-surface-light" />
              </div>
              <div className="mt-6 h-[60px] md:h-[72px] w-48 rounded bg-ima-surface-light" />
              <div className="mt-5 h-[6px] w-full rounded-full bg-ima-surface-light" />
            </div>
            <div className="h-[60px] md:h-[64px] rounded-[14px] bg-ima-surface-light motion-safe:animate-pulse" />
          </div>

          {/* Consistency — label / streak metric / headline / 7-day dot strip */}
          <div className="rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
            <div className="flex items-center justify-between gap-3">
              <div className="h-3 w-28 rounded bg-ima-surface-light" />
              <div className="h-3 w-14 rounded bg-ima-surface-light" />
            </div>
            <div className="mt-5 h-[44px] md:h-[52px] w-24 rounded bg-ima-surface-light" />
            <div className="mt-3 h-4 w-40 max-w-full rounded bg-ima-surface-light" />
            <div className="mt-6 flex items-center justify-between max-w-[280px]">
              {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <div className="h-[14px] w-[14px] rounded-full bg-ima-surface-light" />
                  <div className="h-3 w-2 rounded bg-ima-surface-light" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Deals — 3-up compact stat cards */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-[14px]">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-4 rounded-[12px] border border-ima-border bg-white px-[18px] py-[16px] min-h-[72px] motion-safe:animate-pulse"
            >
              <div className="h-9 w-9 rounded-[8px] bg-ima-surface-light shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="h-6 w-20 rounded bg-ima-surface-light" />
                <div className="mt-[6px] h-3 w-28 rounded bg-ima-surface-light" />
              </div>
            </div>
          ))}
        </div>

        {/* Roadmap — full width (no Daily Report pair in the DIY lane) */}
        <div className="mt-10 rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-9 w-9 rounded-[8px] bg-ima-surface-light" />
              <div className="min-w-0">
                <div className="h-4 w-28 rounded bg-ima-surface-light" />
                <div className="mt-[3px] h-3 w-40 rounded bg-ima-surface-light" />
              </div>
            </div>
            <div className="h-5 w-16 rounded-full bg-ima-surface-light" />
          </div>
          <div className="mt-6 h-[60px] md:h-[72px] w-40 rounded bg-ima-surface-light" />
          <div className="mt-5 h-[6px] w-full rounded-full bg-ima-surface-light" />
        </div>

        {/* Hours this week — 200px recharts canvas */}
        <div className="mt-[14px] rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-8 motion-safe:animate-pulse">
          <div className="mb-5 flex items-baseline justify-between gap-3">
            <div className="h-3 w-32 rounded bg-ima-surface-light" />
            <div className="h-4 w-16 rounded bg-ima-surface-light" />
          </div>
          <div className="h-[200px] w-full rounded bg-ima-surface-light" />
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
