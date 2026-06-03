"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui";
import { Card, CardContent } from "@/components/ui";
import Link from "next/link";

export default function OwnerCoachDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-12 flex items-center justify-center" role="alert">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="pt-6 flex flex-col items-center text-center">
          <AlertTriangle className="h-12 w-12 text-ima-error mb-4" aria-hidden="true" />
          <h1 className="text-xl font-bold text-ima-text mb-2">Something went wrong</h1>
          <p className="text-sm text-ima-text-secondary mb-6">
            We couldn&apos;t load this page. Please try again.
          </p>
          <div className="flex gap-3">
            <Button variant="primary" onClick={reset}>Try Again</Button>
            <Link href="/owner" className={buttonVariants({ variant: "secondary" })}>Go Home</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
