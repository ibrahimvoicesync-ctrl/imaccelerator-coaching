"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, DollarSign } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface AlertItem {
  key: string;
  type: "deal_closed";
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  subjectId: string | null;
  subjectName: string;
  triggeredAt: string;
  dismissed: boolean;
  dismissedAt: string | null;
}

type FilterTab = "all" | "active" | "dismissed";

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "dismissed", label: "Dismissed" },
];

const EMPTY_MESSAGES: Record<FilterTab, string> = {
  all: "No alerts. Your platform is healthy!",
  active: "No active alerts. Everything looks good!",
  dismissed: "No dismissed alerts yet.",
};

const TYPE_CONFIG: Record<
  string,
  { iconBg: string; iconColor: string; Icon: LucideIcon; label: string }
> = {
  deal_closed: {
    iconBg: "bg-ima-success/10",
    iconColor: "text-ima-success",
    Icon: DollarSign,
    label: "Deal",
  },
};

interface OwnerAlertsClientProps {
  initialAlerts: AlertItem[];
}

export function OwnerAlertsClient({ initialAlerts }: OwnerAlertsClientProps) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);

  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  const [alerts, setAlerts] = useState<AlertItem[]>(initialAlerts);
  const [filter, setFilter] = useState<FilterTab>("active");
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

  const activeCount = alerts.filter((a) => !a.dismissed).length;

  const filteredAlerts =
    filter === "all"
      ? alerts
      : filter === "active"
        ? alerts.filter((a) => !a.dismissed)
        : alerts.filter((a) => a.dismissed);

  function handleFilterChange(newFilter: FilterTab) {
    setFilter(newFilter);
  }

  const handleDismiss = useCallback(async (alertKey: string) => {
    setDismissingKey(alertKey);
    const nowIso = new Date().toISOString();
    // Optimistic update
    setAlerts((prev) =>
      prev.map((a) =>
        a.key === alertKey ? { ...a, dismissed: true, dismissedAt: nowIso } : a,
      ),
    );
    try {
      const res = await fetch("/api/alerts/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_key: alertKey }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        // Revert optimistic update
        setAlerts((prev) =>
          prev.map((a) =>
            a.key === alertKey ? { ...a, dismissed: false, dismissedAt: null } : a,
          ),
        );
        toastRef.current({
          type: "error",
          title: (json as { error?: string }).error ?? "Failed to dismiss alert",
        });
        return;
      }
      toastRef.current({ type: "success", title: "Alert dismissed" });
      routerRef.current.refresh();
    } catch (err) {
      console.error("[OwnerAlertsClient] dismiss error:", err);
      // Revert optimistic update
      setAlerts((prev) =>
        prev.map((a) =>
          a.key === alertKey ? { ...a, dismissed: false, dismissedAt: null } : a,
        ),
      );
      toastRef.current({ type: "error", title: "Something went wrong" });
    } finally {
      setDismissingKey(null);
    }
  }, []);

  function getTimeAgo(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  function getDetailHref(alert: AlertItem): string | null {
    if (alert.type === "deal_closed" && alert.subjectId) {
      return `/owner/students/${alert.subjectId}`;
    }
    return null;
  }

  return (
    <div>
      {/* Pill filter tabs */}
      <div className="flex gap-2 flex-wrap" role="tablist" aria-label="Filter alerts">
        {FILTER_TABS.map(({ key, label }) => {
          const isActive = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleFilterChange(key)}
              className={cn(
                "min-h-[44px] px-4 rounded-[10px] text-[13px] font-medium border motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                isActive
                  ? "bg-ima-primary text-white border-ima-primary"
                  : "bg-white border-ima-border text-ima-text hover:border-ima-border"
              )}
            >
              {label}
              {key === "active" && activeCount > 0 && (
                <span className="ml-1.5 text-[11px] opacity-80 tabular-nums slashed-zero">
                  ({activeCount})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Alerts list */}
      {filteredAlerts.length === 0 ? (
        <div className="mt-6 bg-white border border-ima-border rounded-[14px] p-6">
          <EmptyState
            icon={<Bell className="h-6 w-6" />}
            title={EMPTY_MESSAGES[filter]}
            description={
              filter === "all"
                ? "No alerts have been triggered. Keep up the great work!"
                : undefined
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3" role="list">
          {filteredAlerts.map((alert) => {
            const config = TYPE_CONFIG[alert.type] ?? TYPE_CONFIG.deal_closed;
            const { Icon } = config;
            const detailHref = getDetailHref(alert);
            const isLive = !alert.dismissed;

            return (
              <li
                key={alert.key}
                className={cn(
                  "rounded-[14px] border bg-white p-5",
                  isLive
                    ? "border-ima-border border-l-[3px] border-l-ima-success"
                    : "border-ima-border bg-ima-bg"
                )}
              >
                <div
                  role="alert"
                  aria-label={`${alert.severity} alert: ${alert.title}`}
                  className="flex gap-4"
                >
                  {/* Type icon */}
                  <div
                    className={cn(
                      "shrink-0 w-10 h-10 rounded-[8px] flex items-center justify-center",
                      config.iconBg,
                      config.iconColor
                    )}
                  >
                    <Icon className="w-5 h-5" aria-hidden="true" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-[14px] font-semibold tracking-[-0.005em] text-ima-text truncate leading-tight">
                          {alert.title}
                        </h3>
                        <span className="inline-flex items-center px-2 py-[3px] rounded-full bg-ima-success/10 border border-ima-success/10 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success shrink-0">
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className="text-[10px] font-semibold text-ima-text-secondary tracking-[0.08em] uppercase whitespace-nowrap tabular-nums slashed-zero"
                        >
                          {getTimeAgo(alert.triggeredAt)}
                        </span>
                        {isLive && (
                          <div
                            className="w-2 h-2 rounded-full bg-ima-success shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>

                    <p className="text-[13px] text-ima-text-secondary mb-2">
                      {alert.message}
                    </p>

                    {alert.dismissed && alert.dismissedAt && (
                      <p className="text-xs text-ima-text-secondary mb-3">
                        Dismissed{" "}
                        <time dateTime={alert.dismissedAt}>
                          {getTimeAgo(alert.dismissedAt)}
                        </time>
                      </p>
                    )}

                    <div className="flex gap-3 items-center">
                      {detailHref && (
                        <Link
                          href={detailHref}
                          className="text-[12px] font-medium text-ima-primary hover:text-ima-primary-hover min-h-[44px] inline-flex items-center focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded-md px-1"
                        >
                          View Details
                        </Link>
                      )}
                      {isLive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={dismissingKey === alert.key}
                          onClick={() => handleDismiss(alert.key)}
                          className="text-[12px]"
                        >
                          Dismiss
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
