"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { UserPlus, Link2, Copy, Mail, Clock, CheckCircle } from "lucide-react";
import { ROLE_LABELS } from "@/lib/config";
import type { Role } from "@/lib/config";
import { cn } from "@/lib/utils";

type InviteItem = {
  id: string;
  email: string;
  code: string;
  role: string;
  used: boolean;
  used_at: string | null;
  expires_at: string;
  created_at: string;
};

type MagicLinkItem = {
  id: string;
  code: string;
  role: string;
  is_active: boolean;
  use_count: number;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
};

type Props = {
  invites: InviteItem[];
  magicLinks: MagicLinkItem[];
};

type Tab = "email" | "magic";

const STATUS_PILL: Record<string, string> = {
  used: "bg-ima-success/10 border-ima-success/10 text-ima-success",
  expired: "bg-ima-warning/10 border-ima-warning/10 text-ima-warning",
  active: "bg-ima-surface-accent border-ima-primary/20 text-ima-primary",
};

export function OwnerInvitesClient({ invites, magicLinks }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  // Stable refs to prevent dep churn in callbacks
  const routerRef = useRef(router);
  const toastRef = useRef(toast);
  routerRef.current = router;
  toastRef.current = toast;

  const [activeTab, setActiveTab] = useState<Tab>("email");
  const [selectedRole, setSelectedRole] = useState<
    "coach" | "student" | "student_diy"
  >("student");
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [maxUses, setMaxUses] = useState<number>(10);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [lastWhitelistedEmail, setLastWhitelistedEmail] = useState<string | null>(
    null,
  );
  const [localInvites, setLocalInvites] = useState<InviteItem[]>(invites);
  const [localMagicLinks, setLocalMagicLinks] =
    useState<MagicLinkItem[]>(magicLinks);

  // --- Email invite ---
  const handleCreateInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!email.trim() || isSubmitting) return;
      setIsSubmitting(true);
      try {
        const res = await fetch("/api/invites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), role: selectedRole }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          toastRef.current({
            type: "error",
            title:
              (json as { error?: string }).error ?? "Failed to create invite",
          });
          return;
        }
        const { data } = (await res.json()) as { data: InviteItem };
        setLastWhitelistedEmail(data.email);
        setLastUrl(null);
        setLocalInvites((prev) => [data, ...prev]);
        setEmail("");
        toastRef.current({ type: "success", title: "Email whitelisted!" });
      } catch (err) {
        console.error("[OwnerInvitesClient] create invite error:", err);
        toastRef.current({ type: "error", title: "Something went wrong" });
      } finally {
        setIsSubmitting(false);
      }
    },
    [email, isSubmitting, selectedRole],
  );

  // --- Magic link ---
  const handleCreateMagicLink = useCallback(async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/magic-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selectedRole, max_uses: maxUses }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        toastRef.current({
          type: "error",
          title:
            (json as { error?: string }).error ??
            "Failed to create invite link",
        });
        return;
      }
      const { data, registerUrl } = (await res.json()) as {
        data: MagicLinkItem;
        registerUrl: string;
      };
      setLastUrl(registerUrl);
      setLocalMagicLinks((prev) => [data, ...prev]);
      toastRef.current({ type: "success", title: "Invite link created!" });
      setMaxUses(10);
    } catch (err) {
      console.error("[OwnerInvitesClient] create magic link error:", err);
      toastRef.current({ type: "error", title: "Something went wrong" });
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, selectedRole, maxUses]);

  // --- Copy URL ---
  const handleCopy = useCallback(async () => {
    if (!lastUrl) return;
    try {
      await navigator.clipboard.writeText(lastUrl);
      toastRef.current({ type: "success", title: "Copied to clipboard!" });
    } catch (err) {
      console.error("[OwnerInvitesClient] clipboard error:", err);
      toastRef.current({
        type: "error",
        title: "Copy failed — please copy the URL manually",
      });
    }
  }, [lastUrl]);

  // --- Delete magic link (hard removes from DB) ---
  const handleDeleteMagicLink = useCallback(async (link: MagicLinkItem) => {
    // Optimistic remove
    setLocalMagicLinks((prev) => prev.filter((l) => l.id !== link.id));
    try {
      const res = await fetch(`/api/magic-links?id=${link.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        // Revert on failure
        setLocalMagicLinks((prev) =>
          [link, ...prev].sort(
            (a, b) =>
              new Date(b.created_at).getTime() -
              new Date(a.created_at).getTime(),
          ),
        );
        const json = await res.json().catch(() => ({}));
        toastRef.current({
          type: "error",
          title: (json as { error?: string }).error ?? "Failed to delete",
        });
        return;
      }
      toastRef.current({ type: "success", title: "Invite link removed" });
      routerRef.current.refresh();
    } catch (err) {
      setLocalMagicLinks((prev) =>
        [link, ...prev].sort(
          (a, b) =>
            new Date(b.created_at).getTime() -
            new Date(a.created_at).getTime(),
        ),
      );
      console.error("[OwnerInvitesClient] delete magic link error:", err);
      toastRef.current({ type: "error", title: "Something went wrong" });
    }
  }, []);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });

  const getInviteStatus = (invite: InviteItem) => {
    if (invite.used) return "used";
    if (new Date(invite.expires_at) < new Date()) return "expired";
    return "active";
  };

  const getUsageText = (link: MagicLinkItem): string => {
    const limit = link.max_uses === null ? "\u221E" : String(link.max_uses);
    return `${link.use_count} / ${limit} used`;
  };

  const TAB_OPTIONS: { key: Tab; label: string; icon: typeof Mail }[] = [
    { key: "email", label: "Email whitelisting", icon: Mail },
    { key: "magic", label: "Invite Link", icon: Link2 },
  ];

  return (
    <div className="space-y-6">
      {/* Role selector */}
      <div>
        <label
          htmlFor="invite-role"
          className="block text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase mb-3"
        >
          Invite Role
        </label>
        <select
          id="invite-role"
          value={selectedRole}
          onChange={(e) =>
            setSelectedRole(
              e.target.value as "coach" | "student" | "student_diy",
            )
          }
          className="w-full sm:w-56 rounded-[10px] border border-ima-border bg-white px-3 py-2 text-[13px] text-ima-text min-h-[44px] focus:outline-none focus:ring-2 focus:ring-ima-primary focus:ring-offset-1 hover:border-ima-border motion-safe:transition-colors"
          aria-label="Select role for invite"
        >
          <option value="student">Student</option>
          <option value="coach">Coach</option>
          <option value="student_diy">Student DIY</option>
        </select>
      </div>

      {/* Tabs — coach pill pattern */}
      <div
        className="flex gap-2 flex-wrap"
        role="tablist"
        aria-label="Invite method"
      >
        {TAB_OPTIONS.map(({ key, label, icon: Icon }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => {
                setActiveTab(key);
                setLastUrl(null);
                setLastWhitelistedEmail(null);
              }}
              className={cn(
                "min-h-[44px] px-4 rounded-[10px] text-[13px] font-medium motion-safe:transition-colors inline-flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                isActive
                  ? "bg-ima-primary text-white"
                  : "bg-white text-ima-text border border-ima-border hover:border-ima-border",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Email invite tab */}
      {activeTab === "email" && (
        <div className="bg-white border border-ima-border rounded-[14px] p-6">
          <h2 className="text-[15px] font-semibold text-ima-text leading-tight">
            Whitelist an Email
          </h2>
          <p className="mt-1 text-[12px] text-ima-text-secondary">
            The {selectedRole} can then sign in with Google to create their
            account. Expires in 72 hours.
          </p>
          <div className="h-px bg-ima-surface-light mt-4" aria-hidden="true" />
          <form
            onSubmit={handleCreateInvite}
            className="mt-5 flex flex-col sm:flex-row gap-3"
          >
            <div className="flex-1">
              <Input
                type="email"
                placeholder="user@example.com"
                label="Member email address"
                aria-label="Member email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>
            <Button
              type="submit"
              loading={isSubmitting}
              disabled={!email.trim() || isSubmitting}
              className="min-h-[44px] self-end"
            >
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Generate Invite
            </Button>
          </form>
        </div>
      )}

      {/* Magic link tab */}
      {activeTab === "magic" && (
        <div className="bg-white border border-ima-border rounded-[14px] p-6">
          <h2 className="text-[15px] font-semibold text-ima-text leading-tight">
            Generate Invite Link
          </h2>
          <p className="mt-1 text-[12px] text-ima-text-secondary">
            Invite links can be shared with any coach or student. Anyone with
            the link can register with the selected role. No email restriction,
            no expiry.
          </p>
          <div className="h-px bg-ima-surface-light mt-4" aria-hidden="true" />
          <div className="mt-5 flex flex-col sm:flex-row items-end gap-3">
            <div className="w-32">
              <Input
                type="number"
                label="Max uses"
                aria-label="Maximum number of uses for invite link"
                value={maxUses}
                onChange={(e) =>
                  setMaxUses(
                    Math.max(1, Math.min(10000, Number(e.target.value) || 10)),
                  )
                }
                min={1}
                max={10000}
              />
            </div>
            <Button
              type="button"
              onClick={handleCreateMagicLink}
              loading={isSubmitting}
              disabled={isSubmitting}
              className="min-h-[44px]"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
              Generate Invite Link
            </Button>
          </div>
        </div>
      )}

      {/* Whitelist confirmation */}
      {lastWhitelistedEmail && (
        <div className="bg-white border border-ima-border border-l-[3px] border-l-ima-success rounded-[14px] p-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-[8px] bg-ima-success/10 flex items-center justify-center shrink-0">
              <CheckCircle
                className="h-[18px] w-[18px] text-ima-success"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-ima-text leading-tight">
                Email whitelisted
              </p>
              <p className="mt-1 text-[12px] text-ima-text-secondary">
                <span className="font-semibold text-ima-text">
                  {lastWhitelistedEmail}
                </span>{" "}
                can now sign in with Google at the login page. Their account
                will be created automatically.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Copy URL display */}
      {lastUrl && activeTab === "magic" && (
        <div className="bg-white border border-ima-border border-l-[3px] border-l-ima-primary rounded-[14px] p-5">
          <p
            className="text-[11px] font-semibold tracking-[0.18em] uppercase text-ima-text-secondary"
          >
            Generated invite link
          </p>
          <div className="mt-3 flex items-center gap-2">
            <p
              className="flex-1 text-[12px] text-ima-text bg-ima-bg border border-ima-border rounded-[10px] px-3 py-2 truncate min-h-[44px] flex items-center"
              title={lastUrl}
            >
              {lastUrl}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCopy}
              className="min-h-[44px] shrink-0"
              aria-label="Copy invite link to clipboard"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              Copy
            </Button>
          </div>
        </div>
      )}

      {/* Invite history */}
      <section>
        <h2
          className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
        >
          Invite History
        </h2>
        {localInvites.length === 0 ? (
          <div className="mt-4 bg-white border border-ima-border rounded-[14px] p-6">
            <EmptyState
              icon={<UserPlus className="h-6 w-6" />}
              title="No invites sent yet"
              description="Generate an email invite above to get started."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2" role="list">
            {localInvites.map((invite) => {
              const status = getInviteStatus(invite);
              const statusLabel =
                status === "used"
                  ? "Used"
                  : status === "expired"
                    ? "Expired"
                    : "Active";
              return (
                <li
                  key={invite.id}
                  className="bg-white border border-ima-border rounded-[14px] p-4 flex flex-col sm:flex-row sm:items-center gap-3 min-h-[44px]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-ima-text truncate leading-tight">
                      {invite.email}
                    </p>
                    <p className="mt-[3px] text-[12px] text-ima-text-secondary">
                      {ROLE_LABELS[invite.role as Role] ?? invite.role}
                      {" · "}Sent {formatDate(invite.created_at)}
                      {status === "active" && (
                        <span className="ml-1">
                          · Expires {formatDate(invite.expires_at)}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-[3px] rounded-full border text-[10px] font-semibold uppercase tracking-[0.08em]",
                        STATUS_PILL[status],
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Magic links history */}
      <section>
        <h2
          className="text-[11px] font-semibold tracking-[0.22em] text-ima-text-secondary uppercase"
        >
          Invite Links
        </h2>
        {localMagicLinks.length === 0 ? (
          <div className="mt-4 bg-white border border-ima-border rounded-[14px] p-6">
            <EmptyState
              icon={<Link2 className="h-6 w-6" />}
              title="No invite links created yet"
              description="Generate an invite link above to share with coaches or students."
            />
          </div>
        ) : (
          <ul className="mt-4 space-y-2" role="list">
            {localMagicLinks.map((link) => (
              <li
                key={link.id}
                className="bg-white border border-ima-border rounded-[14px] p-4 flex flex-col sm:flex-row sm:items-center gap-3 min-h-[44px]"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[13px] text-ima-text truncate"
                    title={link.code}
                  >
                    {link.code}
                  </p>
                  <p className="mt-[3px] text-[12px] flex items-center gap-1.5 flex-wrap text-ima-text-secondary">
                    <Clock
                      className="h-3 w-3 text-ima-text-secondary"
                      aria-hidden="true"
                    />
                    {ROLE_LABELS[link.role as Role] ?? link.role}
                    <span aria-hidden="true">·</span>
                    Created {formatDate(link.created_at)}
                    <span aria-hidden="true">·</span>
                    <span>{getUsageText(link)}</span>
                  </p>
                </div>
                <div className="shrink-0">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => handleDeleteMagicLink(link)}
                    className="min-h-[44px]"
                    aria-label={`Delete invite link ${link.code}`}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
