import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { verifyOrigin } from "@/lib/csrf";
import { APP_CONFIG } from "@/lib/config";

// Hosts we will honor when deriving the redirect origin from client-supplied
// forwarded headers. x-forwarded-host is attacker-controllable, so anything not
// on this list falls back to the pinned default — otherwise it's an open-redirect.
const ALLOWED_REDIRECT_HOSTS = new Set([
  new URL(APP_CONFIG.url).host,
  "localhost",
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
]);

function getRedirectOrigin(request: Request): string {
  // 1. Pinned origin via env var always wins (prod + configured dev).
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return new URL(process.env.NEXT_PUBLIC_APP_URL).origin;
  }
  // 2. Derive from forwarded headers ONLY when the host is allow-listed.
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost && ALLOWED_REDIRECT_HOSTS.has(forwardedHost)) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  // 3. Fall back to the request's own origin if allow-listed, else the pinned default.
  if (ALLOWED_REDIRECT_HOSTS.has(new URL(request.url).host)) {
    return new URL(request.url).origin;
  }
  return new URL(APP_CONFIG.url).origin;
}

export async function POST(request: Request) {
  // CSRF protection -- Origin header must match app host
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[signout] Failed to sign out:", error);
  }

  const origin = getRedirectOrigin(request);
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
}
