import { requireRole } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { OwnerInvitesClient } from "@/components/owner/OwnerInvitesClient";
import { UserPlus, Link2, CheckCircle } from "lucide-react";


export default async function OwnerInvitesPage() {
  const user = await requireRole("owner");
  const admin = createAdminClient();

  const [invitesResult, magicLinksResult] = await Promise.all([
    admin
      .from("invites")
      .select("id, email, code, role, used, used_at, expires_at, created_at")
      .eq("invited_by", user.id)
      .order("created_at", { ascending: false }),
    admin
      .from("magic_links")
      .select("id, code, role, is_active, use_count, max_uses, expires_at, created_at")
      .eq("created_by", user.id)
      .order("created_at", { ascending: false }),
  ]);

  if (invitesResult.error) {
    console.error("[owner invites] Failed to load invites:", invitesResult.error);
  }
  if (magicLinksResult.error) {
    console.error("[owner invites] Failed to load magic links:", magicLinksResult.error);
  }

  const now = new Date();
  const HISTORY_VISIBLE_MS = 24 * 60 * 60 * 1000;

  // Active invites always show. Once they turn Used or Expired, keep them
  // visible for 24h from the moment the status changed, then drop them.
  const invitesList = (invitesResult.data ?? []).filter((i) => {
    if (i.used) {
      if (!i.used_at) return false;
      return now.getTime() - new Date(i.used_at).getTime() < HISTORY_VISIBLE_MS;
    }
    const expiresAt = new Date(i.expires_at);
    if (expiresAt >= now) return true;
    return now.getTime() - expiresAt.getTime() < HISTORY_VISIBLE_MS;
  });

  // Hide deactivated and exhausted magic links
  const magicLinksList = (magicLinksResult.data ?? []).filter(
    (l) => l.is_active && (l.max_uses === null || l.use_count < l.max_uses),
  );

  const totalInvites = invitesList.length;
  const usedInvites = invitesList.filter((i) => i.used).length;
  const activeLinks = magicLinksList.length;

  const statCards = [
    {
      label: "Total Invites",
      value: String(totalInvites),
      icon: UserPlus,
      iconBg: "bg-ima-surface-accent",
      iconColor: "text-ima-primary",
    },
    {
      label: "Used",
      value: String(usedInvites),
      icon: CheckCircle,
      iconBg: "bg-ima-success/10",
      iconColor: "text-ima-success",
    },
    {
      label: "Active Links",
      value: String(activeLinks),
      icon: Link2,
      iconBg: "bg-ima-warning/10",
      iconColor: "text-ima-warning",
    },
  ];

  return (
    <div
      className={`-mx-4 md:-mx-8 -mt-4 md:-mt-8 -mb-4 md:-mb-8 min-h-screen bg-ima-bg`}
    >
      <div className="mx-auto max-w-[1200px] px-6 md:px-14 pt-10 md:pt-14 pb-20">
        {/* Masthead */}
        <header className="motion-safe:animate-fadeIn">
          <p
            className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
          >
            Invites
          </p>
          <h1 className="mt-3 text-[32px] md:text-[36px] font-semibold leading-[1.05] text-ima-text tracking-[-0.02em]">
            Invite members
          </h1>
          <p className="mt-2 max-w-[58ch] text-[15px] text-ima-text-secondary leading-[1.55]">
            Whitelist emails and generate invite links for new coaches and
            students.
          </p>
        </header>

        {/* Stats row */}
        <section
          aria-label="Invite totals"
          className="mt-9 grid grid-cols-1 sm:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          {statCards.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]"
            >
              <div
                className={`w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0 ${s.iconBg}`}
              >
                <s.icon
                  className={`h-[18px] w-[18px] ${s.iconColor}`}
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <p className="text-[24px] font-semibold leading-none tabular-nums slashed-zero tracking-[-0.01em] text-ima-text">
                  {s.value}
                </p>
                <p
                  className="mt-[6px] text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
                >
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* Invite manager */}
        <div
          className="mt-8 motion-safe:animate-fadeIn"
          style={{ animationDelay: "100ms" }}
        >
          <OwnerInvitesClient invites={invitesList} magicLinks={magicLinksList} />
        </div>
      </div>
    </div>
  );
}
