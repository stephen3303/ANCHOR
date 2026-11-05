"use client";

import { useCallback, useEffect, useState } from "react";
import type { Transmission } from "./transmissions";

type Result = { ok: true } | { ok: false; reason: string };

/** The command's transmission queue and log, refreshed while the page is open. */
export function useTransmissions() {
  const [transmissions, setTransmissions] = useState<Transmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/transmissions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the transmission queue.");
      setTransmissions(data.transmissions); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load the transmission queue."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // The first load and the periodic refresh both run from timers, so state is never set during the effect itself.
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [refresh]);
  const act = useCallback(async (id: string, action: "transmit" | "revoke", comment = ""): Promise<Result> => {
    setBusy(true);
    try {
      const response = await fetch(`/api/transmissions/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, comment }) });
      const data = await response.json();
      if (!response.ok) return { ok: false, reason: data.error || "Action failed." };
      await refresh();
      return { ok: true };
    } catch (reason) { return { ok: false, reason: reason instanceof Error ? reason.message : "Action failed." }; }
    finally { setBusy(false); }
  }, [refresh]);
  return { transmissions, loading, busy, error, refresh, act };
}
