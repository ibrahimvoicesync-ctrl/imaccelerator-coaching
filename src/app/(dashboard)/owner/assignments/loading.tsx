import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="space-y-6 px-4">
      {/* Page header */}
      <div>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-56 mt-2" />
      </div>

      {/* Stat row — 3 cards */}
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-ima-border rounded-[12px] p-4 space-y-1"
          >
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Coach capacity cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-ima-border rounded-[12px] p-4 space-y-1"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-6 w-8" />
          </div>
        ))}
      </div>

      {/* Student assignment list */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-white border border-ima-border rounded-[12px] p-4 flex items-center gap-4"
          >
            <Skeleton className="h-4 w-32 flex-1" />
            <Skeleton className="h-11 w-48 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
