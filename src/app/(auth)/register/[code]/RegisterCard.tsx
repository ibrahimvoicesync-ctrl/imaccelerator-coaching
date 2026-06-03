"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const ERROR_MESSAGES: Record<string, string> = {
  expired_invite: "This invite has expired. Ask your coach for a new one.",
  email_mismatch:
    "This invite is for a different email address. Sign in with the email your coach invited.",
  already_used: "This invite has already been used.",
  invalid_invite: "This invite link is not valid.",
  auth_failed: "Something went wrong. Try again.",
  already_registered: "You already have an account. Sign in instead.",
};

interface RegisterCardProps {
  invite: {
    code: string;
    role: string;
    email: string;
  };
  error?: string;
}

export function RegisterCard({ invite, error }: RegisterCardProps) {
  const [loading, setLoading] = useState(false);
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "Something went wrong. Try again.")
    : null;

  const capitalizedRole =
    invite.role.charAt(0).toUpperCase() + invite.role.slice(1);

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?invite_code=${invite.code}`,
      },
    });
    if (oauthError) {
      console.error("[register/invite] OAuth error:", oauthError);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ima-bg px-4">
      <div className="w-full max-w-md rounded-xl bg-ima-surface p-8 shadow-sm border border-ima-border text-center">
        <h1 className="text-2xl font-bold text-ima-text">
          You&apos;ve been invited as a{" "}
          <span className="inline-flex items-center rounded-full bg-ima-primary/10 px-3 py-1 text-sm font-medium text-ima-primary">
            {capitalizedRole}
          </span>
        </h1>
        <p className="mt-3 text-ima-text-secondary text-sm">
          for {invite.email}
        </p>
        <p className="mt-6 text-ima-text-secondary">
          Sign in with Google to complete your registration
        </p>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          aria-label="Sign in with Google"
          className="mt-6 flex items-center justify-center gap-3 rounded-lg border border-ima-border bg-ima-surface px-4 min-h-[44px] w-full text-sm font-medium text-ima-text hover:bg-ima-bg motion-safe:transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-5 w-5 shrink-0"
          >
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>

        {errorMessage && (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-ima-error/10 border border-ima-error/30 p-3 text-sm text-ima-error"
          >
            {errorMessage}
          </div>
        )}
      </div>
    </main>
  );
}
