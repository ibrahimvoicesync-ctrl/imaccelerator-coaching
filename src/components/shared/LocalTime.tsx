"use client";

import { useSyncExternalStore } from "react";

/**
 * Renders an ISO timestamp in the VIEWER's local timezone.
 *
 * Server components format dates in the server's timezone (UTC/UK on our host),
 * so a plain server-rendered `toLocaleTimeString` shows the same wall-clock time
 * to everyone regardless of where they are. This component fixes that: it SSRs a
 * deterministic UTC value (identical on server and during hydration → no
 * mismatch) and then re-renders in the browser's local timezone once mounted.
 *
 * `useSyncExternalStore` returns the server snapshot (`false`) during SSR and
 * the first client paint, then the client snapshot (`true`) after commit — the
 * canonical React 19 pattern for a value that must differ after hydration.
 */

const TIME_OPTS: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

const subscribe = () => () => {};

export function LocalTime({ iso, className }: { iso: string; className?: string }) {
  const isClient = useSyncExternalStore(
    subscribe,
    () => true, // client snapshot
    () => false, // server snapshot
  );

  const text = new Date(iso).toLocaleTimeString(
    "en-US",
    isClient ? TIME_OPTS : { ...TIME_OPTS, timeZone: "UTC" },
  );

  return (
    <time dateTime={iso} className={className}>
      {text}
    </time>
  );
}
