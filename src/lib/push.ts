import "server-only";
import webpush from "web-push";

/** True when the VAPID key pair is configured (push can actually be sent). */
export function isPushConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:support@imaccelerator.com";
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type StoredSubscription = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type SendResult = {
  ok: boolean;
  /** Subscription is gone (404/410) and should be pruned by the caller. */
  expired: boolean;
};

/**
 * Sends a single Web Push message. Never throws — returns a result the caller
 * can act on (e.g. prune the subscription when it has expired).
 */
export async function sendPush(
  sub: StoredSubscription,
  payload: PushPayload
): Promise<SendResult> {
  ensureConfigured();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return { ok: true, expired: false };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    const expired = statusCode === 404 || statusCode === 410;
    if (!expired) {
      console.error("[push] sendNotification failed:", err);
    }
    return { ok: false, expired };
  }
}
