"use client";

import { useState } from "react";
import { Skeleton } from "@/components/ui";
import { AI_CONFIG } from "@/lib/config";

export function AskIframe() {
  const [iframeLoaded, setIframeLoaded] = useState(false);

  if (!AI_CONFIG.iframeUrl) {
    return (
      <div className="w-full h-[calc(100vh-14rem)] flex items-center justify-center bg-ima-surface-light rounded-xl">
        <p className="text-ima-text-secondary">AI assistant is not configured yet.</p>
      </div>
    );
  }

  return (
    <div className="w-full relative h-[calc(100vh-14rem)]">
      {!iframeLoaded && (
        <div
          className="absolute inset-0 bg-ima-surface-light p-6 space-y-4"
          role="status"
          aria-label="Loading AI assistant"
        >
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-8 flex-1 rounded-lg" />
          </div>
          <div className="flex items-start gap-3 justify-end">
            <Skeleton className="h-8 w-2/3 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          </div>
          <div className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-16 flex-1 rounded-lg" />
          </div>
          <span className="sr-only">Loading AI assistant</span>
        </div>
      )}
      <iframe
        src={AI_CONFIG.iframeUrl}
        className="w-full h-full"
        title={AI_CONFIG.title}
        allow="microphone"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        onLoad={() => setIframeLoaded(true)}
      />
    </div>
  );
}
