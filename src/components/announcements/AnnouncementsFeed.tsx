"use client";

/**
 * Phase 56: The scrollable announcements list with inline-create + Load more.
 *
 * Server component (AnnouncementsPage) fetches the first 25 rows and passes
 * them in via initialItems. This client component:
 *  - Tracks the current list (initialItems + any Load more appends).
 *  - Toggles an inline create panel above the list for owner/coach.
 *  - Handles Load more pagination against GET /api/announcements?page=N.
 *  - Handles optimistic updates from card edits + deletes.
 *  - Renders the correct role-aware empty state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Megaphone } from "lucide-react";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { AnnouncementCard } from "./AnnouncementCard";
import { AnnouncementForm } from "./AnnouncementForm";
import type {
  Announcement,
  AnnouncementsPageRole,
} from "./announcement-types";

interface AnnouncementsFeedProps {
  role: AnnouncementsPageRole;
  currentUserId: string; // reserved for future ownership UI gating — defense in depth
  initialItems: Announcement[];
  initialHasMore: boolean;
}

export function AnnouncementsFeed({
  role,
  initialItems,
  initialHasMore,
}: AnnouncementsFeedProps) {
  const [items, setItems] = useState<Announcement[]>(initialItems);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1); // page 1 was the SSR fetch
  const [showCreate, setShowCreate] = useState(false);
  const { toast } = useToast();
  // Stable ref so handleLoadMore doesn't rebind on every toast identity change
  // (pattern from CLAUDE.md §Code Quality "Stable useCallback deps").
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const canAuthor = role === "owner" || role === "coach";

  const handleCreateSuccess = useCallback((fresh: Announcement) => {
    setItems((prev) => [fresh, ...prev]);
    setShowCreate(false);
  }, []);

  const handleUpdated = useCallback((updated: Announcement) => {
    setItems((prev) =>
      prev.map((item) => (item.id === updated.id ? updated : item))
    );
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const response = await fetch(`/api/announcements?page=${nextPage}`, {
        method: "GET",
      });
      if (!response.ok) {
        toastRef.current({
          type: "error",
          title: "Could not load more announcements. Try again.",
        });
        console.error(
          `[AnnouncementsFeed] GET /api/announcements?page=${nextPage} failed with status ${response.status}`
        );
        return;
      }
      const data = (await response.json()) as {
        items: Announcement[];
        hasMore: boolean;
        total: number;
      };
      setItems((prev) => {
        // Dedupe by id in case a row was inserted server-side between fetches.
        const existing = new Set(prev.map((i) => i.id));
        const merged = [...prev];
        for (const item of data.items) {
          if (!existing.has(item.id)) merged.push(item);
        }
        return merged;
      });
      setHasMore(data.hasMore);
      setPage(nextPage);
    } catch (err) {
      console.error("[AnnouncementsFeed] Load more failed:", err);
      toastRef.current({
        type: "error",
        title: "Could not load more announcements. Try again.",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page]);

  // ---------------- Empty state ----------------
  if (items.length === 0 && !showCreate) {
    return (
      <div className="rounded-2xl border border-ima-border bg-ima-bg/60 p-8 md:p-10">
        <div className="flex flex-col items-center gap-4 text-center max-w-md mx-auto">
          <span
            className="flex h-12 w-12 items-center justify-center rounded-full bg-ima-surface-accent text-ima-primary"
            aria-hidden="true"
          >
            <Megaphone className="h-6 w-6" strokeWidth={2.25} />
          </span>
          <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted">
            Empty feed
          </p>
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight text-ima-text leading-tight">
            {canAuthor ? "Nothing posted yet" : "No announcements yet"}
          </h2>
          <p className="text-sm text-ima-text-secondary leading-relaxed">
            {canAuthor
              ? "Post the first update — your students will see it the moment you send it."
              : "When the team posts an update, it will appear here."}
          </p>
          {canAuthor && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-2 inline-flex items-center justify-center gap-2 bg-ima-primary text-white rounded-xl px-6 min-h-[56px] text-base font-semibold tracking-tight hover:bg-ima-primary-hover hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 motion-safe:transition-all duration-200 ease-out"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              Post first announcement
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {canAuthor && !showCreate && (
        <div className="flex justify-end mb-6 -mt-2">
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 bg-ima-primary text-white rounded-xl px-5 min-h-[44px] text-sm font-semibold tracking-tight hover:bg-ima-primary-hover hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 motion-safe:transition-all duration-200 ease-out"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            New announcement
          </button>
        </div>
      )}

      {showCreate && canAuthor && (
        <div className="rounded-2xl border border-ima-primary/25 bg-ima-surface-accent p-5 md:p-6 mb-8 motion-safe:animate-fadeIn">
          <p className="text-[10px] uppercase tracking-[0.08em] font-semibold text-ima-primary mb-3">
            New announcement
          </p>
          <AnnouncementForm
            mode="create"
            onSuccess={handleCreateSuccess}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      <ul className="flex flex-col gap-4 list-none p-0">
        {items.map((item) => (
          <li key={item.id}>
            <AnnouncementCard
              announcement={item}
              viewerRole={role}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          </li>
        ))}
      </ul>

      {hasMore && (
        <div className="flex justify-center mt-10">
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
            aria-busy={loadingMore || undefined}
            className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-lg text-xs uppercase tracking-[0.08em] font-semibold text-ima-primary hover:text-ima-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 disabled:opacity-60 motion-safe:transition-colors"
          >
            {loadingMore ? (
              <>
                <Spinner size="sm" />
                Loading…
              </>
            ) : (
              "Load more announcements"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
