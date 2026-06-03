import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div className="px-4">
      {/* Back link */}
      <Skeleton className="h-4 w-24" />

      {/* Student header */}
      <div className="flex items-center gap-4 mt-4">
        <Skeleton className="h-12 w-12 rounded-full shrink-0" />
        <div className="space-y-1">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>

      {/* Assignment dropdown */}
      <Skeleton className="h-11 w-48 rounded-lg mt-4" />

      {/* Tab bar */}
      <div className="flex gap-4 border-b border-ima-border mt-6 pb-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-20" />
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-6 space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}
