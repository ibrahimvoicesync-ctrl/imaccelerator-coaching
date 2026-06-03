"use client";

/**
 * Phase 48: Searchable, sortable, paginated student list.
 *
 * URL is the source of truth — every sort/search/page change pushes a new URL
 * via the parent's onSortChange/onSearchChange/onPageChange callbacks. Search
 * input maintains a local buffer for typing UX but the canonical search value
 * comes from the URL prop.
 *
 * a11y: real <button> elements for sort headers (Tab/Enter/Space work
 * natively); aria-sort on each <th>; sr-only label paired with the input;
 * Escape key clears the local buffer without re-querying.
 */

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PaginationControls } from "@/components/ui/PaginationControls";
import type {
  CoachStudentRow,
  CoachAnalyticsPagination,
  CoachAnalyticsSort,
} from "@/lib/rpc/coach-analytics-types";

type Props = {
  rows: CoachStudentRow[];
  pagination: CoachAnalyticsPagination;
  sort: CoachAnalyticsSort;
  search: string;
  onSortChange: (next: CoachAnalyticsSort) => void;
  onSearchChange: (next: string) => void;
};

type SortableColumn = {
  key: "name" | "hours" | "emails" | "deals" | "step" | "lastActive";
  label: string;
  align: "left" | "right";
};

const COLUMNS: SortableColumn[] = [
  { key: "name", label: "Name", align: "left" },
  { key: "hours", label: "Hours This Week", align: "right" },
  { key: "emails", label: "Emails This Week", align: "right" },
  { key: "deals", label: "All-Time Deals", align: "right" },
  { key: "step", label: "Roadmap Step", align: "right" },
  { key: "lastActive", label: "Last Active", align: "right" },
];

function getCurrentDirection(
  sort: CoachAnalyticsSort,
  col: SortableColumn["key"],
): "asc" | "desc" | null {
  if (sort === `${col}_asc`) return "asc";
  if (sort === `${col}_desc`) return "desc";
  return null;
}

function nextSort(
  sort: CoachAnalyticsSort,
  col: SortableColumn["key"],
): CoachAnalyticsSort {
  const dir = getCurrentDirection(sort, col);
  if (dir === "asc") return `${col}_desc` as CoachAnalyticsSort;
  // null OR currently desc on this column → asc
  return `${col}_asc` as CoachAnalyticsSort;
}

function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const date = new Date(iso + "T00:00:00Z");
  const now = Date.now();
  const diffMs = now - date.getTime();
  const dayMs = 1000 * 60 * 60 * 24;
  const days = Math.floor(diffMs / dayMs);
  if (days < 0) return "Today";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  // Fallback to "MMM d"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const integerFormatter = new Intl.NumberFormat("en-US");

