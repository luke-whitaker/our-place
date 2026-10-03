"use client";

// Runtime world state the server owns, fetched on arrival and after every
// change: the seeds and flowers growing in this world, and the flower on the
// signed-in member's head. The engine never fetches; WorldCanvas adds plants
// to the world (withPlants) and hands the hat to render each frame.

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { placedFromWire, isFlowerColor, type FlowerColor, type PlacedPlant } from "./plants";
import type { PlantsInWorld, WornHat } from "@/lib/types";

/** Nothing growing; shared so an empty list keeps one identity. */
const NOTHING: readonly PlacedPlant[] = [];

async function fetchPlants(worldId: string): Promise<readonly PlacedPlant[]> {
  const data = await apiFetch<PlantsInWorld>(
    `/api/world/plants?world=${encodeURIComponent(worldId)}`,
  );
  return data.plants.length > 0 ? data.plants.map(placedFromWire) : NOTHING;
}

/** The seeds and flowers growing in `worldId`, and a way to reload them after
 * planting or picking. A failed load reports through `onError` and leaves the
 * last known list, so the world never goes blank over one bad request. */
export function useWorldPlants(
  worldId: string,
  enabled: boolean,
  onError: (message: string) => void,
): { plants: readonly PlacedPlant[]; refresh: () => void } {
  const [plants, setPlants] = useState<readonly PlacedPlant[]>(NOTHING);

  const refresh = useCallback(() => {
    if (!enabled) return;
    fetchPlants(worldId)
      .then(setPlants)
      .catch(() => onError("Couldn't see what's growing here."));
  }, [worldId, enabled, onError]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchPlants(worldId)
      .then((list) => {
        if (!cancelled) setPlants(list);
      })
      .catch(() => {
        if (!cancelled) onError("Couldn't see what's growing here.");
      });
    return () => {
      cancelled = true;
    };
  }, [worldId, enabled, onError]);

  return { plants: enabled ? plants : NOTHING, refresh };
}

/** The color of the flower on the signed-in member's head, and a way to
 * reload it after wearing or taking one off. */
export function useWornHat(
  enabled: boolean,
  onError: (message: string) => void,
): { hat: FlowerColor | null; refresh: () => void } {
  const [hat, setHat] = useState<FlowerColor | null>(null);

  const load = useCallback(
    () =>
      apiFetch<WornHat>("/api/hat").then((data) =>
        isFlowerColor(data.hat?.color) ? data.hat.color : null,
      ),
    [],
  );

  const refresh = useCallback(() => {
    if (!enabled) return;
    load()
      .then(setHat)
      .catch(() => onError("Couldn't check your hat."));
  }, [enabled, load, onError]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load()
      .then((color) => {
        if (!cancelled) setHat(color);
      })
      .catch(() => {
        if (!cancelled) onError("Couldn't check your hat.");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, load, onError]);

  return { hat: enabled ? hat : null, refresh };
}
