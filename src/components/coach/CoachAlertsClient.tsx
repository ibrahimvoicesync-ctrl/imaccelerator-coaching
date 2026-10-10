"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatRelativeTime } from "@/lib/chat-utils";
import {
  MILESTONE_META,
  type CoachAlertFeedItem,
  type CoachAlertFeedType,
} from "@/components/coach/alerts-types";

type FilterTab = "all" | "active" | "dismissed";

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "dismissed", label: "Dismissed" },
];

const EMPTY_COPY: Record<FilterTab, { title: string; description: string }> = {
  all: {
    title: "No alerts yet",
    description: "When your students hit milestones, they'll appear here.",
  },
  active: {
    title: "All caught up!",
    description: "No active milestone alerts. Keep coaching!",
  },
  dismissed: {
    title: "No dismissed alerts",
    description: "Alerts you dismiss will show here for 30 days before being cleared.",
  },
};

// Warm-palette mapping per milestone type. Icon tint + badge tint carry the
// signal; no side-stripe rails (absolute ban).
const TYPE_TINT: Record<
  CoachAlertFeedType,
  { iconBg: string; iconColor: string; badgeBg: string; badgeBorder: string; badgeText: string }
> = {
  "100h_milestone": {
    iconBg: "bg-ima-success/10",
    iconColor: "text-ima-success",
    badgeBg: "bg-ima-success/10",
    badgeBorder: "border-ima-success/10",
    badgeText: "text-ima-success",
  },
  "closed_deal": {
    iconBg: "bg-ima-success/10",
    iconColor: "text-ima-success",
    badgeBg: "bg-ima-success/10",
    badgeBorder: "border-ima-success/10",
    badgeText: "text-ima-success",
  },
  "5_influencers": {
    iconBg: "bg-ima-surface-accent",
    iconColor: "text-ima-primary",
    badgeBg: "bg-ima-surface-accent",
    badgeBorder: "border-ima-primary/20",
    badgeText: "text-ima-primary",
  },
  "brand_response": {
    iconBg: "bg-ima-surface-accent",
    iconColor: "text-ima-primary",
    badgeBg: "bg-ima-surface-accent",
    badgeBorder: "border-ima-primary/20",
    badgeText: "text-ima-primary",
  },
  "tech_setup": {
    iconBg: "bg-ima-surface-accent",
    iconColor: "text-ima-primary",
    badgeBg: "bg-ima-surface-accent",
    badgeBorder: "border-ima-primary/20",
    badgeText: "text-ima-primary",
  },
};

interface CoachAlertsClientProps {
  initialFeed: CoachAlertFeedItem[];
  initialDismissedAtMap: Record<string, string>;
}

interface StudentGroup {
  student_id: string;
  student_name: string;
  rows: CoachAlertFeedItem[];
  maxOccurredAt: number;
}

