"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { pollDelay } from "@/lib/call-display";
import type { CallsCurrentResponse } from "@/lib/types";

/** Failed polls in a row before a connected member is told the site can't be
 * reached: one blip passes quietly, two mean the call may drop. */
const FAILURES_BEFORE_WARNING = 2;

/**
 * Poll GET /api/calls/current while `enabled` (a signed-in member). While
 * `connected` to a call's audio, the poll carries ?heartbeat=1 and keeps
 * running in a hidden tab, because the server counts a silent member as gone.
 * Otherwise a hidden tab slows down. `refresh` asks again at once, after an
 * action that changed the answer.
 */
export function useCallsPoll(
  enabled: boolean,
  connected: boolean,
): {
  data: CallsCurrentResponse | null;
  /** When the request behind `data` was sent (Date.now()), so a caller can
   * tell an answer from before something it just did from one after it. */
  askedAt: number;
  unreachable: boolean;
  refresh: () => void;
} {
  const [result, setResult] = useState<{ body: CallsCurrentResponse; askedAt: number } | null>(
    null,
  );
  const [failures, setFailures] = useState(0);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let failed = 0;

    async function tick() {
      if (inFlight) return;
      inFlight = true;
      clearTimeout(timer);
      const askedAt = Date.now();
      try {
        const body = await apiFetch<CallsCurrentResponse>(
          `/api/calls/current${connected ? "?heartbeat=1" : ""}`,
          { redirectOnUnauthorized: false },
        );
        failed = 0;
        if (!cancelled) setResult({ body, askedAt });
      } catch {
        // Counted, and shown to a connected member once it repeats (see
        // `unreachable`); the next poll waits longer.
        failed++;
      } finally {
        inFlight = false;
        if (!cancelled) {
          setFailures(failed);
          timer = setTimeout(
            () => void tick(),
            pollDelay({ connected, hidden: document.hidden, failures: failed }),
          );
        }
      }
    }

    // Coming back to a tab asks at once, so an invitation that arrived while
    // it was hidden shows without waiting out the slow hidden-tab interval.
    function onVisible() {
      if (!document.hidden) void tick();
    }

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, connected, version]);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return {
    data: enabled ? (result?.body ?? null) : null,
    askedAt: result?.askedAt ?? 0,
    unreachable: enabled && connected && failures >= FAILURES_BEFORE_WARNING,
    refresh,
  };
}
