"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useAnimationControls,
  useReducedMotion,
  useSpring,
  useTransform,
  type Transition,
  type Variants,
} from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  Clock,
  Flag,
  HeartPulse,
  Landmark,
  Lock,
  LockOpen,
  Minus,
  Mountain,
  Plus,
  Receipt,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { BUSINESS_CHECKIN } from "@/lib/config";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/types";

type BusinessCheckin = Database["public"]["Tables"]["business_checkins"]["Row"];

export type CheckinMode = "first" | "lapsed" | "update";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** "12,500" / "$12500.50" → 12500.5; "" → null; junk → NaN. */
function parseNumber(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (cleaned === "") return null;
  return Number(cleaned);
}

/** Pretty-print a money string on blur ("12500" → "12,500"); leaves junk alone. */
function formatMoney(raw: string): string {
  const n = parseNumber(raw);
  if (n === null || !Number.isFinite(n)) return raw;
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

// ---------------------------------------------------------------------------
// Motion — critically damped springs by default (no overshoot); content moves
// along the direction of travel and leaves the way it came.
// ---------------------------------------------------------------------------

const SPRING: Transition = { type: "spring", bounce: 0, duration: 0.4 };
const SPRING_SOFT: Transition = { type: "spring", bounce: 0, duration: 0.5 };

const screenVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 28 }),
  center: { opacity: 1, x: 0, transition: SPRING },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -20,
    transition: { duration: 0.14, ease: "easeIn" },
  }),
};

const fadeVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** Follows its content's height on a spring, so screens of different length
 *  resize the card smoothly instead of snapping. */
function AutoHeight({ children, reduced }: { children: ReactNode; reduced: boolean }) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={reduced ? { duration: 0 } : SPRING_SOFT}
      className="overflow-hidden"
    >
      <div ref={innerRef}>{children}</div>
    </motion.div>
  );
}

/** A dollar figure that glides to its new value rather than flicking. */
function AnimatedUsd({ value, reduced }: { value: number; reduced: boolean }) {
  const mv = useSpring(value, { bounce: 0, duration: 0.5 });
  const text = useTransform(mv, (n) => usd(Math.round(n)));
  useEffect(() => {
    if (reduced) mv.jump(value);
    else mv.set(value);
  }, [value, reduced, mv]);
  return <motion.span>{text}</motion.span>;
}

// ---------------------------------------------------------------------------
// Fields — soft filled wells that lift to white with a blue ring on focus.
// ---------------------------------------------------------------------------

const wellBase =
  "bg-ima-surface-light/70 border border-transparent rounded-[14px] text-ima-text placeholder:text-ima-text-muted hover:bg-ima-surface-light focus:bg-white focus:border-ima-primary focus:outline-none focus:ring-4 focus:ring-ima-primary/10 motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-200";

const numberWell = cn(
  wellBase,
  "font-semibold tabular-nums tracking-[-0.02em] leading-none appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
);

const textareaClass = cn(
  wellBase,
  "w-full min-h-[120px] px-4 py-[14px] text-[16px] leading-[1.6] resize-none",
);

const fieldLabel = "block text-[13px] font-medium text-ima-text mb-2";

const pressable = "motion-safe:active:scale-[0.97] motion-safe:transition-transform motion-safe:duration-100";

