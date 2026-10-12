"use client";

// Asking for a gathering's Keepsake Mushroom when a guest comes near its Event
// Mushroom. The game loop calls the returned function every frame; it does
// work only on a new tile, and asks the server at most once per gathering per
// visit to this world, or again a little later after a refusal (full pockets),
// so walking around a mushroom never floods the route or the toasts.

import { useCallback, useEffect, useRef } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { keepsakesInReach } from "./keepsake";
import type { PlantedMushroom } from "./event-mushroom";

/** How long after a refused ask (full pockets, a lost race) to try again. */
const RETRY_MS = 30_000;

/** `notePosition(col, row)` for the game loop. `onMessage` shows a toast. */
export function useKeepsakeClaims(
  planted: readonly PlantedMushroom[],
  enabled: boolean,
  onMessage: (message: string) => void,
): (col: number, row: number) => void {
  const plantedRef = useRef(planted);
  useEffect(() => {
    plantedRef.current = planted;
  }, [planted]);
  // Per gathering: when it may be asked about again (Infinity once settled).
  const waitUntil = useRef(new Map<string, number>());
  const lastTile = useRef("");

  const ask = useCallback(
    async (gatheringId: string) => {
      waitUntil.current.set(gatheringId, Infinity);
      try {
        const data = await apiFetch<{ message: string; item?: unknown }>(
          `/api/gatherings/${gatheringId}/keepsake`,
          { method: "POST" },
        );
        // A keepsake already taken home needs no toast.
        if (data.item) onMessage(data.message);
      } catch (err) {
        waitUntil.current.set(gatheringId, Date.now() + RETRY_MS);
        onMessage(userMessage(err, "Couldn't pick up a keepsake here."));
      }
    },
    [onMessage],
  );

  return useCallback(
    (col: number, row: number) => {
      if (!enabled) return;
      const [c, r] = [Math.round(col), Math.round(row)];
      const tile = `${c},${r}`;
      if (tile === lastTile.current) return;
      lastTile.current = tile;
      const due = keepsakesInReach(plantedRef.current, c, r, waitUntil.current, Date.now());
      for (const gatheringId of due) void ask(gatheringId);
    },
    [enabled, ask],
  );
}
