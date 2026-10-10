"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Minus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { KPI_TARGETS } from "@/lib/config";
import { EMAIL_SERIES_COLORS, type EmailCounts } from "@/lib/emails";
import { cn } from "@/lib/utils";

type Kind = "brands" | "influencers" | "total";
type Deltas = Record<Kind, number>;

const STEPS = [1, 5, 10] as const;
const FLUSH_MS = 700;
const ZERO: Deltas = { brands: 0, influencers: 0, total: 0 };

/**
 * Email logging built for zero friction: one big counter per audience, tap
 * +1 / +5 / +10 as you send, and it saves by itself. Taps update the screen
 * instantly and are batched into one request after a short pause; a "−"
 * fixes a mis-tap. "Not sure who it went to?" reveals a third counter that
 * adds to the total without a split.
 */
export function QuickEmailLog({ initialCounts }: { initialCounts: EmailCounts }) {
  const toastRef = useRef(useToast());
  const routerRef = useRef(useRouter());
  const [counts, setCounts] = useState<EmailCounts>(initialCounts);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const unsplitStart = initialCounts.total - initialCounts.brands - initialCounts.influencers;
  const [showOther, setShowOther] = useState(unsplitStart > 0);

  const pending = useRef<Deltas>({ ...ZERO });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const unsplit = counts.total - counts.brands - counts.influencers;
  const goal = KPI_TARGETS.dailyOutreach;
  const pct = goal > 0 ? Math.min(100, Math.round((counts.total / goal) * 100)) : 0;
  const goalMet = counts.total >= goal;

  async function flush() {
    timer.current = null;
    if (inFlight.current) {
      // A request is already out — try again once it lands.
      timer.current = setTimeout(flush, FLUSH_MS);
      return;
    }
    const batch = pending.current;
    if (!batch.brands && !batch.influencers && !batch.total) return;
    pending.current = { ...ZERO };
    inFlight.current = true;
    setStatus("saving");
    try {
      const res = await fetch("/api/reports/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Couldn't save your emails");
      }
      const json = (await res.json()) as { data: EmailCounts };
      // Only adopt the server's numbers if no new taps arrived meanwhile.
      const p = pending.current;
      if (!p.brands && !p.influencers && !p.total) setCounts(json.data);
      setStatus("saved");
      // Re-render the server layout so the top progress strip picks up the new count.
      routerRef.current.refresh();
    } catch (err) {
      console.error("[QuickEmailLog] save failed:", err);
      // Roll the unsaved taps back off the screen.
      setCounts((c) => ({
        brands: c.brands - batch.brands,
        influencers: c.influencers - batch.influencers,
        total: c.total - batch.brands - batch.influencers - batch.total,
      }));
      setStatus("idle");
      toastRef.current.toast({
        type: "error",
        title: err instanceof Error ? err.message : "Couldn't save your emails",
        description: "Please tap again.",
      });
    } finally {
      inFlight.current = false;
    }
  }

  // Don't lose taps made right before leaving the page.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      const batch = pending.current;
      if (batch.brands || batch.influencers || batch.total) {
        fetch("/api/reports/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(batch),
          keepalive: true,
        }).catch((err) => console.error("[QuickEmailLog] final save failed:", err));
      }
    };
  }, []);

  function add(kind: Kind, n: number) {
    const current = kind === "total" ? unsplit : counts[kind];
    const delta = Math.max(-current, n); // never below zero
    if (delta === 0) return;
    setCounts((c) => ({
      brands: kind === "brands" ? c.brands + delta : c.brands,
      influencers: kind === "influencers" ? c.influencers + delta : c.influencers,
      total: c.total + delta,
    }));
    pending.current = { ...pending.current, [kind]: pending.current[kind] + delta };
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, FLUSH_MS);
  }

  return (
    <section
      id="log-emails"
      aria-labelledby="log-emails-label"
      className="scroll-mt-8 bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-8 motion-safe:animate-fadeIn"
    >
      {/* Today's total */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p id="log-emails-label" className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-text-secondary">
            Emails sent today
          </p>
          <p className="mt-2 flex items-end gap-2">
            <span
              className={cn(
                "text-[44px] md:text-[52px] font-semibold tabular-nums tracking-tight leading-none",
                goalMet ? "text-ima-success" : "text-ima-text",
              )}
            >
              {counts.total}
            </span>
            <span className="pb-1.5 text-[15px] font-medium text-ima-text-secondary tabular-nums">/ {goal}</span>
          </p>
        </div>
        <p className="pb-1.5 text-[12px] font-semibold text-ima-text-secondary" aria-live="polite">
          {status === "saving" ? (
            "Saving…"
          ) : status === "saved" ? (
            <span className="inline-flex items-center gap-1 text-ima-success">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Saved
            </span>
          ) : null}
        </p>
      </div>
      <div
        className="mt-4 h-[6px] rounded-full bg-ima-surface-light overflow-hidden"
        role="progressbar"
        aria-valuenow={counts.total}
        aria-valuemin={0}
        aria-valuemax={goal}
        aria-label={`Emails today: ${counts.total} of ${goal}`}
      >
        <div
          className={cn(
            "h-full rounded-full motion-safe:transition-[width] duration-300 ease-out",
            goalMet ? "bg-ima-success" : "bg-ima-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-6 text-[15px] text-ima-text">
        Sent some emails? <span className="text-ima-text-secondary">Tap a button to add them.</span>
      </p>

      {/* The counters */}
      <div className="mt-[14px] grid grid-cols-1 sm:grid-cols-2 gap-[14px]">
        <Counter label="To brands" color={EMAIL_SERIES_COLORS.brands} value={counts.brands} onAdd={(n) => add("brands", n)} />
        <Counter
          label="To influencers"
          color={EMAIL_SERIES_COLORS.influencers}
          value={counts.influencers}
          onAdd={(n) => add("influencers", n)}
        />
        {showOther && (
          <div className="sm:col-span-2">
            <Counter label="Not sure who" value={unsplit} onAdd={(n) => add("total", n)} />
          </div>
        )}
      </div>

      {!showOther && (
        <button
          type="button"
          onClick={() => setShowOther(true)}
          className="mt-[14px] min-h-[44px] text-[13px] font-semibold text-ima-text-secondary hover:text-ima-primary rounded-md motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
        >
          Not sure who you emailed? Add them here instead
        </button>
      )}
    </section>
  );
}

function Counter({
  label,
  color,
  value,
  onAdd,
}: {
  label: string;
  color?: string;
  value: number;
  onAdd: (n: number) => void;
}) {
  return (
    <div className="rounded-[14px] border border-ima-border p-[18px]">
      <div className="flex items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-[15px] font-semibold text-ima-text">
          {color && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />}
          {label}
        </p>
        <span className="text-[32px] font-semibold tabular-nums tracking-tight leading-none text-ima-text" aria-live="polite">
          {value}
        </span>
      </div>
      <div className="mt-[14px] flex gap-[10px]">
        <button
          type="button"
          onClick={() => onAdd(-1)}
          disabled={value <= 0}
          aria-label={`Remove one email ${label.toLowerCase()}`}
          className="h-[52px] w-[52px] shrink-0 inline-flex items-center justify-center rounded-[12px] border border-ima-border text-ima-text-secondary hover:bg-ima-surface-light hover:text-ima-text active:scale-[0.97] motion-safe:transition-[background-color,color,transform] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        {STEPS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onAdd(n)}
            aria-label={`Add ${n} email${n === 1 ? "" : "s"} ${label.toLowerCase()}`}
            className="flex-1 h-[52px] rounded-[12px] bg-ima-surface-accent text-ima-primary text-[17px] font-semibold tabular-nums hover:bg-ima-primary hover:text-white active:scale-[0.97] motion-safe:transition-[background-color,color,transform] focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
          >
            +{n}
          </button>
        ))}
      </div>
    </div>
  );
}
