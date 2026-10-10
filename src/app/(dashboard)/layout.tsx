import { unstable_cache } from "next/cache";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Sidebar } from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/ui/Toast";
import type { SidebarBadgesResult } from "@/lib/rpc/types";
import type { Role } from "@/lib/config";

const getSidebarBadges = unstable_cache(
  async (userId: string, role: string): Promise<SidebarBadgesResult> => {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("get_sidebar_badges", {
      p_user_id: userId,
      p_role: role,
    });
    if (error) {
      console.error("[layout] Badge RPC failed:", error);
      return {};
    }
    return (data as SidebarBadgesResult) ?? {};
  },
  ["sidebar-badges-v3"],
  {
    tags: ["badges"],
    revalidate: 60,
  }
);

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();

  const badges = await getSidebarBadges(user.id, user.role);
  const badgeCounts: Record<string, number> = {};
  if (badges.active_alerts !== undefined) {
    badgeCounts.active_alerts = badges.active_alerts;
  }
  if (badges.unreviewed_reports !== undefined) {
    badgeCounts.unreviewed_reports = badges.unreviewed_reports;
  }
  if (badges.coach_milestone_alerts !== undefined && badges.coach_milestone_alerts > 0) {
    badgeCounts.coach_milestone_alerts = badges.coach_milestone_alerts;
  }

  return (
    <div className="min-h-screen bg-ima-bg">
      {/* ToastProvider wraps the sidebar too — its referral row toasts on errors */}
      <ToastProvider>
        <Sidebar role={user.role as Role} userName={user.name} badgeCounts={badgeCounts} />
        <main
          id="main-content"
          className="min-h-screen pt-16 md:pt-0 md:ml-[264px]"
        >
          <div className="p-4 md:p-8">{children}</div>
        </main>
      </ToastProvider>
    </div>
  );
}
