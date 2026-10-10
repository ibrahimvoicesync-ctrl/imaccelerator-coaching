"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { Copy, Check, Share2, Gift, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useToast } from "@/components/ui/Toast";

type PillState = "initial" | "loading" | "ready";

function detectShareSupport(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * "Get my referral link" row at the foot of the student sidebar, above the
 * account card (replaces the former Referral nav tab and floating pill). Click
 * generates the short link via /api/referral-link, then expands in place into
 * a copy/share panel.
 */
export function ReferralPill() {
  const { toast } = useToast();
  const reduced = useReducedMotion() ?? false;
  const toastRef = useRef(toast);
  useLayoutEffect(() => {
    toastRef.current = toast;
  });

  const [pillState, setPillState] = useState<PillState>("initial");
  const [shortUrl, setShortUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareSupported] = useState<boolean>(detectShareSupport);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleGetLink = useCallback(async () => {
    // If we already have the link, just re-open the panel.
    if (shortUrl) {
      setPillState("ready");
      return;
    }
    setPillState("loading");
    try {
      const res = await fetch("/api/referral-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[ReferralPill]", err);
        toastRef.current({
          type: "error",
          title: "Could not generate your link",
          description: "Please try again.",
        });
        setPillState("initial");
        return;
      }
      const data = await res.json();
      if (!data?.shortUrl || typeof data.shortUrl !== "string") {
        console.error("[ReferralPill] unexpected response shape:", data);
        toastRef.current({
          type: "error",
          title: "Could not generate your link",
          description: "Please try again.",
        });
        setPillState("initial");
        return;
      }
      setShortUrl(data.shortUrl as string);
      setPillState("ready");
    } catch (err) {
      console.error("[ReferralPill]", err);
      toastRef.current({
        type: "error",
        title: "Could not generate your link",
        description: "Please try again.",
      });
      setPillState("initial");
    }
  }, [shortUrl]);

  const handleCopy = useCallback(async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[ReferralPill] clipboard error:", err);
      toastRef.current({
        type: "error",
        title: "Copy failed — please copy the URL manually",
      });
    }
  }, [shortUrl]);

  const handleShare = useCallback(async () => {
    if (!shortUrl) return;
    try {
      await navigator.share({ url: shortUrl, title: "IMA Accelerator Referral" });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      console.error("[ReferralPill] share error:", err);
      toastRef.current({ type: "error", title: "Share failed" });
    }
  }, [shortUrl]);

  return (
    <div className="print:hidden">
      <AnimatePresence initial={false} mode="wait">
        {pillState === "ready" && shortUrl ? (
          <motion.div
            key="panel"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduced ? { duration: 0.12 } : { type: "spring", bounce: 0, duration: 0.35 }}
            className="overflow-hidden"
          >
            <div className="rounded-[12px] bg-white p-[10px] shadow-card ring-1 ring-ima-sidebar-border">
              <div className="flex items-center justify-between gap-2 pl-1">
                <p className="text-[12px] font-semibold text-ima-text">Your referral link</p>
                <button
                  type="button"
                  className="-my-2 -mr-2 flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg text-ima-text-secondary hover:bg-ima-sidebar-hover hover:text-ima-text motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
                  aria-label="Close referral link panel"
                  onClick={() => setPillState("initial")}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="pl-1 text-[11px] leading-tight text-ima-text-secondary">
                Earn $500 per friend who joins
              </p>
              <div className="mt-2 flex items-center gap-1 rounded-[8px] bg-ima-surface-light py-0.5 pl-2 pr-0.5">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ima-text" title={shortUrl}>
                  {shortUrl.replace(/^https?:\/\//, "")}
                </span>
                <button
                  type="button"
                  className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-[6px] hover:bg-white motion-safe:transition-colors motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
                  aria-label={copied ? "Copied to clipboard" : "Copy referral link"}
                  title={copied ? "Copied!" : "Copy"}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-ima-success" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
                  )}
                </button>
                {shareSupported && (
                  <button
                    type="button"
                    className="flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-[6px] hover:bg-white motion-safe:transition-colors motion-safe:active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary"
                    aria-label="Share referral link"
                    title="Share"
                    onClick={handleShare}
                  >
                    <Share2 className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.button
            key="button"
            type="button"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            className="group flex w-full min-h-[44px] items-center gap-3 rounded-[10px] px-3 text-[14px] font-medium text-ima-text-secondary hover:bg-ima-sidebar-hover hover:text-ima-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary disabled:opacity-70 motion-safe:transition-[color,background-color,transform] motion-safe:duration-150 motion-safe:active:scale-[0.98]"
            aria-busy={pillState === "loading" || undefined}
            disabled={pillState === "loading"}
            onClick={handleGetLink}
          >
            <Gift className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span className="truncate">
              {pillState === "loading" ? "Generating…" : "Get my referral link"}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
