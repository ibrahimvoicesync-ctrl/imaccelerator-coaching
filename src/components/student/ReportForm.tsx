"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Clock,
  Building2,
  Users,
  Phone,
  Star,
  Sparkles,
  Target,
  DollarSign,
  Mail,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { cn, formatHoursMinutes } from "@/lib/utils";
import { StarRating } from "./StarRating";
import { VALIDATION } from "@/lib/config";
import type { Database } from "@/lib/types";

type DailyReport = Database["public"]["Tables"]["daily_reports"]["Row"];

interface ReportFormProps {
  date: string;
  existingReport: DailyReport | null;
  autoMinutes: number;
}

type FieldKey =
  | "hours_worked"
  | "brands_contacted"
  | "influencers_contacted"
  | "calls_joined"
  | "revenue"
  | "star_rating"
  | "wins"
  | "improvements";

interface StepDef {
  key: FieldKey;
  kind: "number" | "rating" | "textarea" | "money";
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  helper?: string;
  suffix?: string;
  placeholder?: string;
  step?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  required?: boolean;
}

function clampNumber(raw: string, min: number, max: number): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

export function ReportForm({ date, existingReport, autoMinutes }: ReportFormProps) {
  const router = useRouter();
  const toastRef = useRef(useToast());
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(0);

  const autoHours = Math.round((autoMinutes / 60) * 100) / 100;
  // A draft row (emails quick-logged from the Work Tracker) isn't a submitted
  // report yet: keep its email counts but treat everything else as fresh.
  const isSubmitted = Boolean(existingReport?.submitted_at);

  // String-backed values for the numeric fields so the big inputs can be
  // cleared and retyped freely; converted to numbers only on submit.
  const [values, setValues] = useState({
    hours_worked: String((isSubmitted ? existingReport?.hours_worked : null) ?? autoHours ?? 0),
    brands_contacted: String(existingReport?.brands_contacted ?? 0),
    influencers_contacted: String(existingReport?.influencers_contacted ?? 0),
    calls_joined: String(existingReport?.calls_joined ?? 0),
    revenue: String(existingReport?.revenue ?? 0),
    profit: String(existingReport?.profit ?? 0),
    star_rating: existingReport?.star_rating ?? 0,
    wins: existingReport?.wins ?? "",
    improvements: existingReport?.improvements ?? "",
  });

  // Skip what the app already knows: hours from the timer, emails from the
  // Work Tracker's Emails tab. They show as a summary with a "Change these"
  // escape hatch, which brings the questions back.
  const hoursTracked = autoMinutes > 0;
  const emailsLogged =
    (existingReport?.brands_contacted ?? 0) + (existingReport?.influencers_contacted ?? 0) > 0;
  const [editPrefilled, setEditPrefilled] = useState(false);
  const skipHours = hoursTracked && !editPrefilled;
  const skipEmails = emailsLogged && !editPrefilled;

  const allSteps: StepDef[] = [
    {
      key: "hours_worked",
      kind: "number",
      eyebrow: "Time on the work",
      icon: Clock,
      title: "How many hours did you work today?",
      helper:
        autoMinutes > 0
          ? `Filled from your tracker (${formatHoursMinutes(autoMinutes)}). Edit it if you worked away from the timer.`
          : "Enter the hours you actually worked — timer or not.",
      suffix: "hours",
      step: "0.25",
      min: 0,
      max: 24,
    },
    {
      key: "brands_contacted",
      kind: "number",
      eyebrow: "Outreach",
      icon: Building2,
      title: "How many brands did you reach out to?",
      helper: "New brand outreach you sent today.",
      suffix: "brands",
      min: VALIDATION.brandsContacted.min,
      max: VALIDATION.brandsContacted.max,
    },
    {
      key: "influencers_contacted",
      kind: "number",
      eyebrow: "Outreach",
      icon: Users,
      title: "How many influencers did you reach out to?",
      helper: "New influencer outreach you sent today.",
      suffix: "influencers",
      min: VALIDATION.influencersContacted.min,
      max: VALIDATION.influencersContacted.max,
    },
    {
      key: "calls_joined",
      kind: "number",
      eyebrow: "Conversations",
      icon: Phone,
      title: "How many calls did you join?",
      helper: "Sales calls, coaching calls, or Q&As.",
      suffix: "calls",
      min: VALIDATION.callsJoined.min,
      max: VALIDATION.callsJoined.max,
    },
    {
      key: "revenue",
      kind: "money",
      eyebrow: "Money closed",
      icon: DollarSign,
      title: "Did you make any money today?",
      helper: "Leave both at $0 if not — that's completely fine.",
    },
    {
      key: "star_rating",
      kind: "rating",
      eyebrow: "Reflection",
      icon: Star,
      title: "How was your day?",
      helper: "Tap the stars. Be honest — only you and your coach see this.",
      required: true,
    },
    {
      key: "wins",
      kind: "textarea",
      eyebrow: "Wins",
      icon: Sparkles,
      title: "What went well today?",
      helper: "Optional — even one small win counts.",
      placeholder: "Even one small win counts — what was yours?",
      maxLength: VALIDATION.reportWins.max,
    },
    {
      key: "improvements",
      kind: "textarea",
      eyebrow: "Tomorrow",
      icon: Target,
      title: "What will you do better tomorrow?",
      helper: "Optional — specific beats general.",
      placeholder: "One concrete thing — specific beats general.",
      maxLength: VALIDATION.reportImprovements.max,
    },
  ];
  const steps = allSteps.filter(
    (st) =>
      !(skipHours && st.key === "hours_worked") &&
      !(skipEmails && (st.key === "brands_contacted" || st.key === "influencers_contacted")),
  );

  const total = steps.length;
  const current = steps[step];
  const isLast = step === total - 1;
  const StepIcon = current.icon;

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Autofocus the active step's field on each transition.
  useEffect(() => {
    if (current.kind !== "rating") {
      inputRef.current?.focus();
    }
  }, [step, current.kind]);

  function validateStep(): boolean {
    if (current.required && current.key === "star_rating" && values.star_rating < 1) {
      toastRef.current.toast({ type: "error", title: "Please rate your day" });
      return false;
    }
    return true;
  }

  function goNext() {
    if (!validateStep()) return;
    if (isLast) {
      void submit();
      return;
    }
    setStep((s) => Math.min(s + 1, total - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function submit() {
    // Block re-entrancy: the footer button is disabled while submitting, but
    // the Enter / ⌘-Enter keyboard path reaches here directly, so guard against
    // a second in-flight POST regardless of how submit was triggered.
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          hours_worked: clampNumber(values.hours_worked, 0, 24),
          star_rating: values.star_rating,
          brands_contacted: clampNumber(
            values.brands_contacted,
            VALIDATION.brandsContacted.min,
            VALIDATION.brandsContacted.max,
          ),
          influencers_contacted: clampNumber(
            values.influencers_contacted,
            VALIDATION.influencersContacted.min,
            VALIDATION.influencersContacted.max,
          ),
          calls_joined: clampNumber(
            values.calls_joined,
            VALIDATION.callsJoined.min,
            VALIDATION.callsJoined.max,
          ),
          revenue: clampNumber(
            values.revenue,
            VALIDATION.deals.revenueMin,
            VALIDATION.deals.revenueMax,
          ),
          profit: clampNumber(
            values.profit,
            VALIDATION.deals.profitMin,
            VALIDATION.deals.profitMax,
          ),
          wins: values.wins || undefined,
          improvements: values.improvements || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: null }));
        toastRef.current.toast({ type: "error", title: err.error || "Failed to submit report" });
        return;
      }

      await res.json();
      toastRef.current.toast({
        type: "success",
        title: isSubmitted ? "Report updated!" : "Report submitted!",
      });
      router.refresh();
    } catch (err) {
      console.error("[ReportForm] submit failed:", err);
      toastRef.current.toast({ type: "error", title: "Failed to submit report" });
    } finally {
      setSubmitting(false);
    }
  }

  // Enter advances on single-line fields; ⌘/Ctrl+Enter advances in textareas.
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    if (current.kind === "textarea") {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        goNext();
      }
      return;
    }
    e.preventDefault();
    goNext();
  }

  const progress = Math.round(((step + 1) / total) * 100);
  const currentTextLength =
    current.kind === "textarea" ? (values[current.key] as string).length : 0;

  return (
    <div className="rounded-[14px] border border-ima-border bg-ima-surface shadow-card overflow-hidden">
      {/* Already known — skipped questions, shown so nothing feels hidden */}
      {(skipHours || skipEmails) && (
        <div className="px-6 md:px-8 py-[14px] bg-ima-surface-accent border-b border-ima-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-[13px] text-ima-text">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ima-primary">
              <Check className="h-4 w-4" aria-hidden="true" />
              Already filled in
            </span>
            {skipHours && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-ima-text-secondary" aria-hidden="true" />
                <span className="font-semibold tabular-nums">{formatHoursMinutes(autoMinutes)}</span> worked
              </span>
            )}
            {skipEmails && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-ima-text-secondary" aria-hidden="true" />
                <span className="font-semibold tabular-nums">
                  {(existingReport?.brands_contacted ?? 0) + (existingReport?.influencers_contacted ?? 0)}
                </span>{" "}
                emails
                <span className="text-ima-text-secondary tabular-nums">
                  ({existingReport?.brands_contacted ?? 0} brands, {existingReport?.influencers_contacted ?? 0} influencers)
                </span>
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setEditPrefilled(true);
              setStep(0);
            }}
            className="min-h-[44px] text-[13px] font-semibold text-ima-primary hover:text-ima-primary-hover rounded-md focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
          >
            Change these
          </button>
        </div>
      )}

      {/* Progress */}
      <div className="px-6 md:px-8 pt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary tabular-nums">
            Question {step + 1} of {total}
          </p>
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary tabular-nums">
            {progress}%
          </p>
        </div>
        <div
          className="mt-3 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label={`Question ${step + 1} of ${total}`}
        >
          <div
            className="h-full rounded-full bg-ima-primary motion-safe:transition-[width] duration-300 ease-expo-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* The single question */}
      <div
        key={step}
        className="px-6 md:px-8 pt-9 md:pt-12 pb-10 md:pb-14 min-h-[300px] flex flex-col motion-safe:animate-riseIn"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-ima-surface-accent text-ima-primary shrink-0">
            <StepIcon className="h-[22px] w-[22px]" aria-hidden="true" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-ima-primary">
            {current.eyebrow}
          </span>
        </div>

        <h2 className="mt-5 text-[24px] md:text-[30px] font-semibold tracking-[-0.01em] leading-[1.15] text-ima-text">
          {current.title}
        </h2>
        {current.helper && (
          <p className="mt-3 text-[14px] text-ima-text-secondary leading-[1.55] max-w-[52ch]">
            {current.helper}
          </p>
        )}

        <div className="mt-8 md:mt-10">
          {current.kind === "number" && (
            <div className="flex items-end gap-3">
              <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                id={current.key}
                type="number"
                inputMode={current.key === "hours_worked" ? "decimal" : "numeric"}
                step={current.step}
                min={current.min}
                max={current.max}
                value={values[current.key] as string}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [current.key]: e.target.value }))
                }
                onFocus={(e) => e.currentTarget.select()}
                aria-label={current.title}
                className="w-[180px] md:w-[220px] h-[72px] md:h-[84px] px-4 text-center text-[40px] md:text-[52px] font-semibold tabular-nums tracking-tight text-ima-primary bg-ima-surface border-2 border-ima-border rounded-2xl leading-none focus:outline-none focus:border-ima-primary focus:ring-4 focus:ring-ima-primary/15 hover:border-ima-primary/40 appearance-none motion-safe:transition-colors [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              {current.suffix && (
                <span className="pb-3 text-[16px] font-medium text-ima-text-secondary">
                  {current.suffix}
                </span>
              )}
            </div>
          )}

          {current.kind === "money" && (
            <div className="flex flex-col sm:flex-row gap-4">
              {(
                [
                  { key: "revenue", label: "Money in" },
                  { key: "profit", label: "Money you kept" },
                ] as const
              ).map((field, i) => (
                <div key={field.key} className="flex-1">
                  <label
                    htmlFor={field.key}
                    className="block text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary mb-2"
                  >
                    {field.label}
                  </label>
                  <div className="relative">
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[24px] font-semibold text-ima-text-secondary"
                    >
                      $
                    </span>
                    <input
                      ref={
                        i === 0
                          ? (inputRef as React.RefObject<HTMLInputElement>)
                          : undefined
                      }
                      id={field.key}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={values[field.key]}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [field.key]: e.target.value }))
                      }
                      onFocus={(e) => e.currentTarget.select()}
                      aria-label={`${field.label} closed today`}
                      className="w-full h-[64px] pl-10 pr-4 text-[28px] md:text-[32px] font-semibold tabular-nums tracking-tight text-ima-primary bg-ima-surface border-2 border-ima-border rounded-2xl leading-none focus:outline-none focus:border-ima-primary focus:ring-4 focus:ring-ima-primary/15 hover:border-ima-primary/40 appearance-none motion-safe:transition-colors [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {current.kind === "rating" && (
            <div>
              <span id="star-rating-label" className="sr-only">
                {current.title}
              </span>
              <StarRating
                value={values.star_rating}
                onChange={(r) => setValues((v) => ({ ...v, star_rating: r }))}
              />
            </div>
          )}

          {current.kind === "textarea" && (
            <div>
              <textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                id={current.key}
                rows={4}
                maxLength={current.maxLength}
                placeholder={current.placeholder}
                value={values[current.key] as string}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [current.key]: e.target.value }))
                }
                aria-label={current.title}
                className="w-full min-h-[120px] px-4 py-3 bg-ima-surface border-2 border-ima-border rounded-2xl text-[16px] text-ima-text leading-[1.6] placeholder:text-ima-text-secondary resize-none focus:outline-none focus:border-ima-primary focus:ring-4 focus:ring-ima-primary/15 motion-safe:transition-colors"
              />
              <p
                className={cn(
                  "text-xs mt-2 text-right tabular-nums",
                  current.maxLength && currentTextLength / current.maxLength >= 0.9
                    ? "font-medium text-ima-warning"
                    : "text-ima-text-secondary",
                )}
              >
                {currentTextLength}/{current.maxLength}
              </p>
            </div>
          )}
        </div>

        <p className="mt-auto pt-8 text-[12px] text-ima-text-secondary">
          {current.kind === "textarea"
            ? "Press ⌘/Ctrl + Enter to continue"
            : "Press Enter to continue"}
        </p>
      </div>

      {/* Footer nav */}
      <div className="px-6 md:px-8 py-5 flex items-center justify-between gap-4 bg-ima-bg border-t border-ima-border">
        <button
          type="button"
          onClick={goBack}
          disabled={step === 0 || submitting}
          className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-full text-sm font-semibold text-ima-text-secondary hover:text-ima-text hover:bg-ima-surface-light motion-safe:transition-colors disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        <button
          type="button"
          onClick={goNext}
          disabled={submitting}
          className="group inline-flex items-center justify-center gap-2 bg-ima-primary hover:bg-ima-primary-hover text-white rounded-full min-h-[48px] px-7 text-sm font-semibold motion-safe:transition-colors duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting
            ? "Saving…"
            : isLast
            ? isSubmitted
              ? "Update report"
              : "Submit report"
            : "Continue"}
          {!submitting &&
            (isLast ? (
              <Check className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArrowRight
                className="h-4 w-4 motion-safe:transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            ))}
        </button>
      </div>
    </div>
  );
}
