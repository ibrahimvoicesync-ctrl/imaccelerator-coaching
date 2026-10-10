/**
 * Skeleton for /student_diy/work.
 *
 * The page is `max-w-[1200px]`: a right-aligned ReminderBell header plus
 * <WorkTrackerClient>, a single centered 760px column — the big view tabs
 * (Timer / My day) over one panel. The Timer panel is the default view,
 * so we mirror its start card. There is deliberately no masthead.
 *
 * See docs/design/04-sections/states-and-feedback.md.
 */
export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Header — reminder bell, right-aligned */}
        <div className="mx-auto flex max-w-[880px] items-center justify-end motion-safe:animate-pulse">
          <div className="h-11 w-11 rounded-lg bg-ima-surface-light" />
        </div>

        <div className="mx-auto mt-5 max-w-[880px] motion-safe:animate-pulse">
          {/* View tabs */}
          <div className="grid grid-cols-2 gap-[10px]">
            {[0, 1].map((i) => (
              <div key={i} className="h-[64px] rounded-[14px] border border-ima-border bg-white shadow-card" />
            ))}
          </div>

          {/* Timer card */}
          <div className="mt-5 rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-10">
            <div className="flex items-center justify-between gap-3">
              <div className="h-3 w-16 rounded bg-ima-surface-light" />
              <div className="h-4 w-24 rounded bg-ima-surface-light" />
            </div>
            <div className="mt-3 h-[6px] w-full rounded-full bg-ima-surface-light" />
            <div className="mt-8 rounded-[18px] bg-ima-surface-light p-6 md:p-8">
              <div className="mx-auto h-3 w-32 max-w-full rounded bg-white/70" />
              <div className="mx-auto mt-3 h-4 w-64 max-w-full rounded bg-white/70" />
              <div className="mt-6 h-[72px] md:h-[80px] w-full rounded-full bg-white/70" />
              <div className="mx-auto mt-4 h-[44px] w-36 rounded-[10px] bg-white/70" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
