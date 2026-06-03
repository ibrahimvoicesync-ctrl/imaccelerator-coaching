"use client";

/**
 * Phase 48: /coach/analytics route error boundary.
 *
 * Catches throws from the cached RPC fetch and from any client component in
 * the analytics tree. Logs the error in useEffect (rule #5 — never swallow)
 * and surfaces a recoverable UI with a Try Again button that re-renders.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui";
import { Card, CardContent } from "@/components/ui";

export default function CoachAnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[coach-analytics] Render error:", error);
  }, [error]);

  return (
    <div
      className="px-4 py-6 max-w-7xl mx-auto flex items-center justify-center"
      role="alert"
    >
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 flex flex-col items-center text-center">
          <AlertTriangle
            className="h-12 w-12 text-ima-error mb-4"
            aria-hidden="true"
          />
          <h1 className="text-xl font-semibold tracking-tight text-ima-text mb-2">
            Couldn&apos;t load analytics
          </h1>
          <p className="text-sm text-ima-text-secondary mb-6">
            Try refreshing the page. If the issue persists, contact support.
          </p>
          <div className="flex gap-3">
            <Button variant="primary" onClick={reset}>
              Try again
            </Button>
            <Link
              href="/coach"
              className={buttonVariants({ variant: "secondary" })}
            >
              Go Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