export function CoachAlertsClient({
  initialFeed,
  initialDismissedAtMap,
}: CoachAlertsClientProps) {
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

  const [dismissedAtMap, setDismissedAtMap] = useState<Record<string, string>>(
    initialDismissedAtMap,
  );
  const [filter, setFilter] = useState<FilterTab>("active");
  const [inflightKeys, setInflightKeys] = useState<Set<string>>(new Set());

  const dismissedKeys = useMemo(
    () => new Set(Object.keys(dismissedAtMap)),
    [dismissedAtMap],
  );

  const addInflight = useCallback((keys: string[]) => {
    setInflightKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.add(k));
      return next;
    });
  }, []);

  const removeInflight = useCallback((keys: string[]) => {
    setInflightKeys((prev) => {
      const next = new Set(prev);
      keys.forEach((k) => next.delete(k));
      return next;
    });
  }, []);

  const activeCount = useMemo(
    () => initialFeed.filter((r) => !dismissedKeys.has(r.alert_key)).length,
    [initialFeed, dismissedKeys],
  );

  const visibleGroups: StudentGroup[] = useMemo(() => {
    const filtered = initialFeed.filter((r) => {
      if (filter === "all") return true;
      if (filter === "active") return !dismissedKeys.has(r.alert_key);
      return dismissedKeys.has(r.alert_key);
    });

    const byStudent = new Map<string, StudentGroup>();
    for (const row of filtered) {
      const existing = byStudent.get(row.student_id);
      const ts = new Date(row.occurred_at).getTime();
      if (!existing) {
        byStudent.set(row.student_id, {
          student_id: row.student_id,
          student_name: row.student_name,
          rows: [row],
          maxOccurredAt: ts,
        });
      } else {
        existing.rows.push(row);
        if (ts > existing.maxOccurredAt) existing.maxOccurredAt = ts;
      }
    }

    const groups = Array.from(byStudent.values());
    groups.sort((a, b) => b.maxOccurredAt - a.maxOccurredAt);
    for (const g of groups) {
      g.rows.sort(
        (a, b) =>
          new Date(b.occurred_at).getTime() -
          new Date(a.occurred_at).getTime(),
      );
    }
    return groups;
  }, [initialFeed, dismissedKeys, filter]);

  async function postDismiss(alertKey: string): Promise<boolean> {
    try {
      const res = await fetch("/api/alerts/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_key: alertKey }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        console.error(
          "[CoachAlertsClient] dismiss failed:",
          (json as { error?: string }).error ?? res.statusText,
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error("[CoachAlertsClient] dismiss error:", err);
      return false;
    }
  }

  const handleDismiss = useCallback(
    async (alertKey: string) => {
      if (inflightKeys.has(alertKey)) return;
      addInflight([alertKey]);
      const nowIso = new Date().toISOString();
      setDismissedAtMap((prev) => ({ ...prev, [alertKey]: nowIso }));
      const ok = await postDismiss(alertKey);
      if (!ok) {
        setDismissedAtMap((prev) => {
          const next = { ...prev };
          delete next[alertKey];
          return next;
        });
        toastRef.current({
          type: "error",
          title: "Failed to dismiss alert — please try again",
        });
      } else {
        toastRef.current({ type: "success", title: "Alert dismissed" });
        routerRef.current.refresh();
      }
      removeInflight([alertKey]);
    },
    [inflightKeys, addInflight, removeInflight],
  );

  const handleBulkDismiss = useCallback(
    async (group: StudentGroup) => {
      if (group.rows.some((r) => inflightKeys.has(r.alert_key))) return;
      const keys = group.rows
        .filter((r) => !dismissedKeys.has(r.alert_key))
        .map((r) => r.alert_key);
      if (keys.length === 0) return;
      addInflight(keys);
      const nowIso = new Date().toISOString();
      setDismissedAtMap((prev) => {
        const next = { ...prev };
        keys.forEach((k) => {
          next[k] = nowIso;
        });
        return next;
      });
      const results = await Promise.allSettled(keys.map((k) => postDismiss(k)));
      const failedKeys: string[] = [];
      results.forEach((r, idx) => {
        if (r.status !== "fulfilled" || r.value !== true) {
          failedKeys.push(keys[idx]);
        }
      });
      if (failedKeys.length > 0) {
        setDismissedAtMap((prev) => {
          const next = { ...prev };
          failedKeys.forEach((k) => {
            delete next[k];
          });
          return next;
        });
        toastRef.current({
          type: "error",
          title: "Some alerts could not be dismissed — please try again",
        });
      } else {
        toastRef.current({ type: "success", title: "Alerts dismissed" });
      }
      removeInflight(keys);
      if (failedKeys.length < keys.length) {
        routerRef.current.refresh();
      }
    },
    [dismissedKeys, inflightKeys, addInflight, removeInflight],
  );

  return (
    <div
      className="space-y-6 motion-safe:animate-fadeIn"
      style={{ animationDelay: "100ms" }}
    >
      {/* Filter bar */}
      <div className="flex gap-[6px] flex-wrap" role="tablist">
        {FILTER_TABS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(key)}
              className={[
                "min-h-[44px] px-4 text-sm font-semibold rounded-[10px] border motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                active
                  ? "bg-ima-primary text-white border-ima-primary"
                  : "bg-white border-ima-border text-ima-text hover:border-ima-border",
              ].join(" ")}
            >
              {key === "active" && activeCount > 0
                ? `Active (${activeCount})`
                : label}
            </button>
          );
        })}
      </div>

      {/* Grouped feed */}
      {visibleGroups.length === 0 ? (
        <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6">
          <EmptyState
            variant="compact"
            icon={<Bell className="h-5 w-5" aria-hidden="true" />}
            title={EMPTY_COPY[filter].title}
            description={EMPTY_COPY[filter].description}
          />
        </div>
      ) : (
        <div className="space-y-7">
          {visibleGroups.map((group) => {
            const undismissedInGroup = group.rows.filter(
              (r) => !dismissedKeys.has(r.alert_key),
            );
            const showBulk =
              (filter === "all" || filter === "active") &&
              undismissedInGroup.length > 0;
            const anyInflight = group.rows.some((r) =>
              inflightKeys.has(r.alert_key),
            );
            return (
              <section
                key={group.student_id}
                aria-labelledby={`group-${group.student_id}`}
                className="space-y-[10px]"
              >
                {/* Group header */}
                <div className="flex items-center justify-between gap-3 px-1">
                  <h2
                    id={`group-${group.student_id}`}
                    className="text-xs font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
                  >
                    {group.student_name}
                  </h2>
                  {showBulk && (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={anyInflight}
                      onClick={() => handleBulkDismiss(group)}
                      className="text-xs"
                    >
                      Dismiss All
                    </Button>
                  )}
                </div>

                {/* Alert rows */}
                {group.rows.map((row) => {
                  const meta = MILESTONE_META[row.milestone_type];
                  const tint = TYPE_TINT[row.milestone_type];
                  const isDismissed = dismissedKeys.has(row.alert_key);
                  const isInflight = inflightKeys.has(row.alert_key);
                  const dismissedAtIso = dismissedAtMap[row.alert_key];
                  return (
                    <article
                      key={row.alert_key}
                      aria-label={`milestone alert: ${row.student_name} — ${meta.label}`}
                      className={[
                        "bg-white border border-ima-border rounded-[14px] shadow-card p-5 motion-safe:transition-colors",
                        isDismissed && "opacity-70",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <div className="flex gap-4">
                        <div
                          className={`shrink-0 w-10 h-10 rounded-[8px] flex items-center justify-center ${tint.iconBg} ${tint.iconColor}`}
                        >
                          <meta.Icon className="w-5 h-5" aria-hidden="true" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-4 mb-2">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <h3 className="text-sm font-semibold text-ima-text truncate leading-tight">
                                {row.student_name}
                              </h3>
                              <span
                                className={`inline-flex items-center px-2 py-[2px] rounded-full border text-[10px] font-semibold uppercase tracking-wider ${tint.badgeBg} ${tint.badgeBorder} ${tint.badgeText}`}
                              >
                                {meta.label}
                              </span>
                            </div>
                            {!isDismissed && (
                              <div
                                className={`w-2 h-2 rounded-full ${tint.iconColor.replace("text-", "bg-")} shrink-0 mt-1`}
                                aria-hidden="true"
                              />
                            )}
                          </div>

                          <p className="text-sm text-ima-text-secondary mb-2 leading-relaxed">
                            {row.message ?? (
                              <time dateTime={row.occurred_at}>
                                {new Date(row.occurred_at).toLocaleString()}
                              </time>
                            )}
                          </p>

                          {isDismissed && dismissedAtIso && (
                            <p className="text-xs text-ima-text-secondary mb-4">
                              Dismissed{" "}
                              <time dateTime={dismissedAtIso}>
                                {formatRelativeTime(new Date(dismissedAtIso))}
                              </time>
                            </p>
                          )}

                          <div className="flex gap-3 flex-wrap items-center">
                            <Link
                              href={`/coach/students/${row.student_id}?tab=${row.milestone_type === "closed_deal" ? "deals" : "roadmap"}`}
                              aria-label={`View ${row.student_name}`}
                              className="text-xs font-semibold text-ima-primary hover:text-ima-primary-hover min-h-[44px] inline-flex items-center focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 rounded px-1"
                            >
                              View Student →
                            </Link>
                            {!isDismissed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                loading={isInflight}
                                onClick={() => handleDismiss(row.alert_key)}
                                className="text-xs"
                              >
                                Dismiss Alert
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
