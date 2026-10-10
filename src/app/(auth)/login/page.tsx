"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { KeyRound, Mail, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Something went wrong. Try again.",
  already_registered: "You already have an account. Sign in instead.",
};

function GoogleMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-[18px] w-[18px]"
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
  );
}

/**
 * Right-hand showcase (lg+): an illustrative glimpse of the student dashboard
 * on the warm sidebar beige. Purely decorative, so aria-hidden as a whole.
 */
function Showcase({ reduced }: { reduced: boolean }) {
  const float = (delay: number, distance = 6) =>
    reduced
      ? {}
      : {
          animate: { y: [0, -distance, 0] },
          transition: {
            duration: 6,
            ease: "easeInOut" as const,
            repeat: Infinity,
            delay,
          },
        };
  const card =
    "rounded-[14px] border border-ima-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_40px_-18px_rgba(15,23,42,0.22)]";

  return (
    <div
      aria-hidden="true"
      className="hidden w-full select-none text-left sm:block"
    >
      <div className="relative mx-auto h-[256px] w-full max-w-[440px]">
        <div
          style={{ animationDelay: "250ms" }}
          className="motion-safe:animate-riseIn absolute left-0 top-0 w-[78%]"
        >
          <motion.div {...float(0)} className={cn(card, "p-6")}>
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary">
                Today&apos;s Work
              </p>
              <Timer className="h-4 w-4 text-ima-text-secondary" />
            </div>
            <p className="mt-4 text-[44px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ima-primary">
              3h 20m
              <span className="ml-2 text-[15px] font-medium tracking-normal text-ima-text-secondary">
                / 4h
              </span>
            </p>
            <div className="mt-5 h-[6px] overflow-hidden rounded-full bg-ima-surface-light">
              <motion.div
                className="h-full rounded-full bg-ima-primary"
                initial={reduced ? false : { width: "0%" }}
                animate={{ width: "83%" }}
                transition={{ duration: 1.4, ease: EASE_OUT, delay: 0.6 }}
              />
            </div>
          </motion.div>
        </div>

        <div
          style={{ animationDelay: "400ms" }}
          className="motion-safe:animate-riseIn absolute right-0 top-[116px] w-[58%]"
        >
          <motion.div {...float(1.2, 5)} className={cn(card, "p-5")}>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-ima-text-secondary" />
              <p className="text-[12px] font-medium text-ima-text-secondary">
                Emails sent today
              </p>
            </div>
            <p className="mt-3 text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ima-text">
              50
              <span className="text-[14px] font-medium text-ima-text-secondary">
                {" "}
                / 50
              </span>
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ima-success/10 px-2 py-[3px] text-[10px] font-semibold uppercase tracking-[0.08em] text-ima-success">
              Goal reached
            </span>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/**
 * Login — one calm, centred column with a single action. Entrances are CSS
 * (staggered `animate-riseIn`) so nothing waits on JS to appear, and the
 * button answers on press (scale 0.97), not on release.
 */
function LoginContent() {
  const [loading, setLoading] = useState(false);
  const reduced = useReducedMotion() ?? false;
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const errorMessage = errorParam
    ? (ERROR_MESSAGES[errorParam] ?? "Something went wrong. Try again.")
    : null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
    if (error) {
      console.error("[login] OAuth error:", error);
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center bg-ima-sidebar px-6 md:px-10">
      <header className="flex w-full items-center justify-between gap-6 pt-6 md:pt-8">
        <span
          role="img"
          aria-label="IMA Accelerator"
          className="block bg-ima-primary"
          style={{
            width: 150,
            height: 31,
            WebkitMaskImage: "url(/ima-logo.png)",
            maskImage: "url(/ima-logo.png)",
            WebkitMaskSize: "contain",
            maskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskPosition: "left center",
            maskPosition: "left center",
          }}
        />
        {/* Sign-in chip — same white-card language as the floating cards */}
        <div
          className="hidden items-center gap-3 rounded-[14px] bg-white py-2 pl-2 pr-5 shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_24px_-14px_rgba(15,23,42,0.25)] ring-1 ring-ima-sidebar-border motion-safe:animate-fadeIn sm:flex"
          style={{ animationDelay: "180ms" }}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-ima-surface-accent text-ima-primary">
            <KeyRound className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="text-left">
            <h1 className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ima-text">
              Sign in
            </h1>
            <p className="mt-0.5 text-[12px] leading-tight text-ima-text-secondary">
              Use the Google account your invite was sent to.
            </p>
          </div>
        </div>
      </header>

      {/* One stacked column: the card animation (sm+), then sign-in */}
      <div className="flex w-full max-w-[440px] flex-1 flex-col items-center justify-center py-12 text-center">
        <div className="w-full">
          <Showcase reduced={reduced} />
        </div>

        {/* Separator (sm+, where the cards show): the house eyebrow label between
            two beige rules — same type and rule tokens as the sidebar */}
        <div
          className="mt-10 hidden w-full max-w-[360px] items-center gap-[14px] motion-safe:animate-fadeIn sm:flex"
          style={{ animationDelay: "240ms" }}
        >
          <span
            aria-hidden="true"
            className="h-px flex-1 bg-ima-sidebar-border"
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ima-text-secondary">
            Invite only
          </span>
          <span
            aria-hidden="true"
            className="h-px flex-1 bg-ima-sidebar-border"
          />
        </div>

        {/* Phones: heading stays in the column; sm+ moves it to the header */}
        <div className="sm:hidden">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-ima-text">
            Sign in
          </h1>
          <p className="mt-2 text-balance text-[15px] leading-[1.5] text-ima-text-secondary">
            Use the Google account your invite was sent to.
          </p>
        </div>

        <div
          className="mt-8 w-full max-w-[360px] motion-safe:animate-riseIn sm:mt-10"
          style={{ animationDelay: "280ms" }}
        >
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            aria-busy={loading || undefined}
            className="group relative flex w-full min-h-[54px] items-center justify-center rounded-[14px] border border-ima-border bg-white px-14 text-[15px] font-semibold text-ima-text shadow-[0_1px_2px_rgba(15,23,42,0.06),inset_0_-1px_0_rgba(15,23,42,0.04)] hover:border-ima-text-muted/50 hover:bg-ima-surface-light/40 hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_20px_-10px_rgba(15,23,42,0.25)] motion-safe:transition-[background-color,border-color,box-shadow,transform] motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ima-primary focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-80"
          >
            {/* Mark pinned left, label optically centred — the standard Google layout */}
            <span className="absolute left-[18px] top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center">
              {loading ? (
                <span
                  className="h-[18px] w-[18px] rounded-full border-2 border-ima-border border-t-ima-primary motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <GoogleMark />
              )}
            </span>
            {loading ? "Opening Google…" : "Continue with Google"}
          </button>

          {errorMessage && (
            <p
              role="alert"
              className="mt-4 rounded-[12px] bg-ima-error/10 px-4 py-3 text-[13px] leading-relaxed text-ima-error motion-safe:animate-fadeIn"
            >
              {errorMessage}
            </p>
          )}
        </div>

        <p
          className="mt-6 text-[13px] text-ima-text-secondary motion-safe:animate-fadeIn"
          style={{ animationDelay: "360ms" }}
        >
          No invite yet? Ask your coach.
        </p>
      </div>

      <p className="pb-[max(1.5rem,env(safe-area-inset-bottom))] text-[12px] text-ima-text-secondary">
        © {new Date().getFullYear()} IMA Accelerator
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
