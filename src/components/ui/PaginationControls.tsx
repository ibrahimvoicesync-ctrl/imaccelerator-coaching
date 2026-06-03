"use client";

import Link from "next/link";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  basePath: string;
  searchParams?: Record<string, string>;
};

export function PaginationControls({
  page,
  totalPages,
  basePath,
  searchParams = {},
}: PaginationControlsProps) {
  const buildHref = (p: number) => {
    const params = new URLSearchParams({ ...searchParams, page: String(p) });
    return `${basePath}?${params.toString()}`;
  };

  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between mt-6 gap-4">
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg border border-ima-border text-sm font-medium text-ima-text hover:bg-ima-surface-light motion-safe:transition-colors inline-flex items-center justify-center"
        >
          Previous
        </Link>
      ) : (
        <span
          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg border border-ima-border text-sm font-medium text-ima-text-secondary opacity-40 cursor-not-allowed inline-flex items-center justify-center"
          aria-disabled="true"
        >
          Previous
        </span>
      )}
      <span className="text-sm text-ima-text-secondary">
        Page {page} of ~{totalPages}
      </span>
      {page < totalPages ? (
        <Link
          href={buildHref(page + 1)}
          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg border border-ima-border text-sm font-medium text-ima-text hover:bg-ima-surface-light motion-safe:transition-colors inline-flex items-center justify-center"
        >
          Next
        </Link>
      ) : (
        <span
          className="min-h-[44px] min-w-[44px] px-4 py-2 rounded-lg border border-ima-border text-sm font-medium text-ima-text-secondary opacity-40 cursor-not-allowed inline-flex items-center justify-center"
          aria-disabled="true"
        >
          Next
        </span>
      )}
    </nav>
  );
}
