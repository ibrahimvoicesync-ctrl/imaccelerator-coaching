"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";

export default function AnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[student_diy-analytics] Error boundary:", error);
  }, [error]);

  return (
    <div className="px-4 md:px-6 py-8 md:py-12 max-w-7xl mx-auto">
      <Card>
        <CardContent className="py-12 text-center">
          <h2 className="text-[20px] md:text-[22px] font-semibold tracking-[-0.01em] leading-tight text-ima-text">
            We couldn&apos;t load your analytics
          </h2>
          <p className="text-sm text-ima-text-secondary mt-2 leading-relaxed">
            Refresh the page or try again in a moment.
          </p>
          <div className="mt-6">
            <Button
              variant="primary"
              onClick={reset}
              className="min-h-[44px] min-w-[44px]"
            >
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
