import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="px-4 py-2">
      <div className="space-y-8">
        {/* Header: title + metric pills + button */}
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-4 min-w-0">
            <div>
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-4 w-64 mt-2" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-36 rounded-full" />
              <Skeleton className="h-9 w-40 rounded-full" />
              <Skeleton className="h-9 w-36 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-11 w-28 rounded-lg shrink-0" />
        </div>

        {/* Desktop table skeleton */}
        <div className="hidden md:block overflow-hidden rounded-2xl border border-ima-border bg-white">
          <div className="grid grid-cols-[140px_1fr_1fr_160px_140px_96px] gap-4 px-6 py-3 bg-ima-surface-light border-b border-ima-border">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
            <span />
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="grid grid-cols-[140px_1fr_1fr_160px_140px_96px] gap-4 items-center px-6 h-16 border-b border-ima-border/60 last:border-b-0"
            >
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-2 w-2 rounded-full" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-4 w-24" />
              <span />
            </div>
          ))}
        </div>

        {/* Mobile card skeletons */}
        <ul className="md:hidden space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="rounded-2xl border border-ima-border bg-white px-4 py-4 space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Skeleton className="h-2 w-2 rounded-full shrink-0" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-14 rounded-lg" />
                <Skeleton className="h-14 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
