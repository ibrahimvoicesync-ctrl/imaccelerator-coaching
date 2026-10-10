"use client";

import {
  useCallback,
  useOptimistic,
  useRef,
  useState,
  startTransition,
} from "react";
import { useRouter } from "next/navigation";
import { DollarSign, Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { DealFormModal } from "@/components/student/DealFormModal";
import { DealAttributionChip } from "@/components/shared/DealAttributionChip";
import type { LoggedByUser } from "@/lib/deals-attribution";
import type { Database } from "@/lib/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

type OptimisticAction = { type: "add"; deal: Deal };

function dealsReducer(state: Deal[], action: OptimisticAction): Deal[] {
  switch (action.type) {
    case "add":
      return [action.deal, ...state];
  }
}

interface DealsTabProps {
  deals: Deal[];
  studentId: string;
  studentName: string;
  viewerRole: "coach" | "owner";
  viewerId: string;
  userMap: Record<string, LoggedByUser>;
}

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatCurrency(value: string | number): string {
  return currencyFormatter.format(Number(value));
}

function formatMargin(revenue: string | number, profit: string | number): string {
  const rev = Number(revenue);
  const prof = Number(profit);
  if (rev === 0) return "\u2014";
  return `${((prof / rev) * 100).toFixed(1)}%`;
}

export function DealsTab({
  deals,
  studentId,
  studentName,
  viewerRole,
  viewerId,
  userMap,
}: DealsTabProps) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [optimisticDeals, dispatchOptimistic] = useOptimistic(deals, dealsReducer);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const totalRevenue = optimisticDeals.reduce((sum, d) => sum + Number(d.revenue), 0);
  const totalProfit = optimisticDeals.reduce((sum, d) => sum + Number(d.profit), 0);
  const dealCount = optimisticDeals.length;
  const avgDeal = dealCount > 0 ? totalRevenue / dealCount : 0;

  const openAddModal = useCallback(() => {
    setModalOpen(true);
  }, []);

  const handleAdd = useCallback(
    async (payload: { revenue: number; profit: number }) => {
      setSubmitting(true);

      const tempDeal: Deal = {
        id: String(-Date.now()),
        student_id: studentId,
        deal_number: optimisticDeals.length + 1,
        revenue: payload.revenue,
        profit: payload.profit,
        logged_by: viewerId,
        updated_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setModalOpen(false);

      // Keep the optimistic dispatch AND the awaited fetch inside the same
      // transition so React 19 holds the optimistic state across the network
      // round-trip; it only settles once router.refresh() lands the real data.
      startTransition(async () => {
        dispatchOptimistic({ type: "add", deal: tempDeal });
        try {
          const res = await fetch("/api/deals", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...payload, student_id: studentId }),
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
      });
    },
    [optimisticDeals.length, dispatchOptimistic, studentId, viewerId],
  );

  return (
    <div
      role="tabpanel"
      id="tabpanel-deals"
      aria-labelledby="tab-deals"
      className="space-y-6"
    >
      {/* Revenue hero card */}
      <section
        aria-label="Deals summary"
        className="bg-white border border-ima-border rounded-[14px] shadow-card p-5 md:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
          <div className="min-w-0">
            <p
              className="text-[10px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
            >
              Total Revenue
            </p>
            <p className="mt-3 text-5xl md:text-6xl font-semibold leading-none tabular-nums tracking-tight text-ima-primary">
              {currencyCompact.format(totalRevenue)}
            </p>
            <p
              className="mt-3 text-xs font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
            >
              <span className="text-sm tabular-nums text-ima-text normal-case tracking-normal mr-[6px]">
                {dealCount}
              </span>
              Deal{dealCount !== 1 ? "s" : ""} Logged
            </p>
          </div>

          <button
            type="button"
            onClick={openAddModal}
            disabled={submitting}
            aria-label={`Add deal for ${studentName}`}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-[10px] bg-ima-primary text-white text-sm font-semibold hover:bg-ima-primary-hover motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-60 shrink-0"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add Deal
          </button>
        </div>

        {dealCount > 0 && (
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-[14px]">
            {[
              {
                label: "Total Profit",
                value: currencyCompact.format(totalProfit),
              },
              {
                label: "Blended Margin",
                value: formatMargin(totalRevenue, totalProfit),
              },
              {
                label: "Avg Deal",
                value: currencyCompact.format(avgDeal),
              },
            ].map((m) => (
              <div
                key={m.label}
                className="rounded-[10px] border border-ima-border bg-ima-bg px-4 py-3"
              >
                <p className="text-xl font-semibold leading-none tabular-nums tracking-tight text-ima-text">
                  {m.value}
                </p>
                <p
                  className="mt-[6px] text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
                >
                  {m.label}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Deals ledger */}
      {dealCount === 0 ? (
        <div className="bg-white border border-ima-border rounded-[14px] shadow-card p-6">
          <EmptyState
            variant="compact"
            icon={<DollarSign className="h-6 w-6" aria-hidden="true" />}
            title="No deals yet"
            description="This student hasn't recorded any deals yet. Use Add Deal to log one on their behalf."
          />
        </div>
      ) : (
        <section aria-label="Deals ledger">
          <div className="flex items-baseline justify-between gap-3">
            <p
              className="text-[10px] font-semibold tracking-[0.08em] text-ima-text-secondary uppercase"
            >
              Ledger
            </p>
            <span
              className="text-xs font-semibold tabular-nums text-ima-text-secondary"
            >
              {dealCount} entr{dealCount !== 1 ? "ies" : "y"}
            </span>
          </div>

          <div className="mt-3 bg-white border border-ima-border rounded-[14px] shadow-card overflow-hidden">
            {/* Column headers — hidden on mobile */}
            <div
              className="hidden sm:grid grid-cols-[110px_1fr_1fr_90px_130px_110px] items-center gap-4 px-5 py-3 border-b border-ima-border text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary"
            >
              <span>Deal</span>
              <span>Revenue</span>
              <span>Profit</span>
              <span>Margin</span>
              <span>Logged By</span>
              <span className="text-right">Date</span>
            </div>

            {/* Rows */}
            <ul className="divide-y divide-ima-surface-light" role="list">
              {optimisticDeals.map((deal) => (
                <li
                  key={deal.id}
                  className="grid grid-cols-2 sm:grid-cols-[110px_1fr_1fr_90px_130px_110px] items-center gap-x-4 gap-y-2 px-5 py-4 min-h-[52px] motion-safe:transition-colors hover:bg-ima-bg"
                >
                  <span className="col-span-2 sm:col-span-1 flex items-baseline gap-2">
                    <span
                      className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
                    >
                      Deal
                    </span>
                    <span
                      className="text-sm font-semibold tabular-nums text-ima-text"
                    >
                      #{String(deal.deal_number).padStart(2, "0")}
                    </span>
                  </span>

                  <span className="text-sm font-semibold tabular-nums text-ima-text">
                    <span
                      className="sm:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary mr-2"
                    >
                      Revenue
                    </span>
                    {formatCurrency(deal.revenue)}
                  </span>

                  <span className="text-sm tabular-nums text-ima-text-secondary">
                    <span
                      className="sm:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary mr-2"
                    >
                      Profit
                    </span>
                    {formatCurrency(deal.profit)}
                  </span>

                  <span className="text-sm tabular-nums text-ima-text-secondary">
                    <span
                      className="sm:hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary mr-2"
                    >
                      Margin
                    </span>
                    {formatMargin(deal.revenue, deal.profit)}
                  </span>

                  <span className="shrink-0">
                    <DealAttributionChip
                      deal={deal}
                      viewerRole={viewerRole}
                      viewerId={viewerId}
                      userMap={userMap}
                    />
                  </span>

                  <span
                    className="text-xs tabular-nums uppercase tracking-wider text-ima-text-secondary sm:text-right"
                  >
                    {new Date(deal.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "2-digit",
                    })}
                  </span>
                </li>
              ))}
            </ul>

            {/* Totals footer */}
            <div
              className="hidden sm:grid grid-cols-[110px_1fr_1fr_90px_130px_110px] items-center gap-4 px-5 py-3 border-t border-ima-border bg-ima-bg"
            >
              <span
                className="text-[10px] font-semibold tracking-[0.08em] uppercase text-ima-text-secondary"
              >
                Total
              </span>
              <span className="text-sm font-semibold tabular-nums text-ima-text">
                {formatCurrency(totalRevenue)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-ima-text-secondary">
                {formatCurrency(totalProfit)}
              </span>
              <span className="text-sm font-semibold tabular-nums text-ima-text-secondary">
                {formatMargin(totalRevenue, totalProfit)}
              </span>
              <span />
              <span />
            </div>
          </div>
        </section>
      )}

      <DealFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        deal={null}
        onSubmit={handleAdd}
        loading={submitting}
      />
    </div>
  );
}
