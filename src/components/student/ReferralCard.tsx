"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { Copy, Check, Share2, Gift, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type CardState = "initial" | "loading" | "ready";

function detectShareSupport(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function";
}

export function ReferralCard() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  useLayoutEffect(() => {
    toastRef.current = toast;
  });

  const [cardState, setCardState] = useState<CardState>("initial");
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
    setCardState("loading");
    try {
      const res = await fetch("/api/referral-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("[ReferralCard]", err);
        toastRef.current({
          type: "error",
          title: "Could not generate your link",
          description: "Please try again.",
        });
        setCardState("initial");
        return;
      }
      const data = await res.json();
      if (!data?.shortUrl || typeof data.shortUrl !== "string") {
        console.error("[ReferralCard] unexpected response shape:", data);
        toastRef.current({
          type: "error",
          title: "Could not generate your link",
          description: "Please try again.",
        });
        setCardState("initial");
        return;
      }
      setShortUrl(data.shortUrl as string);
      setCardState("ready");
    } catch (err) {
      console.error("[ReferralCard]", err);
      toastRef.current({
        type: "error",
        title: "Could not generate your link",
        description: "Please try again.",
      });
      setCardState("initial");
    }
  }, []);

  const handleCopy = useCallback(async () => {
    if (!shortUrl) return;
    try {
      await navigator.clipboard.writeText(shortUrl);
      setCopied(true);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("[ReferralCard] clipboard error:", err);
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
      console.error("[ReferralCard] share error:", err);
      toastRef.current({ type: "error", title: "Share failed" });
    }
  }, [shortUrl]);

  return (
    <section
      id="referral"
      tabIndex={-1}
      className="scroll-mt-6 bg-white border border-ima-border rounded-[14px] shadow-card p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 focus:outline-none"
    >
      <div className="flex-1">
        <div className="inline-flex items-center gap-2 bg-ima-success/10 text-ima-success px-3 py-1 rounded-full text-[10px] uppercase tracking-[0.08em] font-semibold mb-4">
          <Gift className="h-3.5 w-3.5" aria-hidden="true" />
          Partner Program
        </div>
        <h2 className="text-[22px] md:text-[24px] font-bold tracking-[-0.01em] text-ima-text mb-2">
          Refer a Friend — Earn $500
        </h2>
        <p className="text-[14px] md:text-[15px] text-ima-text-secondary max-w-xl leading-relaxed">
          Know someone who could benefit from the IMA Accelerator? Share your unique link.
          When they sign up, you get a $500 bonus.
        </p>
      </div>

      <div className="w-full md:w-auto md:shrink-0">
        {cardState !== "ready" && (
          <Button
            variant="primary"
            size="md"
            className="w-full md:w-auto gap-2"
            aria-label="Get My Link"
            loading={cardState === "loading"}
            disabled={cardState === "loading"}
            onClick={handleGetLink}
          >
            {cardState === "loading" ? null : (
              <>
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Get My Link
              </>
            )}
          </Button>
        )}

        {cardState === "ready" && shortUrl && (
          <div className="flex items-center gap-2 bg-ima-surface-light rounded-[10px] px-2 py-2 min-w-0 md:min-w-[360px]">
            <span className="flex-1 text-sm text-ima-text truncate font-mono">{shortUrl}</span>
            <button
              type="button"
              className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white motion-safe:transition-colors"
              aria-label={copied ? "Copied to clipboard" : "Copy referral link"}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-ima-success" aria-hidden="true" />
                  <span className="ml-1 text-xs text-ima-success font-semibold">Copied!</span>
                </>
              ) : (
                <Copy className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
              )}
            </button>
            {shareSupported && (
              <button
                type="button"
                className="shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg hover:bg-white motion-safe:transition-colors"
                aria-label="Share referral link"
                onClick={handleShare}
              >
                <Share2 className="h-4 w-4 text-ima-text-secondary" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