function MoneyField({
  id,
  label,
  value,
  onChange,
  hint,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex-1 min-w-0">
      <label htmlFor={id} className={fieldLabel}>
        {label}
      </label>
      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-[18px] top-1/2 -translate-y-1/2 text-[22px] font-semibold text-ima-text-secondary"
        >
          $
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(formatMoney(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(numberWell, "w-full h-[64px] pl-10 pr-[18px] text-[28px] md:text-[32px]")}
        />
      </div>
      {hint && <p className="mt-2 text-[12px] text-ima-text-secondary tabular-nums">{hint}</p>}
    </div>
  );
}

/** Count with a − / + stepper either side, so a thumb never needs the keyboard. */
function CountTile({
  id,
  label,
  helper,
  icon: Icon,
  value,
  onChange,
  max,
  autoFocus,
}: {
  id: string;
  label: string;
  helper: string;
  icon: LucideIcon;
  value: string;
  onChange: (v: string) => void;
  max: number;
  autoFocus?: boolean;
}) {
  const n = parseNumber(value);
  const current = n !== null && Number.isFinite(n) ? Math.floor(n) : 0;
  const step = (delta: number) => onChange(String(Math.min(max, Math.max(0, current + delta))));
  const stepBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ima-text shadow-card ring-1 ring-ima-border hover:bg-ima-surface-light disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary";

  return (
    <div className="flex flex-col rounded-[14px] bg-ima-surface-light/70 p-[14px]">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
        <label htmlFor={id} className="text-[13px] font-semibold text-ima-text">
          {label}
        </label>
      </div>
      <p className="mt-1 text-[12px] text-ima-text-secondary leading-snug">{helper}</p>
      <div className="mt-[14px] flex items-center gap-2">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Fewer ${label.toLowerCase()}`}
          onClick={() => step(-1)}
          disabled={current <= 0}
          className={cn(stepBtn, pressable)}
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={max}
          autoFocus={autoFocus}
          value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            numberWell,
            "min-w-0 flex-1 h-[52px] px-2 text-center text-[26px] bg-transparent hover:bg-white/60",
          )}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`More ${label.toLowerCase()}`}
          onClick={() => step(1)}
          disabled={current >= max}
          className={cn(stepBtn, pressable)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function TextAnswer({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
}) {
  const ratio = value.length / BUSINESS_CHECKIN.textMax;
  const nearLimit = ratio >= 0.9;
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        autoFocus={autoFocus}
        maxLength={BUSINESS_CHECKIN.textMax}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
      />
      {/* Counter only surfaces once it matters */}
      <p
        className={cn(
          "text-xs mt-2 text-right tabular-nums motion-safe:transition-opacity motion-safe:duration-200",
          ratio >= 0.6 ? "opacity-100" : "opacity-0",
          nearLimit ? "font-medium text-ima-warning" : "text-ima-text-secondary",
        )}
        aria-hidden={ratio < 0.6}
      >
        {value.length}/{BUSINESS_CHECKIN.textMax}
      </p>
    </div>
  );
}

type Values = {
  total_revenue: string;
  revenue_target_next_month: string;
  liquid_capital_business: string;
  liquid_capital_personal: string;
  monthly_expenses: string;
  employees: string;
  influencers: string;
  brands: string;
  hours_per_week: string;
  current_goal: string;
  current_constraint: string;
  feeling: number;
  feeling_note: string;
  biggest_win: string;
  help_wanted: string;
};

type Step = {
  eyebrow: string;
  icon: LucideIcon;
  title: string;
  helper?: string;
  /** Returns an error message, or null when the step can be left. */
  validate: (v: Values) => string | null;
  render: (v: Values, set: (k: keyof Values) => (val: string) => void) => ReactNode;
  /** Textarea steps continue on ⌘/Ctrl+Enter so Enter can add a newline. */
  multiline?: boolean;
};

function requireMoney(raw: string, label: string): string | null {
  const n = parseNumber(raw);
  if (n === null) return `Enter your ${label} — 0 is fine`;
  if (!Number.isFinite(n) || n < 0) return `${label[0].toUpperCase()}${label.slice(1)} must be a number`;
  if (n > BUSINESS_CHECKIN.moneyMax) return `${label[0].toUpperCase()}${label.slice(1)} is too large`;
  return null;
}

function optionalNumber(raw: string, label: string, opts: { integer?: boolean; max?: number }): string | null {
  const n = parseNumber(raw);
  if (n === null) return null;
  if (!Number.isFinite(n) || n < 0) return `${label} must be a number`;
  if (opts.integer && !Number.isInteger(n)) return `${label} must be a whole number`;
  if (opts.max !== undefined && n > opts.max) return `${label} can be at most ${opts.max}`;
  return null;
}

function requireCount(raw: string, label: string, max: number): string | null {
  if (parseNumber(raw) === null) return `Enter the ${label.toLowerCase()} — 0 is fine`;
  return optionalNumber(raw, label, { integer: true, max });
}

const primaryBtn =
  "group inline-flex items-center justify-center gap-2 bg-ima-primary hover:bg-ima-primary-hover text-white rounded-full min-h-[48px] px-7 text-sm font-semibold shadow-[0_1px_2px_rgba(15,23,42,0.08),0_6px_16px_-6px_rgba(37,99,235,0.45)] motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed";

/**
 * The 30-day business check-in that keeps the AI mentor unlocked — a guided,
 * one-screen-at-a-time flow in the same shape as the daily report (segmented
 * progress, big inputs, Enter to continue), opened by an intro screen and
 * closed by a review and an unlock moment. Prefills from the last check-in so
 * a refresh is mostly confirming, except liquid capital and feeling, which
 * are asked fresh.
 */
export function BusinessCheckinForm({
  previous,
  mode,
  cancelHref,
}: {
  previous: BusinessCheckin | null;
  mode: CheckinMode;
  cancelHref?: string;
}) {
  const routerRef = useRef(useRouter());
  const toastRef = useRef(useToast());
  const reduced = useReducedMotion() ?? false;
  const shake = useAnimationControls();
  const [submitting, setSubmitting] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  // -1 = intro screen (skipped when updating early)
  const [step, setStep] = useState(mode === "update" ? 0 : -1);
  // +1 forward, -1 back — drives which way screens slide
  const [dir, setDir] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const str = (n: number | null | undefined) => (n == null ? "" : formatMoney(String(n)));
  const [v, setV] = useState<Values>({
    total_revenue: str(previous?.total_revenue),
    revenue_target_next_month: str(previous?.revenue_target_next_month),
    liquid_capital_business: "",
    liquid_capital_personal: "",
    monthly_expenses: str(previous?.monthly_expenses),
    employees: previous ? String(previous.employees) : "",
    influencers: previous ? String(previous.influencers) : "",
    brands: previous ? String(previous.brands) : "",
    hours_per_week: previous?.hours_per_week != null ? String(previous.hours_per_week) : "",
    current_goal: previous?.current_goal ?? "",
    current_constraint: previous?.current_constraint ?? "",
    feeling: 0,
    feeling_note: "",
    biggest_win: "",
    help_wanted: previous?.help_wanted ?? "",
  });
  const set = (key: keyof Values) => (value: string) => {
    setError(null);
    setV((prev) => ({ ...prev, [key]: value }));
  };

  const capitalBusiness = parseNumber(v.liquid_capital_business);
  const capitalPersonal = parseNumber(v.liquid_capital_personal);
  const capitalTotal =
    (Number.isFinite(capitalBusiness) ? (capitalBusiness ?? 0) : 0) +
    (Number.isFinite(capitalPersonal) ? (capitalPersonal ?? 0) : 0);
  const expenses = parseNumber(v.monthly_expenses);
  const runwayMonths =
    expenses && Number.isFinite(expenses) && expenses > 0 && capitalBusiness && Number.isFinite(capitalBusiness)
      ? capitalBusiness / expenses
      : null;

  const steps: Step[] = [
    {
      eyebrow: "Results so far",
      icon: TrendingUp,
      title: "Where are your numbers at?",
      helper: "Rough is fine — the AI just needs to know the scale you're working at.",
      validate: (x) =>
        requireMoney(x.total_revenue, "total money made") ??
        requireMoney(x.revenue_target_next_month, "revenue target"),
      render: (x, s) => (
        <div className="flex flex-col sm:flex-row gap-4">
          <MoneyField
            id="ci-total-revenue"
            label="Total made so far"
            value={x.total_revenue}
            onChange={s("total_revenue")}
            autoFocus
          />
          <MoneyField
            id="ci-target"
            label="Target for next month"
            value={x.revenue_target_next_month}
            onChange={s("revenue_target_next_month")}
          />
        </div>
      ),
    },
    {
      eyebrow: "Cash you have",
      icon: Wallet,
      title: "How much cash do you have available right now?",
      helper:
        "This is how the AI tailors its advice to get you the most results. The more cash you put in, the more results you get — so be honest about what you could actually deploy.",
      validate: (x) =>
        requireMoney(x.liquid_capital_business, "business cash") ??
        requireMoney(x.liquid_capital_personal, "personal cash"),
      render: (x, s) => (
        <div>
          <div className="flex flex-col sm:flex-row gap-4">
            <MoneyField
              id="ci-cash-business"
              label="Business · in the bank"
              value={x.liquid_capital_business}
              onChange={s("liquid_capital_business")}
              hint={previous ? `Last time ${usd(previous.liquid_capital_business)}` : undefined}
              autoFocus
            />
            <MoneyField
              id="ci-cash-personal"
              label="Personal · you could invest"
              value={x.liquid_capital_personal}
              onChange={s("liquid_capital_personal")}
              hint={previous ? `Last time ${usd(previous.liquid_capital_personal)}` : undefined}
            />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-[14px] bg-ima-surface-accent px-[18px] py-[14px]">
            <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ima-text">
              <Landmark className="h-4 w-4 text-ima-primary" aria-hidden="true" />
              Total you could put to work
            </span>
            <span
              className="text-[22px] font-semibold tabular-nums tracking-[-0.02em] text-ima-text"
              aria-live="polite"
              aria-label={usd(capitalTotal)}
            >
              <AnimatedUsd value={capitalTotal} reduced={reduced} />
            </span>
          </div>
        </div>
      ),
    },
    {
      eyebrow: "Spending",
      icon: Receipt,
      title: "What does the business cost you each month?",
      helper: "Tools, ads, contractors, subscriptions — a ballpark. Skip it if you're not sure.",
      validate: (x) => optionalNumber(x.monthly_expenses, "Monthly expenses", { max: BUSINESS_CHECKIN.moneyMax }),
      render: (x, s) => (
        <div>
          <div className="max-w-[320px]">
            <MoneyField
              id="ci-expenses"
              label="Monthly expenses · optional"
              value={x.monthly_expenses}
              onChange={s("monthly_expenses")}
              autoFocus
            />
          </div>
          <AnimatePresence initial={false}>
            {runwayMonths !== null && (
              <motion.p
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0, transition: SPRING }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                className="mt-4 text-[13px] text-ima-text-secondary"
              >
                That&apos;s about{" "}
                <span className="font-semibold text-ima-text tabular-nums">
                  {runwayMonths >= 24 ? "24+" : runwayMonths.toFixed(1)} months
                </span>{" "}
                of runway on your business cash.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      ),
    },
    {
      eyebrow: "Your business",
      icon: Briefcase,
      title: "Who's in the business with you?",
      helper: "0 is a perfectly good answer to any of these.",
      validate: (x) =>
        requireCount(x.employees, "Employees", BUSINESS_CHECKIN.employeesMax) ??
        requireCount(x.influencers, "Influencers", BUSINESS_CHECKIN.rosterMax) ??
        requireCount(x.brands, "Brands", BUSINESS_CHECKIN.rosterMax) ??
        optionalNumber(x.hours_per_week, "Hours per week", { integer: true, max: 168 }),
      render: (x, s) => (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-[10px]">
            <CountTile
              id="ci-employees"
              label="Employees"
              helper="Incl. contractors & VAs"
              icon={Users}
              value={x.employees}
              onChange={s("employees")}
              max={BUSINESS_CHECKIN.employeesMax}
              autoFocus
            />
            <CountTile
              id="ci-influencers"
              label="Influencers"
              helper="You work with or manage"
              icon={Sparkles}
              value={x.influencers}
              onChange={s("influencers")}
              max={BUSINESS_CHECKIN.rosterMax}
            />
            <CountTile
              id="ci-brands"
              label="Brands"
              helper="Worked with or in deals"
              icon={Building2}
              value={x.brands}
              onChange={s("brands")}
              max={BUSINESS_CHECKIN.rosterMax}
            />
          </div>
          <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-ima-surface-light/70 py-[10px] pl-[14px] pr-[10px]">
            <label htmlFor="ci-hours" className="inline-flex items-center gap-2 text-[13px] font-semibold text-ima-text">
              <Clock className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
              Hours a week you can put in
              <span className="font-medium text-ima-text-secondary">· optional</span>
            </label>
            <input
              id="ci-hours"
              type="number"
              inputMode="numeric"
              min={0}
              max={168}
              value={x.hours_per_week}
              placeholder="—"
              onChange={(e) => s("hours_per_week")(e.target.value)}
              className={cn(numberWell, "w-[96px] h-[44px] px-3 text-center text-[20px] rounded-[10px] bg-white")}
            />
          </div>
        </div>
      ),
    },
    {
      eyebrow: "Your goal",
      icon: Flag,
      title: "What are you working toward right now?",
      helper: "One goal, as specific as you can make it.",
      multiline: true,
      validate: (x) => (x.current_goal.trim() ? null : "Tell us your current goal"),
      render: (x, s) => (
        <TextAnswer
          id="ci-goal"
          label="Current goal"
          value={x.current_goal}
          onChange={s("current_goal")}
          placeholder="e.g. Close my first $3k brand deal this month"
          autoFocus
        />
      ),
    },
    {
      eyebrow: "What's stopping you",
      icon: Mountain,
      title: "What's the one thing holding you back most?",
      helper: "Time, money, skills, confidence, leads — name the real bottleneck.",
      multiline: true,
      validate: (x) => (x.current_constraint.trim() ? null : "Tell us your current constraint"),
      render: (x, s) => (
        <TextAnswer
          id="ci-constraint"
          label="Current constraint"
          value={x.current_constraint}
          onChange={s("current_constraint")}
          placeholder="e.g. I get replies but can't get brands onto a call"
          autoFocus
        />
      ),
    },
    {
      eyebrow: "How you're doing",
      icon: HeartPulse,
      title: "How are you feeling about the business?",
      helper: "No wrong answer — it helps the AI pitch its advice at the right level.",
      multiline: true,
      validate: (x) => (x.feeling ? null : "Pick how you're feeling"),
      render: (x, s) => (
        <div>
          {/* Segmented control — the white thumb glides to the chosen option */}
          <div
            role="radiogroup"
            aria-label="How are you feeling?"
            className="grid grid-cols-5 gap-1 rounded-[16px] bg-ima-surface-light/70 p-1"
          >
            {BUSINESS_CHECKIN.feelings.map((f) => {
              const checked = x.feeling === f.value;
              return (
                <button
                  key={f.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => {
                    setError(null);
                    setV((prev) => ({ ...prev, feeling: f.value }));
                  }}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1.5 min-h-[84px] rounded-[12px] px-1 focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
                    pressable,
                    !checked && "hover:bg-white/60",
                  )}
                >
                  {checked && (
                    <motion.span
                      layoutId="feeling-thumb"
                      className="absolute inset-0 rounded-[12px] bg-white shadow-card ring-1 ring-ima-border/70"
                      transition={reduced ? { duration: 0 } : SPRING}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={cn(
                      "relative text-[24px] font-semibold tabular-nums leading-none motion-safe:transition-colors",
                      checked ? "text-ima-primary" : "text-ima-text",
                    )}
                  >
                    {f.value}
                  </span>
                  <span
                    className={cn(
                      "relative text-[11px] md:text-[12px] font-semibold text-center leading-tight motion-safe:transition-colors",
                      checked ? "text-ima-text" : "text-ima-text-secondary",
                    )}
                  >
                    {f.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-6">
            <label htmlFor="ci-feeling-note" className={fieldLabel}>
              Anything behind that? <span className="font-normal text-ima-text-secondary">· optional</span>
            </label>
            <TextAnswer
              id="ci-feeling-note"
              label="Anything behind that?"
              value={x.feeling_note}
              onChange={s("feeling_note")}
              rows={2}
            />
          </div>
        </div>
      ),
    },
    {
      eyebrow: "Last two",
      icon: Sparkles,
      title: "A win, and where you want help",
      helper: "Both optional — but the more the AI knows, the sharper its advice.",
      multiline: true,
      validate: () => null,
      render: (x, s) => (
        <div className="flex flex-col gap-5">
          <div>
            <label htmlFor="ci-win" className={fieldLabel}>
              Biggest win in the last 30 days
            </label>
            <TextAnswer id="ci-win" label="Biggest win" value={x.biggest_win} onChange={s("biggest_win")} rows={2} autoFocus />
          </div>
          <div>
            <label htmlFor="ci-help" className={fieldLabel}>
              What should the AI help you with most this month?
            </label>
            <TextAnswer
              id="ci-help"
              label="Where you want help"
              value={x.help_wanted}
              onChange={s("help_wanted")}
              placeholder="e.g. Pricing my first brand package"
              rows={2}
            />
          </div>
        </div>
      ),
    },
  ];

  const total = steps.length;
  const reviewStep = total; // index after the last question
  const isIntro = step === -1;
  const isReview = step === reviewStep;
  const current = !isIntro && !isReview ? steps[step] : null;

  // Move focus into each new screen for keyboard / screen-reader users when
  // the screen has no autofocus field of its own. Runs once the screen has
  // finished arriving (AnimatePresence mounts it after the old one leaves).
  function focusScreen() {
    const root = bodyRef.current;
    if (root && !root.contains(document.activeElement)) root.focus({ preventScroll: true });
  }

  function go(to: number) {
    setDir(to >= step ? 1 : -1);
    setStep(to);
  }

  function rejectWith(message: string) {
    setError(message);
    // The "no" shake — a quick, decaying side-to-side, like a wrong passcode
    if (!reduced) void shake.start({ x: [0, -9, 8, -5, 3, 0], transition: { duration: 0.42, ease: "easeOut" } });
  }

  function goNext() {
    if (current) {
      const message = current.validate(v);
      if (message) {
        rejectWith(message);
        return;
      }
    }
    setError(null);
    if (isReview) {
      void submit();
      return;
    }
    go(step + 1);
  }

  function goBack() {
    setError(null);
    go(Math.max(mode === "update" ? 0 : -1, step - 1));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "A") return;
    if (target.tagName === "TEXTAREA" && !(e.metaKey || e.ctrlKey)) return;
    e.preventDefault();
    goNext();
  }

  async function submit() {
    if (submitting) return;
    for (let i = 0; i < steps.length; i++) {
      const message = steps[i].validate(v);
      if (message) {
        go(i);
        setError(message);
        return;
      }
    }

    const num = (raw: string) => parseNumber(raw);
    const payload = {
      total_revenue: num(v.total_revenue),
      revenue_target_next_month: num(v.revenue_target_next_month),
      liquid_capital_business: num(v.liquid_capital_business),
      liquid_capital_personal: num(v.liquid_capital_personal),
      monthly_expenses: num(v.monthly_expenses),
      employees: num(v.employees),
      influencers: num(v.influencers),
      brands: num(v.brands),
      hours_per_week: num(v.hours_per_week),
      current_goal: v.current_goal,
      current_constraint: v.current_constraint,
      feeling: v.feeling,
      feeling_note: v.feeling_note,
      biggest_win: v.biggest_win,
      help_wanted: v.help_wanted,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/business-checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't save your check-in" });
        return;
      }
      // Unlock moment: the padlock opens, then we hand off to the AI.
      setUnlocked(true);
      toastRef.current.toast({
        type: "success",
        title: "Check-in saved",
        description: `Your AI mentor is unlocked for the next ${BUSINESS_CHECKIN.refreshDays} days.`,
      });
      await new Promise((r) => setTimeout(r, reduced ? 300 : 1300));
      routerRef.current.replace("/student/ask");
      routerRef.current.refresh();
    } catch (err) {
      console.error("[BusinessCheckinForm] submit failed:", err);
      toastRef.current.toast({ type: "error", title: "Something went wrong. Please try again." });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Unlocked
  // ---------------------------------------------------------------------------
  if (unlocked) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="unlocked"
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1, transition: SPRING }}
          className="rounded-[14px] border border-ima-border bg-ima-surface shadow-card px-6 py-14 md:py-16 flex flex-col items-center text-center"
          role="status"
        >
          <div className="relative flex h-16 w-16 items-center justify-center">
            {!reduced && (
              <motion.span
                className="absolute inset-0 rounded-full bg-ima-success-bright/20"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0.6, 1.6], opacity: [0.6, 0] }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.25 }}
                aria-hidden="true"
              />
            )}
            <motion.span
              className="relative flex h-16 w-16 items-center justify-center rounded-full bg-ima-success-bright text-white"
              initial={reduced ? false : { scale: 0.7 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", bounce: 0.35, duration: 0.5 }}
            >
              <motion.span
                initial={reduced ? false : { rotate: -18, opacity: 0, y: 2 }}
                animate={{ rotate: 0, opacity: 1, y: 0 }}
                transition={{ type: "spring", bounce: 0.4, duration: 0.5, delay: reduced ? 0 : 0.12 }}
                className="flex"
              >
                <LockOpen className="h-7 w-7" aria-hidden="true" />
              </motion.span>
            </motion.span>
          </div>
          <h2 className="mt-6 text-[24px] md:text-[28px] font-semibold tracking-[-0.02em] leading-[1.1] text-ima-text">
            Your AI mentor is unlocked
          </h2>
          <p className="mt-2 text-[14px] text-ima-text-secondary">
            Good for the next {BUSINESS_CHECKIN.refreshDays} days. Taking you there now…
          </p>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---------------------------------------------------------------------------
  // Intro
  // ---------------------------------------------------------------------------
  if (isIntro) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="intro"
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0, transition: SPRING_SOFT }}
          exit={reduced ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, y: -8, scale: 0.985, transition: { duration: 0.18, ease: "easeIn" } }}
          // Sanctioned gradient exception (2026-10-10, on request): the unlock intro
          // is the one blue-gradient hero in the product. Kept within the blue ramp
          // (secondary → primary) so white text clears AA across the whole card.
          className="relative isolate overflow-hidden rounded-[14px] bg-[linear-gradient(135deg,#2563EB_0%,#1E40AF_50%,#172554_100%)] shadow-[0_1px_2px_rgba(15,23,42,0.08),0_20px_48px_-20px_rgba(30,64,175,0.55)]"
        >
          {/* Soft top glow + a fine bright edge, like light catching glass */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(120%_70%_at_50%_-10%,rgba(255,255,255,0.28),transparent_60%)]"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[14px] ring-1 ring-inset ring-white/15"
          />
          {/* The shine — a diagonal highlight that sweeps across every few seconds */}
          {!reduced && (
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -z-10 bg-[linear-gradient(105deg,transparent_20%,rgba(255,255,255,0.22)_50%,transparent_80%)]"
              initial={{ x: "0%" }}
              animate={{ x: ["0%", "400%"] }}
              transition={{ duration: 1.6, ease: [0.4, 0, 0.2, 1], repeat: Infinity, repeatDelay: 3.2, delay: 0.6 }}
            />
          )}
          <div className="px-6 md:px-10 pt-10 md:pt-14 pb-9 md:pb-10 flex flex-col items-center text-center">
            <motion.span
              initial={reduced ? false : { scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...SPRING, delay: 0.08 }}
              className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-white text-ima-primary shadow-[0_8px_24px_-8px_rgba(15,23,42,0.4)]"
            >
              <Lock className="h-6 w-6" aria-hidden="true" />
            </motion.span>
            <h2 className="mt-6 text-[28px] md:text-[34px] font-semibold tracking-[-0.02em] leading-[1.1] text-white">
              {mode === "lapsed" ? "Time for your monthly check-in" : "Unlock your AI mentor"}
            </h2>
            <p className="mt-3 max-w-[48ch] text-[15px] text-white/90 leading-[1.55]">
              {mode === "lapsed"
                ? `It's been over ${BUSINESS_CHECKIN.refreshDays} days since your last snapshot. Bring the AI up to date and it unlocks again.`
                : "Give the AI an honest snapshot of your business, and it tailors its advice to get you the most results."}
            </p>

            <button
              type="button"
              onClick={() => go(0)}
              className="group mt-9 inline-flex min-h-[48px] min-w-[220px] items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-ima-primary shadow-[0_8px_24px_-8px_rgba(15,23,42,0.45)] hover:bg-ima-surface-accent motion-safe:transition-[background-color,transform] motion-safe:duration-150 motion-safe:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ima-primary"
            >
              {mode === "lapsed" ? "Start check-in" : "Get started"}
              <ArrowRight
                className="h-4 w-4 motion-safe:transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </button>
            <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-white/90">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Private to you and your coaching team
            </p>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // ---------------------------------------------------------------------------
  // Questions + review
  // ---------------------------------------------------------------------------
  const position = isReview ? total : step + 1;
  const StepIcon = current?.icon ?? Check;
  const feelingLabel = BUSINESS_CHECKIN.feelings.find((f) => f.value === v.feeling)?.label ?? "—";
  const show = (raw: string) => {
    const n = parseNumber(raw);
    return n === null || !Number.isFinite(n) ? "—" : usd(n);
  };
  const review: { label: string; value: string; step: number }[] = [
    { label: "Total made so far", value: show(v.total_revenue), step: 0 },
    { label: "Target next month", value: show(v.revenue_target_next_month), step: 0 },
    { label: "Business cash", value: show(v.liquid_capital_business), step: 1 },
    { label: "Personal cash", value: show(v.liquid_capital_personal), step: 1 },
    { label: "Monthly expenses", value: show(v.monthly_expenses), step: 2 },
    { label: "Employees · Influencers · Brands", value: `${v.employees || 0} · ${v.influencers || 0} · ${v.brands || 0}`, step: 3 },
    { label: "Feeling", value: feelingLabel, step: 6 },
  ];

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="form"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0, transition: SPRING_SOFT }}
        exit={reduced ? { opacity: 0, transition: { duration: 0.12 } } : { opacity: 0, y: -8, scale: 0.985, transition: { duration: 0.18, ease: "easeIn" } }}
        className="rounded-[14px] border border-ima-border bg-ima-surface shadow-card overflow-hidden"
      >
        {/* Progress — one segment per question, filling on a spring */}
        <div className="px-6 md:px-8 pt-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-medium text-ima-text-secondary tabular-nums">
              {isReview ? "Review" : `${step + 1} of ${total}`}
            </p>
            {cancelHref && (
              <Link
                href={cancelHref}
                className="inline-flex items-center min-h-[44px] -my-3 px-2 -mx-2 text-[13px] font-medium text-ima-text-secondary hover:text-ima-text rounded-md focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2"
              >
                Cancel
              </Link>
            )}
          </div>
          <div
            className="mt-3 flex gap-1"
            role="progressbar"
            aria-valuenow={position}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-label={`Check-in progress: ${position} of ${total}`}
          >
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-ima-surface-light">
                <motion.span
                  className="block h-full rounded-full bg-ima-primary"
                  initial={false}
                  animate={{ scaleX: i < position ? 1 : 0 }}
                  style={{ originX: 0 }}
                  transition={reduced ? { duration: 0 } : SPRING}
                />
              </span>
            ))}
          </div>
        </div>

        {/* The screen */}
        <motion.div animate={shake}>
          <AutoHeight reduced={reduced}>
            <AnimatePresence mode="wait" initial={false} custom={dir}>
              <motion.div
                key={step}
                ref={bodyRef}
                tabIndex={-1}
                onKeyDown={onKeyDown}
                custom={dir}
                variants={reduced ? fadeVariants : screenVariants}
                initial="enter"
                animate="center"
                exit="exit"
                onAnimationComplete={(def) => {
                  if (def === "center") focusScreen();
                }}
                className="px-6 md:px-8 pt-8 md:pt-10 pb-8 md:pb-10 min-h-[340px] flex flex-col outline-none"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-ima-surface-light text-ima-text shrink-0">
                    <StepIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-[13px] font-medium text-ima-text-secondary">
                    {isReview ? "Almost done" : current?.eyebrow}
                  </span>
                </div>

                <h2 className="mt-5 text-[24px] md:text-[30px] font-semibold tracking-[-0.02em] leading-[1.12] text-ima-text">
                  {isReview ? "Does this look right?" : current?.title}
                </h2>
                {(isReview || current?.helper) && (
                  <p className="mt-3 text-[14px] text-ima-text-secondary leading-[1.55] max-w-[58ch]">
                    {isReview
                      ? `Tap any line to change it. Saving unlocks the AI for the next ${BUSINESS_CHECKIN.refreshDays} days.`
                      : current?.helper}
                  </p>
                )}

                <div className="mt-8">
                  {current?.render(v, set)}

                  {isReview && (
                    <div className="flex flex-col gap-[10px]">
                      <ul className="rounded-[14px] bg-ima-surface-light/70 p-1">
                        {review.map((r) => (
                          <li key={r.label}>
                            <button
                              type="button"
                              onClick={() => go(r.step)}
                              className={cn(
                                "group w-full flex items-center justify-between gap-4 rounded-[10px] px-[14px] min-h-[48px] text-left hover:bg-white focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:-outline-offset-2 motion-safe:transition-colors",
                              )}
                            >
                              <span className="text-[13px] text-ima-text-secondary">{r.label}</span>
                              <span className="inline-flex items-center gap-1.5">
                                <span className="text-[15px] font-semibold tabular-nums text-ima-text">{r.value}</span>
                                <ChevronRight
                                  className="h-4 w-4 text-ima-text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 group-focus-visible:opacity-100 motion-safe:transition-[opacity,transform] motion-safe:duration-200"
                                  aria-hidden="true"
                                />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      {(
                        [
                          { label: "Goal", value: v.current_goal, step: 4 },
                          { label: "What's stopping you", value: v.current_constraint, step: 5 },
                        ] as const
                      ).map((r) => (
                        <button
                          key={r.label}
                          type="button"
                          onClick={() => go(r.step)}
                          className="text-left rounded-[14px] bg-ima-surface-light/70 px-[18px] py-[14px] hover:bg-ima-surface-light focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 motion-safe:transition-colors"
                        >
                          <span className="block text-[12px] font-medium text-ima-text-secondary">{r.label}</span>
                          <span className="mt-1 block text-[14px] text-ima-text leading-[1.55] line-clamp-3">{r.value}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-auto pt-8 min-h-[52px]">
                  <AnimatePresence mode="wait" initial={false}>
                    {error ? (
                      <motion.p
                        key="error"
                        role="alert"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0, transition: SPRING }}
                        exit={{ opacity: 0, transition: { duration: 0.1 } }}
                        className="text-[13px] font-medium text-ima-error"
                      >
                        {error}
                      </motion.p>
                    ) : (
                      !isReview && (
                        <motion.p
                          key="hint"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, transition: { duration: 0.1 } }}
                          className="hidden md:block text-[12px] text-ima-text-secondary"
                        >
                          {current?.multiline ? (
                            <>
                              Press <Kbd>⌘/Ctrl</Kbd> <Kbd>Enter</Kbd> to continue
                            </>
                          ) : (
                            <>
                              Press <Kbd>Enter</Kbd> to continue
                            </>
                          )}
                        </motion.p>
                      )
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            </AnimatePresence>
          </AutoHeight>
        </motion.div>

        {/* Footer nav */}
        <div className="px-6 md:px-8 py-4 flex items-center justify-between gap-4 border-t border-ima-border">
          <button
            type="button"
            onClick={goBack}
            disabled={(mode === "update" && step === 0) || submitting}
            className={cn(
              "inline-flex items-center gap-2 min-h-[44px] px-4 -ml-2 rounded-full text-sm font-semibold text-ima-text-secondary hover:text-ima-text hover:bg-ima-surface-light motion-safe:transition-colors disabled:opacity-40 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2",
              pressable,
            )}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back
          </button>

          <button type="button" onClick={goNext} disabled={submitting} className={primaryBtn}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={submitting ? "saving" : isReview ? "save" : step === total - 1 ? "review" : "continue"}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18 } }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, transition: { duration: 0.1 } }}
                className="inline-flex items-center gap-2"
              >
                {submitting
                  ? "Saving…"
                  : isReview
                    ? mode === "update"
                      ? "Save check-in"
                      : "Save & unlock AI"
                    : step === total - 1
                      ? "Review"
                      : "Continue"}
                {!submitting &&
                  (isReview ? (
                    <Lock className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ArrowRight
                      className="h-4 w-4 motion-safe:transition-transform duration-200 ease-out group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  ))}
              </motion.span>
            </AnimatePresence>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[20px] items-center justify-center rounded-[6px] border border-ima-border bg-white px-1.5 py-px font-sans text-[11px] font-medium text-ima-text shadow-[0_1px_0_rgba(15,23,42,0.06)]">
      {children}
    </kbd>
  );
}
