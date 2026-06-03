"use client";

import Link from "next/link";
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
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import type { Role, NavItem } from "@/lib/config";
import { NAVIGATION, ROLE_LABELS } from "@/lib/config";

// V1 icon map — only icons used in V1 navigation
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
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
      await fetch("/api/auth/signout", { method: "POST", redirect: "manual" });
    } catch (err) {
      console.error("Sign out failed:", err);
    }
    window.location.href = "/login";
  };

  const isActive = (href: string) =>
    href === `/${role}` ? pathname === href : pathname.startsWith(href);

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

      {/* Mobile toggle — notch-aware position */}
      <button
        onClick={() => setOpen(true)}
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
        className="fixed left-4 z-50 md:hidden bg-white border border-ima-border
          rounded-lg shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center
          focus-visible:outline-none focus-visible:outline focus-visible:outline-2
          focus-visible:outline-ima-primary focus-visible:outline-offset-2"
        aria-label="Open navigation"
      >
        <Menu className="h-5 w-5 text-ima-text" aria-hidden="true" />
      </button>

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
          "fixed inset-y-0 left-0 z-50 w-60 h-screen",
          "bg-white border-r border-ima-border",
          "flex flex-col",
          "motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0"
        )}
      >
        {/* Brand lockup — logo indent matches nav icon indent (24px from sidebar edge) */}
        <div className="flex items-center justify-between px-3 pt-7 shrink-0">
          <Link
            href={`/${role}`}
            aria-label="IMA Accelerator — go to dashboard"
            className="flex items-center min-h-[44px] rounded-lg px-3
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary
              focus-visible:ring-offset-1"
          >
            <span
              role="img"
              aria-label="IMA Accelerator"
              className="block bg-ima-primary shrink-0"
              style={{
                width: 216,
                height: 45,
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
            className="md:hidden p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary rounded-lg
              hover:bg-ima-surface-light motion-safe:transition-colors"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5 text-ima-text-secondary" aria-hidden="true" />
          </button>
        </div>

        {/* Divider below brand */}
        <div className="mx-3 mt-6 mb-4 border-t border-ima-border" aria-hidden="true" />

        {/* Main nav links */}
        <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 pb-4">
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
                      className="my-3 mx-3 border-t border-ima-border"
                      aria-hidden="true"
                    />
                  )}
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-lg text-sm",
                      "motion-safe:transition-colors motion-safe:duration-150",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-1",
                      active
                        ? "bg-ima-surface-accent text-ima-primary font-medium"
                        : "text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text"
                    )}
                  >
                    {/* Inset accent bar — tween between active rows (ease-out-quint, no overshoot) */}
                    {active && (
                      <motion.div
                        layoutId="sidebar-active"
                        className="absolute left-1.5 top-2 bottom-2 w-0.5 rounded-full bg-ima-primary"
                        transition={
                          prefersReducedMotion
                            ? { duration: 0 }
                            : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
                        }
                      />
                    )}
                    {Icon && (
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 motion-safe:transition-colors",
                          active
                            ? "text-ima-primary"
                            : "text-ima-text-secondary group-hover:text-ima-text"
                        )}
                        aria-hidden="true"
                      />
                    )}
                    <span className="truncate">{item.label}</span>
                    {hasBadge && showNumber && (
                      <span className="ml-auto text-xs font-medium text-ima-primary tabular-nums shrink-0">
                        {displayCount}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                    {hasBadge && !showNumber && (
                      <>
                        <span
                          className="ml-auto h-1.5 w-1.5 rounded-full bg-ima-primary shrink-0"
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

        {/* Bottom section: User info + Sign out */}
        <div className="shrink-0 border-t border-ima-border">
          <div className="px-3 py-3">
            <div
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
              role="group"
              aria-label="User account"
            >
              <div
                className="h-8 w-8 rounded-full bg-ima-primary flex items-center justify-center text-xs font-semibold text-white shrink-0"
                aria-hidden="true"
              >
                {userName?.charAt(0)?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ima-text truncate">{userName}</p>
                <p className="text-xs uppercase tracking-[0.08em] text-ima-text-muted font-semibold">
                  {ROLE_LABELS[role]}
                </p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              className="group flex items-center gap-3 w-full px-3 py-2.5 min-h-[44px] rounded-lg text-sm
                cursor-pointer text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-error
                motion-safe:transition-colors motion-safe:duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-1"
            >
              <LogOut
                className="h-4 w-4 shrink-0 text-ima-text-secondary group-hover:text-ima-error motion-safe:transition-colors"
                aria-hidden="true"
              />
              Sign Out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
