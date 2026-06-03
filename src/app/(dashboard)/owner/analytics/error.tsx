"use client";

/**
 * Phase 54: Error boundary for /owner/analytics. Catches RPC failures and
 * rendering errors, logs via console.error per CLAUDE.md Hard Rule #5, and
 * presents a reset action (re-runs the server component).
 */

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui";

export default function OwnerAnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[owner-analytics] page error:", error);
  }, [error]);

  return (
    <section
      role="alert"
      className="px-4 py-6 max-w-7xl mx-auto"
    >
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="h-5 w-5 text-ima-primary shrink-0 mt-0.5"
              aria-hidden="true"
            />
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-ima-text">
                Couldn&apos;t load owner analytics
              </h1>
              <p className="mt-1 text-sm text-ima-text-secondary">
                {error.message || "An unexpected error occurred."}
              </p>
              <div className="mt-4">
                <Button
                  type="button"
                  variant="primary"
                  className="min-h-[44px]"
                  onClick={() => reset()}
                >
                  Try again
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
