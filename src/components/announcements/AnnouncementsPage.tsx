/**
 * Phase 56: Server component shared across all four /[role]/announcements routes.
 *
 * Responsibilities:
 *  1. requireRole(role) — redirects unauthorized users to their role home.
 *  2. Direct admin-client query for the first page of 25 announcements
 *     (ordered newest first, joined with author) — avoids an HTTP round-trip
 *     on initial page render.
 *  3. Compute `is_edited` with the 2000ms trigger-skew tolerance (D-56-07)
 *     so the client never re-derives it.
 *  4. Hand everything off to the client `AnnouncementsFeed` with the
 *     initial items, hasMore flag, viewer role, and viewer id (for defense-
 *     in-depth UI gating per D-56 role-gated UI rules).
 *
 * Copy (page H1 + subtitle) comes verbatim from 56-UI-SPEC.md §Copywriting.
 */

import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementsFeed } from "./AnnouncementsFeed";
import type {
  Announcement,
  AnnouncementsPageRole,
} from "./announcement-types";

const PAGE_SIZE = 25;
const EDITED_TOLERANCE_MS = 2000;

interface AnnouncementsPageProps {
  role: AnnouncementsPageRole;
}

export async function AnnouncementsPage({ role }: AnnouncementsPageProps) {
  // 1. Role guard — redirects on mismatch.
  const user = await requireRole(role);

  // 2. Fetch first page directly via admin client.
  const admin = createAdminClient();
  const { data, error, count } = await admin
    .from("announcements")
    .select(
      "*, author:users!announcements_author_id_fkey(id, name, role)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  if (error) {
    console.error("[AnnouncementsPage] Initial fetch failed:", error);
    // Don't crash the page — render an empty feed with an error hint.
    // The client feed's toast-on-action still works for subsequent mutations.
  }

  // 3. Transform rows to the client-facing shape (mirrors toAnnouncementPayload).
  type RowShape = {
    id: string;
    author_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    author: { id: string; name: string; role: string } | null;
  };

  const rows = (data ?? []) as unknown as RowShape[];
  const initialItems: Announcement[] = rows.map((row) => {
    const createdMs = new Date(row.created_at).getTime();
    const updatedMs = new Date(row.updated_at).getTime();
    return {
      id: row.id,
      author_id: row.author_id,
      content: row.content,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_edited: updatedMs - createdMs > EDITED_TOLERANCE_MS,
      author: row.author
        ? {
            id: row.author.id,
            name: row.author.name,
            // Narrow role to "owner" | "coach" — anyone else shouldn't be
            // an author per D-56-06 / Phase 55 RLS, but we defensively coerce
            // unknown roles to "coach" as a fallback to avoid rendering garbage.
            role:
              row.author.role === "owner" || row.author.role === "coach"
                ? row.author.role
                : "coach",
          }
        : null,
    };
  });

  const total = count ?? 0;
  const initialHasMore = initialItems.length < total;

  const isAuthor = role === "owner" || role === "coach";

  // 4. Render — editorial masthead + horizontal rule + client feed.
  return (
    <section
      aria-labelledby="announcements-h1"
      className="px-4 pt-16 md:pt-20 pb-24 max-w-[760px] mx-auto"
    >
      <header className="mb-6 md:mb-8">
        <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary mb-5">
          Announcements
        </p>
        <h1
          id="announcements-h1"
          className="text-[44px] md:text-[52px] font-normal italic tracking-[-0.02em] text-ima-text leading-[1.05]"
        >
          {isAuthor ? "Signal to your students." : "Dispatches from the team."}
        </h1>
        <p className="mt-5 text-base text-ima-text-secondary italic leading-relaxed max-w-[520px]">
          {isAuthor
            ? "Post updates for your students. Everyone with access sees them immediately."
            : "A running record of what the team wants you to know — newest first."}
        </p>
      </header>

      <div className="h-px w-full bg-ima-border mb-8 md:mb-10" aria-hidden="true" />

      <AnnouncementsFeed
        role={role}
        currentUserId={user.id}
        initialItems={initialItems}
        initialHasMore={initialHasMore}
      />
    </section>
  );
}
