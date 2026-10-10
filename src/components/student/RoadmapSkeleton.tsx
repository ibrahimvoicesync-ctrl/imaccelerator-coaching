/**
 * Loading skeleton for the roadmap surface, shared by both student lanes.
 *
 * Mirrors `RoadmapView`: masthead → the current-step card (progress bar,
 * title, description, deadline, big button) → the collapsed "See all steps"
 * row. The full step list is collapsed by default, so it isn't reserved.
 *
 * Per `04-sections/states-and-feedback.md`: if you change the page's layout,
 * change this in the same commit.
 */
export function RoadmapSkeleton() {
  return (
    <div className="-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg">
      <div className="mx-auto max-w-[880px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        {/* Masthead */}
        <div className="motion-safe:animate-pulse">
          <div className="h-[11px] w-20 rounded bg-ima-surface-light" />
          <div className="mt-3 h-9 w-64 max-w-full rounded bg-ima-surface-light" />
          <div className="mt-3 h-[3px] w-10 rounded-full bg-ima-surface-light" />
          <div className="mt-3 h-4 w-96 max-w-full rounded bg-ima-surface-light" />
        </div>

        {/* Current step */}
        <div className="mt-9 rounded-[14px] border border-ima-border bg-white shadow-card p-6 md:p-10 motion-safe:animate-pulse">
          <div className="flex items-center justify-between gap-3">
            <div className="h-3 w-24 rounded bg-ima-surface-light" />
            <div className="h-3 w-12 rounded bg-ima-surface-light" />
          </div>
          <div className="mt-3 h-[6px] w-full rounded-full bg-ima-surface-light" />
          <div className="mt-8 h-8 w-3/4 rounded bg-ima-surface-light" />
          <div className="mt-4 h-4 w-full rounded bg-ima-surface-light" />
          <div className="mt-2 h-4 w-2/3 rounded bg-ima-surface-light" />
          <div className="mt-5 h-6 w-28 rounded-full bg-ima-surface-light" />
          <div className="mt-8 h-[60px] w-full rounded-full bg-ima-surface-light" />
        </div>

        {/* See all steps */}
        <div className="mt-[14px] h-[60px] rounded-[14px] border border-ima-border bg-white shadow-card motion-safe:animate-pulse" />
      </div>
    </div>
  );
}
