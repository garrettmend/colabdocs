"use client";

import { useSyncExternalStore } from "react";
import { formatRelative } from "@/lib/client";

// A shared 30-second clock. The server snapshot is null so relative times are
// only rendered in the browser, using the viewer's clock (no hydration mismatch).
const TICK_MS = 30_000;
const subscribe = (onChange: () => void) => {
  const t = setInterval(onChange, TICK_MS);
  return () => clearInterval(t);
};
const getNow = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;
const getServerNow = () => null;

export function RelativeTime({ iso, prefix = "" }: { iso: string; prefix?: string }) {
  const now = useSyncExternalStore(subscribe, getNow, getServerNow);
  return (
    <time dateTime={iso} title={new Date(iso).toUTCString()}>
      {now === null ? "" : `${prefix}${formatRelative(iso, now)}`}
    </time>
  );
}
