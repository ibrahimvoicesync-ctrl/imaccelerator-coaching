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

/**
 * Hosts we will dereference a push endpoint against. The endpoint arrives from
 * the client (POST /api/push/subscribe) and is later fetched server-side by
 * web-push, so without a host check it is an SSRF primitive: a student could
 * store `https://10.0.0.5:8443/admin` and have the app server POST to it on
 * every reminder tick. Entries match the host exactly or as a dot-suffix.
 */
const PUSH_HOST_ALLOWLIST = [
  "fcm.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
] as const;

/**
 * True when `endpoint` is an https URL on a known push service. Anything else —
 * another scheme, an IP literal, an internal host, a port on localhost — is
 * rejected. Validate at subscribe time AND before sending, so rows stored
 * before this check existed cannot be dereferenced either.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOST_ALLOWLIST.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
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

  // Defense in depth: rows predating the subscribe-time allowlist, or written
  // by any other path, must not be dereferenced. Treat a disallowed host as
  // expired so the caller prunes it.
  if (!isAllowedPushEndpoint(sub.endpoint)) {
    console.error("[push] refusing endpoint on non-allowlisted host");
    return { ok: false, expired: true };
  }

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
