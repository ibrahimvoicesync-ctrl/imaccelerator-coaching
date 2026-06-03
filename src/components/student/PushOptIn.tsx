"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;


/** Convert a base64url VAPID key into the Uint8Array the Push API expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Daily-reminder opt-in. Renders nothing when push isn't configured or the
 * browser can't support it, so it degrades cleanly. Otherwise shows a single
 * calm toggle to turn browser reminders on/off.
 */
export function PushOptIn() {
  const toastRef = useRef(useToast());
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (
      !VAPID_PUBLIC_KEY ||
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setReady(true);
      return;
    }
    setSupported(true);
    setPermission(Notification.permission);

    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(Boolean(sub)))
      .catch((err) => console.error("[PushOptIn] check subscription failed:", err))
      .finally(() => setReady(true));
  }, []);

  const enable = useCallback(async () => {
    if (!VAPID_PUBLIC_KEY) return;
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        toastRef.current.toast({
          type: "error",
          title: "Reminders are blocked in your browser settings.",
        });
        return;
      }

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: null }));
        console.error("[PushOptIn] subscribe save failed:", err);
        // Roll back the browser subscription so state stays consistent.
        await sub.unsubscribe().catch(() => {});
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't enable reminders" });
        return;
      }
      setSubscribed(true);
      toastRef.current.toast({ type: "success", title: "Daily reminders on" });
    } catch (err) {
      console.error("[PushOptIn] enable error:", err);
      toastRef.current.toast({ type: "error", title: "Couldn't enable reminders" });
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch((err) => console.error("[PushOptIn] unsubscribe save failed:", err));
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
      toastRef.current.toast({ type: "success", title: "Daily reminders off" });
    } catch (err) {
      console.error("[PushOptIn] disable error:", err);
      toastRef.current.toast({ type: "error", title: "Couldn't turn off reminders" });
    } finally {
      setBusy(false);
    }
  }, []);

  // Nothing to show until detection finishes, or if push is unsupported.
  if (!ready || !supported) return null;

  const blocked = permission === "denied";

  return (
    <div className="flex items-center gap-4 bg-white border border-ima-border rounded-[14px] px-6 py-5 min-h-[84px]">
      <div className="w-9 h-9 rounded-[8px] bg-ima-surface-accent flex items-center justify-center shrink-0">
        <Bell className="h-[18px] w-[18px] text-ima-primary" aria-hidden="true" />
      </div>
      <div className="flex-1 min-w-0">
        <p
          className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-primary leading-none"
        >
          Daily reminder
        </p>
        <p className="mt-[6px] text-[15px] font-semibold text-ima-text leading-tight">
          {subscribed ? "Reminders are on" : "Get a nudge if you haven't logged a session"}
        </p>
        <p className="mt-[4px] text-[12px] text-ima-text-secondary leading-snug">
          {blocked
            ? "Blocked in your browser settings — re-enable notifications there to turn this on."
            : "A calm once-a-day notification. No spam."}
        </p>
      </div>
      <button
        onClick={subscribed ? disable : enable}
        disabled={busy || blocked}
        className={`shrink-0 min-h-[44px] px-5 rounded-[12px] text-[13px] font-semibold motion-safe:transition-colors disabled:opacity-50 ${
          subscribed
            ? "bg-white border border-ima-border text-ima-text hover:border-ima-border hover:bg-ima-bg"
            : "bg-ima-primary text-white hover:bg-ima-primary-hover"
        }`}
      >
        {busy ? "…" : subscribed ? "Turn off" : "Enable"}
      </button>
    </div>
  );
}
