"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ArrowRight } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { StarRating } from "./StarRating";
import { DAILY_REPORT, VALIDATION } from "@/lib/config";
import type { Database } from "@/lib/types";

type DailyReport = Database["public"]["Tables"]["daily_reports"]["Row"];

interface ReportFormData {
  brands_contacted: number;
  influencers_contacted: number;
  calls_joined: number;
  wins?: string;
  improvements?: string;
}

interface ReportFormProps {
  date: string;
  existingReport: DailyReport | null;
  autoMinutes: number;
}

/* Numeric inputs — a real bordered field (box, surface, focus ring) so a filled
   value reads as editable, not as static display text. Centered value stays
   prominent without the underline-as-text ambiguity. */
const NUMERIC_FIELD =
  "w-full h-14 px-3 text-center text-2xl font-semibold tabular-nums tracking-tight text-ima-text bg-ima-surface border border-ima-border rounded-xl leading-none focus:outline-none focus:ring-2 focus:ring-ima-primary focus:border-transparent hover:border-ima-primary/40 appearance-none motion-safe:transition-colors [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/* Reflection textareas — bordered box, restored from the pre-bolder design. */
const BOX_TEXTAREA =
  "w-full min-h-[72px] px-3 py-2 bg-ima-surface border border-ima-border rounded-lg text-sm text-ima-text leading-6 placeholder:italic placeholder:text-ima-text-muted resize-none focus:outline-none focus:ring-2 focus:ring-ima-primary focus:border-transparent motion-safe:transition-colors";

export function ReportForm({ date, existingReport, autoMinutes }: ReportFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [starRating, setStarRating] = useState(existingReport?.star_rating ?? 0);

  const {
    register,
    handleSubmit,
    watch,
  } = useForm<ReportFormData>({
    defaultValues: {
      brands_contacted: existingReport?.brands_contacted ?? 0,
      influencers_contacted: existingReport?.influencers_contacted ?? 0,
      calls_joined: existingReport?.calls_joined ?? 0,
      wins: existingReport?.wins ?? "",
      improvements: existingReport?.improvements ?? "",
    },
  });

  const winsValue = watch("wins") ?? "";
  const improvementsValue = watch("improvements") ?? "";

  const onSubmit = async (data: ReportFormData) => {
    if (starRating < 1) {
      toast({ type: "error", title: "Please rate your day" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          hours_worked: Math.round((autoMinutes / 60) * 100) / 100,
          star_rating: starRating,
          brands_contacted: data.brands_contacted,
          influencers_contacted: data.influencers_contacted,
          calls_joined: data.calls_joined,
          wins: data.wins || undefined,
          improvements: data.improvements || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast({ type: "error", title: err.error || "Failed to submit report" });
        return;
      }

      await res.json();
      toast({ type: "success", title: existingReport ? "Report updated!" : "Report submitted!" });
      router.refresh();
    } catch (err) {
      console.error("[ReportForm] submit failed:", err);
      toast({ type: "error", title: "Failed to submit report" });
    } finally {
      setSubmitting(false);
    }
  };

  const numericFields = [
    {
      id: "brands_contacted" as const,
      label: DAILY_REPORT.fields.brandsContacted.label,
      validation: VALIDATION.brandsContacted,
    },
    {
      id: "calls_joined" as const,
      label: DAILY_REPORT.fields.callsJoined.label,
      validation: VALIDATION.callsJoined,
    },
    {
      id: "influencers_contacted" as const,
      label: DAILY_REPORT.fields.influencersContacted.label,
      validation: VALIDATION.influencersContacted,
    },
  ];

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="rounded-[14px] border border-ima-border bg-ima-surface overflow-hidden"
    >
      {/* Outreach — compact numeric row */}
      <fieldset className="px-6 md:px-8 pt-7 md:pt-9 pb-8 md:pb-10">
        <legend className="sr-only">Outreach today</legend>
        <div className="grid grid-cols-3 gap-6 md:gap-10">
          {numericFields.map(field => (
            <label key={field.id} htmlFor={field.id} className="flex flex-col">
              <span className="block text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted mb-2 leading-[1.3] min-h-[2.6em]">
                {field.label}
              </span>
              <input
                id={field.id}
                type="number"
                min={field.validation.min}
                max={field.validation.max}
                inputMode="numeric"
                aria-label={field.label}
                className={NUMERIC_FIELD}
                {...register(field.id, { valueAsNumber: true })}
              />
            </label>
          ))}
        </div>
      </fieldset>

      {/* Rate your day — the emotional beat */}
      <section className="px-6 md:px-8 pt-7 md:pt-9 pb-8 md:pb-10 border-t border-ima-border">
        <span id="star-rating-label" className="mb-3 block text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-muted">
          {DAILY_REPORT.fields.starRating.label}
        </span>
        <StarRating value={starRating} onChange={setStarRating} />
      </section>

      {/* Reflections */}
      <section className="px-6 md:px-8 pt-7 md:pt-9 pb-8 md:pb-10 space-y-7 border-t border-ima-border">
        <div>
          <label htmlFor="wins" className="block text-sm font-medium text-ima-text mb-2">
            {DAILY_REPORT.fields.wins.label}
          </label>
          <textarea
            id="wins"
            rows={2}
            maxLength={VALIDATION.reportWins.max}
            placeholder="Even one small win counts — what was yours?"
            className={BOX_TEXTAREA}
            {...register("wins")}
          />
          <p
            className={cn(
              "text-xs mt-1 text-right tabular-nums",
              winsValue.length / VALIDATION.reportWins.max >= 0.9
                ? "font-medium text-ima-warning"
                : "text-ima-text-muted",
            )}
          >
            {winsValue.length}/{VALIDATION.reportWins.max}
          </p>
        </div>

        <div>
          <label htmlFor="improvements" className="block text-sm font-medium text-ima-text mb-2">
            {DAILY_REPORT.fields.improvements.label}
          </label>
          <textarea
            id="improvements"
            rows={2}
            maxLength={VALIDATION.reportImprovements.max}
            placeholder="One concrete thing — specific beats general."
            className={BOX_TEXTAREA}
            {...register("improvements")}
          />
          <p
            className={cn(
              "text-xs mt-1 text-right tabular-nums",
              improvementsValue.length / VALIDATION.reportImprovements.max >= 0.9
                ? "font-medium text-ima-warning"
                : "text-ima-text-muted",
            )}
          >
            {improvementsValue.length}/{VALIDATION.reportImprovements.max}
          </p>
        </div>
      </section>

      {/* Submit pedestal — tinted footer distinct from form body */}
      <div className="px-6 md:px-8 py-5 flex items-center justify-between gap-4 flex-wrap bg-ima-bg border-t border-ima-border">
        <p className="text-xs text-ima-text-muted">
          You can edit this tomorrow morning until 6 AM.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="group inline-flex items-center justify-center gap-2 bg-ima-primary hover:bg-ima-primary-hover text-white rounded-full min-h-[44px] px-6 text-sm font-semibold motion-safe:transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? "Saving…" : existingReport ? "Update report" : "Submit report"}
          <ArrowRight
            className="h-4 w-4 motion-safe:transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </button>
      </div>
    </form>
  );
}
