"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { VALIDATION } from "@/lib/config";
import type { Database } from "@/lib/types";

type Deal = Database["public"]["Tables"]["deals"]["Row"];

interface DealFormModalProps {
  open: boolean;
  onClose: () => void;
  deal: Deal | null;
  onSubmit: (data: { revenue: number; profit: number }) => Promise<void>;
  loading: boolean;
}

// Inner form component — receives a stable key (deal?.id ?? "new") from parent
// so React remounts it fresh when the modal opens for a different deal.
function DealForm({
  deal,
  onClose,
  onSubmit,
  loading,
}: Omit<DealFormModalProps, "open">) {
  const [revenue, setRevenue] = useState<string>(
    deal ? String(Number(deal.revenue)) : ""
  );
  const [profit, setProfit] = useState<string>(
    deal ? String(Number(deal.profit)) : ""
  );
  const [error, setError] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");

    const parsedRevenue = parseFloat(revenue);
    const parsedProfit = parseFloat(profit);

    if (isNaN(parsedRevenue) || isNaN(parsedProfit)) {
      setError("Please enter valid numbers for revenue and profit.");
      return;
    }

    if (
      parsedRevenue < VALIDATION.deals.revenueMin ||
      parsedRevenue > VALIDATION.deals.revenueMax
    ) {
      setError(
        `Revenue must be between $${VALIDATION.deals.revenueMin} and $${VALIDATION.deals.revenueMax.toLocaleString()}.`
      );
      return;
    }

    if (
      parsedProfit < VALIDATION.deals.profitMin ||
      parsedProfit > VALIDATION.deals.profitMax
    ) {
      setError(
        `Profit must be between $${VALIDATION.deals.profitMin} and $${VALIDATION.deals.profitMax.toLocaleString()}.`
      );
      return;
    }

    await onSubmit({ revenue: parsedRevenue, profit: parsedProfit });
  };

  const submitLabel = deal ? "Save Changes" : "Add Deal";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="Revenue ($)"
        type="number"
        step="0.01"
        min={VALIDATION.deals.revenueMin}
        max={VALIDATION.deals.revenueMax}
        required
        placeholder="0.00"
        value={revenue}
        onChange={(e) => setRevenue(e.target.value)}
        disabled={loading}
      />
      <Input
        label="Profit ($)"
        type="number"
        step="0.01"
        min={VALIDATION.deals.profitMin}
        max={VALIDATION.deals.profitMax}
        required
        placeholder="0.00"
        value={profit}
        onChange={(e) => setProfit(e.target.value)}
        disabled={loading}
      />
      {error && (
        <p role="alert" className="text-xs text-ima-error">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-3 mt-6">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={loading}
        >
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={loading}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function DealFormModal({ open, onClose, deal, onSubmit, loading }: DealFormModalProps) {
  const title = deal ? "Edit Deal" : "Add Deal";
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <DealForm
        key={deal?.id ?? "new"}
        deal={deal}
        onClose={onClose}
        onSubmit={onSubmit}
        loading={loading}
      />
    </Modal>
  );
}
