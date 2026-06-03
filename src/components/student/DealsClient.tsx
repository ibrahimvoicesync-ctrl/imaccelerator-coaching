"use client";

import {
  useOptimistic,
  startTransition,
  useState,
  useRef,
  useCallback,
  useMemo,
  type ComponentType,
  type SVGProps,
} from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Calendar,
  CircleDollarSign,
  DollarSign,
  Pencil,
  Plus,
  TrendingUp,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { DealFormModal } from "./DealFormModal";
import { DealAttributionChip } from "@/components/shared/DealAttributionChip";
import type { LoggedByUser, ViewerRole } from "@/lib/deals-attribution";
import type { Database } from "@/lib/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

type OptimisticAction =
  | { type: "add"; deal: Deal }
  | { type: "edit"; deal: Deal }
  | { type: "delete"; id: string };


function dealsReducer(state: Deal[], action: OptimisticAction): Deal[] {
  switch (action.type) {
    case "add":
      return [action.deal, ...state];
    case "edit":
      return state.map((d) => (d.id === action.deal.id ? action.deal : d));
    case "delete":
      return state.filter((d) => d.id !== action.id);
  }
}

function formatCurrency(value: string | number): string {
  return `$${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatCompact(value: number): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface DealsClientProps {
  initialDeals: Deal[];
  viewerId: string;
  viewerRole: ViewerRole;
  userMap: Record<string, LoggedByUser>;
}

export function DealsClient({
  initialDeals,
  viewerId,
  viewerRole,
  userMap,
}: DealsClientProps) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [optimisticDeals, dispatchOptimistic] = useOptimistic(
    initialDeals,
    dealsReducer,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const totals = useMemo(() => {
    let revenue = 0;
    let profit = 0;
    for (const d of optimisticDeals) {
      revenue += Number(d.revenue);
      profit += Number(d.profit);
    }
    return { count: optimisticDeals.length, revenue, profit };
  }, [optimisticDeals]);

  const handleAdd = useCallback(
    async (payload: { revenue: number; profit: number }) => {
      setSubmitting(true);

      const tempDeal: Deal = {
        id: String(-Date.now()),
        student_id: "",
        deal_number: optimisticDeals.length + 1,
        revenue: payload.revenue,
        profit: payload.profit,
        logged_by: viewerId,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      startTransition(() => {
        dispatchOptimistic({ type: "add", deal: tempDeal });
      });

      setModalOpen(false);
      setEditingDeal(null);

      try {
        const res = await fetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: null }));
          toastRef.current({
            type: "error",
            title: (err as { error?: string }).error || "Failed to add deal",
          });
          routerRef.current.refresh();
        } else {
          toastRef.current({ type: "success", title: "Deal added" });
          routerRef.current.refresh();
        }
      } catch (err) {
        console.error("Failed to add deal:", err);
        toastRef.current({ type: "error", title: "Failed to add deal" });
        routerRef.current.refresh();
      } finally {
        setSubmitting(false);
      }
    },
    [optimisticDeals.length, dispatchOptimistic, viewerId],
  );

  const handleEdit = useCallback(
    async (deal: Deal, payload: { revenue: number; profit: number }) => {
      setSubmitting(true);

      const updatedDeal: Deal = {
        ...deal,
        revenue: payload.revenue,
        profit: payload.profit,
        updated_at: new Date().toISOString(),
      };

      startTransition(() => {
        dispatchOptimistic({ type: "edit", deal: updatedDeal });
      });

      setModalOpen(false);
      setEditingDeal(null);

      try {
        const res = await fetch(`/api/deals/${deal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: null }));
          toastRef.current({
            type: "error",
            title: (err as { error?: string }).error || "Failed to update deal",
          });
          routerRef.current.refresh();
        } else {
          toastRef.current({ type: "success", title: "Deal updated" });
          routerRef.current.refresh();
        }
      } catch (err) {
        console.error("Failed to update deal:", err);
        toastRef.current({ type: "error", title: "Failed to update deal" });
        routerRef.current.refresh();
      } finally {
        setSubmitting(false);
      }
    },
    [dispatchOptimistic],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      setConfirmDeleteId(null);

      startTransition(() => {
        dispatchOptimistic({ type: "delete", id });
      });

      try {
        const res = await fetch(`/api/deals/${id}`, { method: "DELETE" });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: null }));
          toastRef.current({
            type: "error",
            title: (err as { error?: string }).error || "Failed to delete deal",
          });
          routerRef.current.refresh();
        } else {
          toastRef.current({ type: "success", title: "Deal deleted" });
          routerRef.current.refresh();
        }
      } catch (err) {
        console.error("Failed to delete deal:", err);
        toastRef.current({ type: "error", title: "Failed to delete deal" });
        routerRef.current.refresh();
      } finally {
        setDeletingId(null);
      }
    },
    [dispatchOptimistic],
  );

  const openAddModal = useCallback(() => {
    setEditingDeal(null);
    setModalOpen(true);
  }, []);

  const hasDeals = optimisticDeals.length > 0;

  return (
    <div className="space-y-10">
      {/* Empty state — no hero; lead the user straight to the CTA. */}
      {!hasDeals && (
        <div
          className="bg-white border border-ima-border rounded-[14px] p-6 md:p-10 motion-safe:animate-fadeIn"
          style={{ animationDelay: "50ms" }}
        >
          <EmptyState
            icon={<DollarSign className="h-6 w-6" aria-hidden="true" />}
            title="No deals yet"
            description="Log your first closed deal to start tracking revenue and profit."
            action={
              <Button
                onClick={openAddModal}
                className="rounded-[10px] min-h-[44px]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add your first deal
              </Button>
            }
          />
        </div>
      )}

      {hasDeals && (
        <>
          {/* Hero — single focal point: total revenue. */}
          <section
            aria-labelledby="deals-hero-label"
            className="motion-safe:animate-fadeIn"
            style={{ animationDelay: "50ms" }}
          >
            <div className="bg-white border border-ima-border rounded-[14px] p-6 md:p-8">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p
                  id="deals-hero-label"
                  className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
                >
                  Total Revenue
                </p>
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-ima-surface-accent border border-ima-primary/20 text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-primary tabular-nums"
                >
                  <Briefcase className="h-3 w-3" aria-hidden="true" />
                  {totals.count} {totals.count === 1 ? "deal" : "deals"} closed
                </span>
              </div>

              <div className="mt-6 flex items-end gap-3 flex-wrap">
                <span className="text-6xl md:text-7xl font-semibold tabular-nums tracking-tight leading-[0.95] text-ima-primary">
                  {formatCompact(totals.revenue)}
                </span>
                <span className="pb-2 text-[15px] font-medium text-ima-text-secondary tabular-nums">
                  {formatCompact(totals.profit)} profit · all time
                </span>
              </div>
            </div>
          </section>

          {/* KPI strip — compact stats mirroring the student dashboard Row A. */}
          <section
            aria-label="Deals summary"
            className="grid grid-cols-1 sm:grid-cols-3 gap-[14px] motion-safe:animate-fadeIn"
            style={{ animationDelay: "100ms" }}
          >
            <CompactStat
              icon={Briefcase}
              tint="accent"
              value={String(totals.count)}
              label={totals.count === 1 ? "Deal logged" : "Deals logged"}
            />
            <CompactStat
              icon={TrendingUp}
              tint="primary"
              value={formatCompact(totals.revenue)}
              label="Revenue · all time"
            />
            <CompactStat
              icon={CircleDollarSign}
              tint="success"
              value={formatCompact(totals.profit)}
              label="Profit · all time"
            />
          </section>

          {/* Ledger — editorial kicker + primary CTA, then table/cards. */}
          <section
            aria-labelledby="deals-ledger-label"
            className="motion-safe:animate-fadeIn"
            style={{ animationDelay: "150ms" }}
          >
            <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
              <p
                id="deals-ledger-label"
                className="text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
              >
                Ledger
              </p>
              <Button
                variant="primary"
                onClick={openAddModal}
                className="rounded-[10px] min-h-[44px]"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Deal
              </Button>
            </div>

            {/* Desktop table */}
            <div className="hidden md:block">
              <div
                role="table"
                aria-label="Deals"
                className="w-full overflow-hidden rounded-[14px] border border-ima-border bg-white"
              >
                <div
                  role="row"
                  className="grid grid-cols-[140px_1fr_1fr_160px_140px_96px] items-center gap-4 px-6 py-3 bg-ima-surface-light border-b border-ima-border"
                >
                  {["Deal", "Revenue", "Profit", "Logged By", "Date"].map(
                    (h) => (
                      <span
                        key={h}
                        role="columnheader"
                        className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
                      >
                        {h}
                      </span>
                    ),
                  )}
                  <span role="columnheader" className="text-right">
                    <span className="sr-only">Actions</span>
                  </span>
                </div>

                <div>
                  {optimisticDeals.map((deal) => {
                    const isConfirming = confirmDeleteId === deal.id;
                    const isDeleting = deletingId === deal.id;
                    const isBusy = submitting || isDeleting;

                    return (
                      <div
                        key={deal.id}
                        role="row"
                        className="group grid grid-cols-[140px_1fr_1fr_160px_140px_96px] items-center gap-4 px-6 h-16 border-b border-ima-border/60 last:border-b-0 motion-safe:transition-colors hover:bg-ima-surface-accent/40 focus-within:bg-ima-surface-accent/40"
                      >
                        <div
                          role="cell"
                          className="flex items-center gap-2.5 min-w-0"
                        >
                          <span
                            aria-hidden="true"
                            className="h-[6px] w-[6px] rounded-full bg-ima-success shrink-0"
                          />
                          <span
                            className="text-[13px] font-semibold text-ima-primary tabular-nums truncate"
                          >
                            #{String(deal.deal_number).padStart(2, "0")}
                          </span>
                        </div>

                        <span
                          role="cell"
                          className="text-[14px] font-semibold text-ima-text tabular-nums"
                        >
                          {formatCurrency(deal.revenue)}
                        </span>

                        <span
                          role="cell"
                          className="text-[14px] font-semibold text-ima-success tabular-nums"
                        >
                          {formatCurrency(deal.profit)}
                        </span>

                        <span role="cell">
                          <DealAttributionChip
                            deal={deal}
                            viewerRole={viewerRole}
                            viewerId={viewerId}
                            userMap={userMap}
                          />
                        </span>

                        <span
                          role="cell"
                          className="flex items-center gap-2 text-[12px] text-ima-text-secondary tabular-nums"
                        >
                          <Calendar
                            className="h-3.5 w-3.5 shrink-0"
                            aria-hidden="true"
                          />
                          {formatDate(deal.created_at)}
                        </span>

                        <div
                          role="cell"
                          className="flex items-center justify-end gap-1"
                        >
                          {isConfirming ? (
                            <div className="flex items-center gap-1.5">
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => handleDelete(deal.id)}
                                loading={isDeleting}
                                aria-label={`Confirm delete deal #${deal.deal_number}`}
                              >
                                Confirm
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setConfirmDeleteId(null)}
                                aria-label="Cancel delete"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 motion-safe:transition-opacity">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDeal(deal);
                                  setModalOpen(true);
                                }}
                                aria-label={`Edit deal #${deal.deal_number}`}
                                disabled={isBusy}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ima-text-secondary motion-safe:transition-colors hover:text-ima-primary hover:bg-ima-surface-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 focus-visible:ring-offset-ima-bg disabled:opacity-50 disabled:pointer-events-none"
                              >
                                <Pencil
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(deal.id)}
                                aria-label={`Delete deal #${deal.deal_number}`}
                                disabled={isBusy}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ima-text-secondary motion-safe:transition-colors hover:text-ima-error hover:bg-ima-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-error focus-visible:ring-offset-2 focus-visible:ring-offset-ima-bg disabled:opacity-50 disabled:pointer-events-none"
                              >
                                <Trash2
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Mobile card list */}
            <ul className="md:hidden space-y-3">
              {optimisticDeals.map((deal) => {
                const isConfirming = confirmDeleteId === deal.id;
                const isDeleting = deletingId === deal.id;
                const isBusy = submitting || isDeleting;

                return (
                  <li
                    key={deal.id}
                    className="rounded-[14px] border border-ima-border bg-white overflow-hidden"
                  >
                    <div className="px-5 py-5 space-y-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            aria-hidden="true"
                            className="h-[6px] w-[6px] rounded-full bg-ima-success shrink-0"
                          />
                          <div className="min-w-0">
                            <p
                              className="text-[13px] font-semibold text-ima-primary tabular-nums truncate"
                            >
                              Deal #{String(deal.deal_number).padStart(2, "0")}
                            </p>
                            <p className="flex items-center gap-1.5 text-[11px] text-ima-text-secondary tabular-nums mt-1">
                              <Calendar
                                className="h-3 w-3 shrink-0"
                                aria-hidden="true"
                              />
                              {formatDate(deal.created_at)}
                            </p>
                          </div>
                        </div>
                        <DealAttributionChip
                          deal={deal}
                          viewerRole={viewerRole}
                          viewerId={viewerId}
                          userMap={userMap}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <MobileMoneyCell
                          label="Revenue"
                          value={formatCurrency(deal.revenue)}
                          tone="text"
                        />
                        <MobileMoneyCell
                          label="Profit"
                          value={formatCurrency(deal.profit)}
                          tone="success"
                        />
                      </div>

                      {isConfirming ? (
                        <div className="flex gap-2">
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleDelete(deal.id)}
                            loading={isDeleting}
                            aria-label={`Confirm delete deal #${deal.deal_number}`}
                            className="flex-1"
                          >
                            Confirm delete
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(null)}
                            aria-label="Cancel delete"
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setEditingDeal(deal);
                              setModalOpen(true);
                            }}
                            aria-label={`Edit deal #${deal.deal_number}`}
                            disabled={isBusy}
                            className="flex-1"
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmDeleteId(deal.id)}
                            aria-label={`Delete deal #${deal.deal_number}`}
                            disabled={isBusy}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}

      {/* Deal form modal */}
      <DealFormModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingDeal(null);
        }}
        deal={editingDeal}
        onSubmit={
          editingDeal ? (data) => handleEdit(editingDeal, data) : handleAdd
        }
        loading={submitting}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type StatTint = "primary" | "success" | "accent";

const STAT_TINTS: Record<StatTint, { bg: string; fg: string }> = {
  primary: { bg: "bg-ima-surface-accent", fg: "text-ima-primary" },
  success: { bg: "bg-ima-success/10", fg: "text-ima-success" },
  accent: { bg: "bg-ima-surface-light", fg: "text-ima-text-secondary" },
};

function CompactStat({
  icon: Icon,
  tint,
  value,
  label,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tint: StatTint;
  value: string;
  label: string;
}) {
  const t = STAT_TINTS[tint];
  return (
    <div className="flex items-start gap-4 bg-white border border-ima-border rounded-[12px] px-[18px] py-[16px] min-h-[72px]">
      <div
        className={cn(
          "w-9 h-9 rounded-[8px] flex items-center justify-center shrink-0",
          t.bg,
        )}
      >
        <Icon className={cn("h-[18px] w-[18px]", t.fg)} aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[24px] md:text-[28px] font-semibold leading-none tabular-nums tracking-tight text-ima-text">
          {value}
        </p>
        <p
          className="mt-[8px] text-[11px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
        >
          {label}
        </p>
      </div>
    </div>
  );
}

function MobileMoneyCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "text" | "success";
}) {
  return (
    <div className="rounded-[10px] border border-ima-border bg-white px-3 py-2.5 space-y-1">
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
      >
        {label}
      </p>
      <p
        className={cn(
          "text-[15px] font-semibold tabular-nums tracking-tight",
          tone === "success" ? "text-ima-success" : "text-ima-text",
        )}
      >
        {value}
      </p>
    </div>
  );
}
