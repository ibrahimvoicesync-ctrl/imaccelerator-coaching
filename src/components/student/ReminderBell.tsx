"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
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

/** "0" -> "12:00 AM", "13" -> "1:00 PM". */
function formatHourLabel(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/**
 * Daily-reminder control collapsed into a single quiet bell icon. Tap it to open
 * a small popover with the on/off toggle and a time picker. Renders nothing when
 * push isn't configured or the browser can't support it, so it degrades cleanly.
 */
export function ReminderBell({ initialHour = 17 }: { initialHour?: number }) {
  const toastRef = useRef(useToast());
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [hour, setHour] = useState(initialHour);
  const [savingHour, setSavingHour] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      .catch((err) => console.error("[ReminderBell] check subscription failed:", err))
      .finally(() => setReady(true));
  }, []);

  // Close popover on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        console.error("[ReminderBell] subscribe save failed:", err);
        await sub
          .unsubscribe()
          .catch((e) => console.error("[ReminderBell] rollback unsubscribe failed:", e));
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't enable reminders" });
        return;
      }
      setSubscribed(true);
      toastRef.current.toast({ type: "success", title: "Daily reminders on" });
    } catch (err) {
      console.error("[ReminderBell] enable error:", err);
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
        const response = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch((err) => {
          console.error("[ReminderBell] unsubscribe save failed:", err);
          return null;
        });
        if (response && !response.ok) {
          console.error("[ReminderBell] unsubscribe save failed:", response.status);
        }
        await sub
          .unsubscribe()
          .catch((err) => console.error("[ReminderBell] browser unsubscribe failed:", err));
      }
      setSubscribed(false);
      toastRef.current.toast({ type: "success", title: "Daily reminders off" });
    } catch (err) {
      console.error("[ReminderBell] disable error:", err);
      toastRef.current.toast({ type: "error", title: "Couldn't turn off reminders" });
    } finally {
      setBusy(false);
    }
  }, []);

  const saveHour = useCallback(async (nextHour: number) => {
    const previous = hour;
    setHour(nextHour);
    setSavingHour(true);
    try {
      const response = await fetch("/api/push/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reminder_hour: nextHour,
          reminder_offset_min: new Date().getTimezoneOffset(),
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: null }));
        setHour(previous);
        toastRef.current.toast({ type: "error", title: err.error || "Couldn't save reminder time" });
        return;
      }
      toastRef.current.toast({ type: "success", title: `Reminder set for ${formatHourLabel(nextHour)}` });
    } catch (err) {
      console.error("[ReminderBell] save hour error:", err);
      setHour(previous);
      toastRef.current.toast({ type: "error", title: "Couldn't save reminder time" });
    } finally {
      setSavingHour(false);
    }
  }, [hour]);

  // Nothing to show until detection finishes, or if push is unsupported.
  if (!ready || !supported) return null;

  const blocked = permission === "denied";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={subscribed ? "Daily reminder settings (on)" : "Daily reminder settings"}
        aria-expanded={open}
        className={`relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[12px] border motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-2 ${
          subscribed
            ? "border-ima-primary/20 bg-ima-surface-accent text-ima-primary"
            : "border-ima-border bg-white text-ima-text-secondary hover:text-ima-primary hover:border-ima-primary/30"
        }`}
      >
        {subscribed ? (
          <BellRing className="h-[18px] w-[18px]" aria-hidden="true" />
        ) : (
          <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
        {subscribed && (
          <span
            className="absolute top-2 right-2 h-2 w-2 rounded-full bg-ima-primary"
            aria-hidden="true"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Daily reminder settings"
          className="absolute right-0 z-50 mt-2 w-[300px] rounded-[14px] border border-ima-border bg-white shadow-card-hover p-5 motion-safe:animate-fadeIn"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-ima-primary leading-none">
                Daily reminder
              </p>
              <p className="mt-[6px] text-[14px] font-semibold text-ima-text leading-tight">
                {subscribed ? "Reminders are on" : "Get a daily nudge"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close reminder settings"
              className="flex min-h-[44px] min-w-[44px] -mt-2 -mr-2 items-center justify-center rounded-lg text-ima-text-secondary hover:bg-ima-surface-light motion-safe:transition-colors focus-visible:outline-2 focus-visible:outline-ima-primary focus-visible:outline-offset-1"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-1 text-[12px] text-ima-text-secondary leading-snug">
            {blocked
              ? "Blocked in your browser settings — re-enable notifications there to turn this on."
              : "A calm once-a-day notification if you haven't logged a session. No spam."}
          </p>

          <button
            type="button"
            onClick={subscribed ? disable : enable}
            disabled={busy || blocked}
            className={`mt-4 w-full min-h-[44px] px-5 rounded-[12px] text-[13px] font-semibold motion-safe:transition-colors disabled:opacity-50 ${
              subscribed
                ? "bg-white border border-ima-border text-ima-text hover:bg-ima-bg"
                : "bg-ima-primary text-white hover:bg-ima-primary-hover"
            }`}
          >
            {busy ? "…" : subscribed ? "Turn off reminders" : "Enable reminders"}
          </button>

          {subscribed && !blocked && (
            <div className="mt-4 pt-4 border-t border-ima-border flex items-center justify-between gap-3">
              <label
                htmlFor="reminder-hour"
                className="text-[13px] font-medium text-ima-text-secondary"
              >
                Remind me at
              </label>
              <select
                id="reminder-hour"
                value={hour}
                disabled={savingHour}
                onChange={(e) => saveHour(Number(e.target.value))}
                className="h-11 min-h-[44px] rounded-[10px] border border-ima-border bg-ima-surface px-3 text-sm font-medium text-ima-text tabular-nums focus:outline-none focus:ring-2 focus:ring-ima-primary focus:border-transparent disabled:opacity-50 motion-safe:transition-colors"
              >
                {HOURS.map((h) => (
                  <option key={h} value={h}>
                    {formatHourLabel(h)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
