/**
 * Skeleton for the full calendar. Mirrors CalendarView's chrome: back link,
 * masthead, toolbar, and the grid pane (`h-[calc(100vh-320px)]`).
 */
export default function Loading() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[1600px] px-6 md:px-10 pt-8 md:pt-10 pb-12 motion-safe:animate-pulse">
        <div className="h-[44px] w-32 rounded-lg bg-ima-surface-light" />
        <div className="mt-3 h-3 w-20 rounded bg-ima-surface-light" />
        <div className="mt-3 h-9 w-72 max-w-full rounded bg-ima-surface-light" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-ima-surface-light" />
        <div className="mt-8 flex flex-wrap gap-[10px]">
          <div className="h-11 w-20 rounded-lg bg-ima-surface-light" />
          <div className="h-11 w-24 rounded-lg bg-ima-surface-light" />
          <div className="h-11 w-52 rounded-[12px] bg-ima-surface-light" />
        </div>
        <div className="mt-[14px] h-[calc(100vh-320px)] min-h-[480px] rounded-[14px] border border-ima-border bg-white shadow-card" />
      </div>
    </div>
  );
}