export function StudentListTable({
  rows,
  pagination,
  sort,
  search,
  onSortChange,
  onSearchChange,
}: Props) {
  const [localSearch, setLocalSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local buffer when URL search changes externally (e.g., back button).
  useEffect(() => {
    setLocalSearch(search);
  }, [search]);

  // Clean up any pending debounce on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function pushSearch(next: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearchChange(next);
    }, 300);
  }

  function handleInputChange(e: ChangeEvent<HTMLInputElement>) {
    setLocalSearch(e.target.value);
    pushSearch(e.target.value);
  }

  function handleClear() {
    setLocalSearch("");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onSearchChange("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      // Escape clears local buffer only — doesn't trigger a server roundtrip.
      setLocalSearch("");
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }

  const isEmpty = rows.length === 0;
  const isSearchEmpty = isEmpty && search.length > 0;
  const isTrulyEmpty = isEmpty && search.length === 0;

  return (
    <Card>
      <CardContent className="p-0">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-ima-border">
          <h2 className="text-base font-semibold text-ima-text">All Students</h2>
          <div className="relative w-full sm:w-72">
            <label htmlFor="coach-analytics-search" className="sr-only">
              Search students by name
            </label>
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ima-text-muted pointer-events-none"
              aria-hidden="true"
            />
            <Input
              id="coach-analytics-search"
              type="search"
              value={localSearch}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Search by name"
              aria-label="Search students by name"
              className="pl-9 pr-10"
            />
            {localSearch.length > 0 ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md text-ima-text-secondary hover:text-ima-text motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Table or empty state */}
        {isTrulyEmpty ? (
          <EmptyState
            title="No assigned students yet"
            description="Once an owner assigns students to you, they'll appear here."
          />
        ) : isSearchEmpty ? (
          <EmptyState
            title={`No matches for "${search}"`}
            description="Try a different name or clear the search."
            action={
              <Button variant="outline" size="sm" onClick={handleClear}>
                Clear search
              </Button>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-ima-border">
                <thead>
                  <tr>
                    {COLUMNS.map((col) => {
                      const dir = getCurrentDirection(sort, col.key);
                      const ariaSort: "ascending" | "descending" | "none" =
                        dir === "asc"
                          ? "ascending"
                          : dir === "desc"
                            ? "descending"
                            : "none";
                      const Chevron =
                        dir === "asc"
                          ? ChevronUp
                          : dir === "desc"
                            ? ChevronDown
                            : ChevronsUpDown;
                      const chevronClass =
                        dir === null
                          ? "text-ima-text-muted"
                          : "text-ima-primary";
                      return (
                        <th
                          key={col.key}
                          scope="col"
                          aria-sort={ariaSort}
                          className={`px-4 py-3 text-xs font-semibold text-ima-text-muted uppercase tracking-wide ${col.align === "right" ? "text-right" : "text-left"}`}
                        >
                          <button
                            type="button"
                            onClick={() => onSortChange(nextSort(sort, col.key))}
                            aria-label={`Sort by ${col.label}, currently ${ariaSort}`}
                            className={`inline-flex items-center gap-1 min-h-[44px] hover:text-ima-text motion-safe:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded ${col.align === "right" ? "ml-auto" : ""}`}
                          >
                            <span>{col.label}</span>
                            <Chevron
                              className={`h-3.5 w-3.5 ${chevronClass}`}
                              aria-hidden="true"
                            />
                          </button>
                        </th>
                      );
                    })}
                    <th
                      scope="col"
                      className="px-4 py-3 text-xs font-semibold text-ima-text-muted uppercase tracking-wide text-left"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ima-border">
                  {rows.map((row) => (
                    <tr
                      key={row.student_id}
                      className="motion-safe:transition-colors hover:bg-ima-surface-light"
                    >
                      <td className="px-4 py-3 max-w-[200px]">
                        <Link
                          href={`/coach/students/${row.student_id}`}
                          className="text-sm font-medium text-ima-primary hover:underline min-h-[44px] inline-flex items-center truncate focus-visible:outline focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-ima-text tabular-nums text-right whitespace-nowrap">
                        {formatHoursMinutes(row.hours_this_week_minutes)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-ima-text tabular-nums text-right whitespace-nowrap">
                        {integerFormatter.format(row.emails_this_week)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-ima-text tabular-nums text-right whitespace-nowrap">
                        {integerFormatter.format(row.deals_alltime)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-ima-text tabular-nums text-right whitespace-nowrap">
                        {row.roadmap_step}
                      </td>
                      <td className="px-4 py-3 text-sm text-ima-text tabular-nums text-right whitespace-nowrap">
                        {row.last_active_date ? (
                          <time dateTime={row.last_active_date}>
                            {formatRelative(row.last_active_date)}
                          </time>
                        ) : (
                          <span className="text-ima-text-muted">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.activity_status === "active" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-ima-success/10 text-ima-success">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-ima-text-muted/10 text-ima-text-secondary">
                            Inactive
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-4 py-3 border-t border-ima-border">
              <PaginationControls
                page={pagination.page}
                totalPages={pagination.total_pages}
                basePath="/coach/analytics"
                searchParams={{ sort, ...(search ? { search } : {}) }}
              />
              {pagination.total_pages <= 1 ? (
                <p className="text-xs text-ima-text-secondary tabular-nums text-right">
                  {pagination.total} {pagination.total === 1 ? "student" : "students"}
                </p>
              ) : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
