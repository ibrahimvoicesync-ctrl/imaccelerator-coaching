import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnnouncementsFeed } from "@/components/announcements/AnnouncementsFeed";
import type { Announcement } from "@/components/announcements/announcement-types";


const PAGE_SIZE = 25;
const EDITED_TOLERANCE_MS = 2000;

export default async function StudentAnnouncementsPage() {
  const user = await requireRole("student");
  const admin = createAdminClient();

  const { data, error, count } = await admin
    .from("announcements")
    .select(
      "*, author:users!announcements_author_id_fkey(id, name, role)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(0, PAGE_SIZE - 1);

  if (error) {
    console.error("[student/announcements] Initial fetch failed:", error);
  }

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

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-5 md:px-10 pt-8 md:pt-10 pb-16">
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Announcements
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Dispatches from the team
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            A running record of what the team wants you to know — newest first.
          </p>
        </header>

        <section
          aria-label="Announcements feed"
          className="mt-9 bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-8 motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          <AnnouncementsFeed
            role="student"
            currentUserId={user.id}
            initialItems={initialItems}
            initialHasMore={initialHasMore}
          />
        </section>
      </div>
    </div>
  );
}
