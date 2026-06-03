import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { verifyOrigin } from "@/lib/csrf";

export async function POST(request: Request) {
  // CSRF protection -- Origin header must match app host
  const csrfError = verifyOrigin(request);
  if (csrfError) return csrfError;

  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("[signout] Failed to sign out:", error);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const forwardedHost = request.headers.get("x-forwarded-host");
  const origin = appUrl
    ? new URL(appUrl).origin
    : forwardedHost
      ? `${request.headers.get("x-forwarded-proto") ?? "https"}://${forwardedHost}`
      : new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/login`, { status: 302 });
}
