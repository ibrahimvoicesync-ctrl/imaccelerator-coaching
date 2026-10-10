"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

const AI_ORIGIN = "https://ai.imaccelerator.com";

export function ImaAi() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== AI_ORIGIN) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== "mentorfy:ready") return;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) console.error("[ImaAi] getSession failed:", error);
        (event.source as Window).postMessage(
          { type: "mentorfy:token", token: data.session?.access_token ?? null },
          AI_ORIGIN
        );
      } catch (err) {
        console.error("[ImaAi] Failed to hand off session token:", err);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={AI_ORIGIN}
      allow="microphone"
      title="IMA AI"
      className="block h-full w-full border-0"
    />
  );
}
