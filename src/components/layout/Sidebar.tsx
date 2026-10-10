"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import {
  LayoutDashboard,
  Shield,
  Users,
  UserPlus,
  ArrowLeftRight,
  Bell,
  FileText,
  Timer,
  Map,
  BarChart3,
  MessageSquare,
  BookOpen,
  LogOut,
  Menu,
  X,
  ChevronRight,
  DollarSign,
  Megaphone,
  Gift,
  type LucideIcon,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ReferralPill } from "@/components/student/ReferralPill";
import type { Role, NavItem } from "@/lib/config";
import { NAVIGATION, ROLE_LABELS, ROLES } from "@/lib/config";

// V1 icon map — only icons used in V1 navigation
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Shield,
  Users,
  UserPlus,
  ArrowLeftRight,
  Bell,
  FileText,
  Timer,
  Map,
  BarChart3,
  MessageSquare,
  BookOpen,
  LogOut,
  Menu,
  X,
  ChevronRight,
  DollarSign,
  Megaphone,
  Gift,
};

export function Sidebar({
  role,
  userName,
  badgeCounts = {},
}: {
  role: Role;
  userName: string;
  badgeCounts?: Record<string, number>;
}) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  // Optimistic active row: the pill moves on click, not when the server
  // response for the new route lands, so the click never feels ignored.
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setPendingHref(null);
  }
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const links: NavItem[] = NAVIGATION[role];

  const close = useCallback(() => setOpen(false), []);

  // Focus close button when sidebar opens, handle Escape key + focus trap
  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key === "Tab" && sidebarRef.current) {
        const focusable = sidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleSignOut = async () => {
    try {
      const response = await fetch("/api/auth/signout", { method: "POST", redirect: "manual" });
      // `redirect: "manual"` surfaces the expected redirect as an opaqueredirect
      // (ok=false, status 0); only a genuine non-2xx is worth logging.
      if (!response.ok && response.type !== "opaqueredirect") {
        console.error("Sign out request failed:", response.status);
      }
    } catch (err) {
      console.error("Sign out failed:", err);
    }
    window.location.href = "/login";
  };

  const currentPath = pendingHref ?? pathname;
  const isActive = (href: string) =>
    href === `/${role}` ? currentPath === href : currentPath.startsWith(href);

  return (
    <>
      {/* Skip to content link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:p-4
          focus:bg-white focus:text-ima-text focus:rounded-lg"
      >
        Skip to main content
      </a>

      {/* Mobile top bar — a real header (not a floating button) so content
          scrolls cleanly beneath it. Same beige frame as the drawer. */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center border-b border-ima-sidebar-border bg-ima-sidebar px-2 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg
            text-ima-text hover:bg-ima-sidebar-hover active:scale-95 motion-safe:transition-[background-color,transform]
            [-webkit-tap-highlight-color:transparent]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
          aria-label="Open navigation"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link
          href={`/${role}`}
          aria-label="IMA Accelerator — go to dashboard"
          className="absolute left-1/2 -translate-x-1/2 flex min-h-[44px] items-center rounded-lg px-2
            [-webkit-tap-highlight-color:transparent]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
        >
          <span
            role="img"
            aria-label="IMA Accelerator"
            className="block bg-ima-primary"
            style={{
              width: 112,
              height: 24,
              WebkitMaskImage: "url(/ima-logo.png)",
              maskImage: "url(/ima-logo.png)",
              WebkitMaskSize: "contain",
              maskSize: "contain",
              WebkitMaskRepeat: "no-repeat",
              maskRepeat: "no-repeat",
              WebkitMaskPosition: "center",
              maskPosition: "center",
            }}
          />
        </Link>
      </header>

      {/* Backdrop — mobile overlay */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-40 bg-ima-overlay md:hidden"
            aria-hidden="true"
            onClick={close}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Navigation menu"
        className={cn(
          // inset-y-0 (not h-screen): 100vh on iOS Safari is taller than the
          // visible area, which pushed the account card under the toolbar.
          "fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] md:w-[264px]",
          "[-webkit-tap-highlight-color:transparent]",
          // Frame layer: warm light beige, so the white content canvas reads as
          // the raised plane.
          "bg-ima-sidebar border-r border-ima-sidebar-border",
          "flex flex-col",
          "motion-safe:transition-[transform,box-shadow] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.32,0.72,0,1)]",
          open ? "translate-x-0 shadow-[0_0_40px_rgba(15,23,42,0.18)]" : "-translate-x-full",
          "md:shadow-none",
          // Desktop: flush to the viewport edges — full height, no gutter
          "md:translate-x-0"
        )}
      >
        {/* Brand lockup — 64px band, left-aligned with the nav rows below.
            The mobile close button sits on the right. */}
        <div className="flex h-16 shrink-0 items-center justify-between pl-4 pr-2">
          <Link
            href={`/${role}`}
            aria-label="IMA Accelerator — go to dashboard"
            className="flex min-h-[44px] items-center rounded-lg px-2
              motion-safe:transition-opacity hover:opacity-80
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary
              focus-visible:ring-offset-1"
          >
            <span
              role="img"
              aria-label="IMA Accelerator"
              className="block bg-ima-primary shrink-0"
              style={{
                width: 132,
                height: 28,
                WebkitMaskImage: "url(/ima-logo.png)",
                maskImage: "url(/ima-logo.png)",
                WebkitMaskSize: "contain",
                maskSize: "contain",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
                WebkitMaskPosition: "left center",
                maskPosition: "left center",
              }}
            />
          </Link>
          <button
            ref={closeButtonRef}
            onClick={close}
            className="md:hidden flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary
              hover:bg-ima-sidebar-hover motion-safe:transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5 text-ima-text-secondary" aria-hidden="true" />
          </button>
        </div>

        {/* Main nav links */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto overscroll-contain px-3 pt-[6px] pb-[14px]">
          <ul role="list" className="space-y-0.5">
            {links.map((item) => {
              const Icon = ICON_MAP[item.icon];
              const active = isActive(item.href);
              const rawCount = item.badge ? badgeCounts[item.badge] ?? 0 : 0;
              const hasBadge = Boolean(item.badge) && rawCount > 0;
              const showNumber = hasBadge && rawCount >= 2;
              const displayCount =
                item.badge === "coach_milestone_alerts" && rawCount >= 10
                  ? "9+"
                  : String(rawCount);
              return (
                <li key={item.href}>
                  {/* Render separator divider BEFORE items with separator: true */}
                  {item.separator && (
                    <div
                      className="my-[10px] mx-3 border-t border-ima-sidebar-border"
                      aria-hidden="true"
                    />
                  )}
                  <Link
                    href={item.href}
                    onClick={(e) => {
                      close();
                      if (!e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
                        setPendingHref(item.href);
                      }
                    }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 min-h-[44px] rounded-[10px] text-[14px]",
                      "motion-safe:transition-[color,background-color,transform] motion-safe:duration-150 active:scale-[0.98]",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-1",
                      active
                        ? "font-semibold text-ima-text"
                        : "font-medium text-ima-text-secondary hover:bg-ima-sidebar-hover hover:text-ima-text"
                    )}
                  >
                    {/* Active pill — tweens between rows (ease-out-quint, no overshoot) */}
                    {active && (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-[10px] bg-white shadow-card ring-1 ring-ima-sidebar-border"
                        transition={
                          prefersReducedMotion
                            ? { duration: 0 }
                            : { type: "spring", bounce: 0, duration: 0.25 }
                        }
                        aria-hidden="true"
                      />
                    )}
                    {Icon && (
                      <Icon
                        strokeWidth={active ? 2.25 : 2}
                        className={cn(
                          "relative h-[18px] w-[18px] shrink-0",
                          "motion-safe:transition-colors motion-safe:duration-200 motion-safe:ease-out",
                          active
                            ? "text-ima-primary"
                            : "text-ima-text-secondary group-hover:text-ima-text"
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className="relative truncate">{item.label}</span>
                    <NavPending />
                    {hasBadge && showNumber && (
                      <span
                        className={cn(
                          "relative ml-auto min-w-[22px] rounded-full px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums shrink-0",
                          active ? "bg-ima-surface-light text-ima-text" : "bg-white text-ima-text ring-1 ring-ima-sidebar-border"
                        )}
                      >
                        {displayCount}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                    {hasBadge && !showNumber && (
                      <>
                        <span
                          className="relative ml-auto h-2 w-2 rounded-full bg-ima-text ring-2 ring-white shrink-0"
                          aria-hidden="true"
                        />
                        <span className="sr-only">Unread</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Referral — students only, sits just above the account card */}
        {(role === ROLES.STUDENT || role === ROLES.STUDENT_DIY) && (
          <div className="shrink-0 px-3">
            <ReferralPill />
          </div>
        )}

        {/* Account — identity on the left, sign-out as a quiet icon action */}
        <div className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div
            className="flex items-center gap-3 rounded-[12px] bg-white py-[6px] pl-[10px] pr-1 shadow-card ring-1 ring-ima-sidebar-border"
            role="group"
            aria-label="User account"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ima-text text-[13px] font-semibold text-white"
              aria-hidden="true"
            >
              {userName?.charAt(0)?.toUpperCase() ?? "?"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px] font-medium leading-tight text-ima-text">{userName}</p>
              <p className="mt-0.5 text-[12px] leading-tight text-ima-text-secondary">
                {ROLE_LABELS[role]}
              </p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="group flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-[10px]
                text-ima-text-secondary hover:bg-ima-error/10 hover:text-ima-error active:scale-95
                motion-safe:transition-[color,background-color,transform] motion-safe:duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
            >
              <LogOut
                className="h-4 w-4 motion-safe:transition-transform motion-safe:duration-200"
                aria-hidden="true"
              />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/** Small spinner while this link's route is loading (Next's useLinkStatus). */
function NavPending() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden="true"
      className={cn(
        "absolute right-3 top-1/2 -mt-[7px] h-3.5 w-3.5 rounded-full border-2 border-ima-border border-t-ima-primary",
        "motion-safe:animate-spin motion-safe:transition-opacity motion-safe:duration-150",
        pending ? "opacity-100 delay-100" : "opacity-0",
      )}
    />
  );
}
