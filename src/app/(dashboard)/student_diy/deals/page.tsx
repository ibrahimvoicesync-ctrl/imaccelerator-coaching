import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DealsClient } from "@/components/student/DealsClient";
import type { Database } from "@/lib/types";
import type { LoggedByUser } from "@/lib/deals-attribution";


type Deal = Database["public"]["Tables"]["deals"]["Row"];

export default async function StudentDiyDealsPage() {
  const user = await requireRole("student_diy");
  const admin = createAdminClient();

  const { data: deals, error } = await admin
    .from("deals")
    .select("*")
    .eq("student_id", user.id)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    console.error("[student_diy deals page] Failed to load deals:", error);
  }

  const loggedByIds = Array.from(
    new Set(
      (deals ?? [])
        .map((d) => d.logged_by)
        .filter((id): id is string => typeof id === "string")
    )
  );
  const { data: loggedByUsers } =
    loggedByIds.length > 0
      ? await admin.from("users").select("id, name, role").in("id", loggedByIds)
      : { data: [] as { id: string; name: string; role: string }[] };
  const userMap: Record<string, LoggedByUser> = {};
  for (const u of loggedByUsers ?? []) {
    userMap[u.id] = {
      id: u.id,
      name: u.name,
      role: u.role as LoggedByUser["role"],
    };
  }

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Deals
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Brand Deals
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Track revenue and profit from every deal you close.
          </p>
        </header>

        <div
          className="mt-9 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <DealsClient
            initialDeals={(deals ?? []) as Deal[]}
            viewerId={user.id}
            viewerRole="student_diy"
            userMap={userMap}
          />
        </div>
      </div>
    </div>
  );
}
