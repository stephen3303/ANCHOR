"use client";

import { useSyncExternalStore } from "react";

// Current time, ticking every 30s. Returns null during server render so the
// server HTML and the first client render match.
let now: Date | null = null;
const subscribe = (cb: () => void) => {
  now = new Date();
  cb();
  const t = setInterval(() => {
    now = new Date();
    cb();
  }, 30_000);
  return () => clearInterval(t);
};

export function useNow(): Date | null {
  return useSyncExternalStore(subscribe, () => now, () => null);
}
