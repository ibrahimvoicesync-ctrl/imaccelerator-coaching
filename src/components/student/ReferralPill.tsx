"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { Copy, Check, Share2, Gift, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type PillState = "initial" | "loading" | "ready";

function detectShareSupport(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

/**
 * Floating "Get my referral link" pill. Lives bottom-right on every student
 * page (replaces the former Referral nav tab). Click generates the short link
 * via /api/referral-link, then expands into a copy/share panel.
 */
export function ReferralPill() {
  const { toast } = useToast();
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
    <div className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 print:hidden">
      {pillState === "ready" && shortUrl ? (
        <div className="w-[min(20rem,calc(100vw-2rem))] rounded-[14px] border border-ima-border bg-white p-4 shadow-lg motion-safe:animate-fadeIn">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ima-success/10 text-ima-success">
                <Gift className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-[13px] font-semibold leading-tight text-ima-text">
                  Your referral link
                </p>
                <p className="text-[11px] leading-tight text-ima-text-muted">
                  Earn $500 per friend who joins
                </p>
              </div>
            </div>
            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ima-text-secondary hover:bg-ima-surface-light motion-safe:transition-colors"
              aria-label="Close referral link panel"
              onClick={() => setPillState("initial")}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-[10px] bg-ima-surface-light px-2 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-ima-text">
              {shortUrl}
            </span>
            <button
              type="button"
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg hover:bg-white motion-safe:transition-colors"
              aria-label={copied ? "Copied to clipboard" : "Copy referral link"}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-ima-success" aria-hidden="true" />
                  <span className="ml-1 text-xs font-semibold text-ima-success">Copied!</span>
                </>
              ) : (
                <Copy className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
              )}
            </button>
            {shareSupported && (
              <button
                type="button"
                className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg hover:bg-white motion-safe:transition-colors"
                aria-label="Share referral link"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-ima-primary px-5 py-2.5 text-[14px] font-semibold text-white shadow-md hover:bg-ima-primary-hover hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 disabled:opacity-70 motion-safe:transition-all"
          aria-label="Get my referral link"
          aria-busy={pillState === "loading" || undefined}
          disabled={pillState === "loading"}
          onClick={handleGetLink}
        >
          <Gift className="h-4 w-4" aria-hidden="true" />
          {pillState === "loading" ? "Generating…" : "Get my referral link"}
        </button>
      )}
    </div>
  );
}
