"use client";

// The map for a world that has one: its picture (MapCanvas) and the member's
// discoveries (DiscoverySync), loaded from the account on arrival and saved
// back as they explore. Null in worlds without a map and for anyone signed out.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { MapCanvas } from "./map-canvas";
import { DiscoverySync, type SaveBody } from "./map-discoveries";
import { mappedWorld } from "./mapped-worlds";
import type { IsoWorld } from "./world-model";
import type { WorldDiscoveries } from "@/lib/types";

export interface WorldMap {
  canvas: MapCanvas;
  sync: DiscoverySync;
  /** "ready" once the account's discoveries are in; "error" if they couldn't
   * load, in which case the map still works and saves from this visit on. */
  status: "ready" | "error";
}

function saveDiscoveries(body: SaveBody, keepalive: boolean): Promise<WorldDiscoveries> {
  return apiFetch<WorldDiscoveries>("/api/world/discoveries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive,
  });
}

export function useWorldMap(
  world: IsoWorld,
  enabled: boolean,
  onError: (message: string) => void,
): WorldMap | null {
  const [map, setMap] = useState<WorldMap | null>(null);

  useEffect(() => {
    const mapped = enabled ? mappedWorld(world.id) : null;
    if (!mapped) return;
    let cancelled = false;
    const sync = new DiscoverySync({
      worldId: world.id,
      grid: mapped.grid,
      send: saveDiscoveries,
      onSaveError: () => onError("Couldn't save your map. It'll try again."),
    });
    const canvas = new MapCanvas(world, mapped.grid);
    // The minimap appears once the account's discoveries answer (a moment
    // after arrival), so it never flashes an all-fogged map first.
    apiFetch<WorldDiscoveries>(`/api/world/discoveries?world=${encodeURIComponent(world.id)}`)
      .then((server) => {
        if (cancelled) return;
        sync.merge(server);
        setMap({ canvas, sync, status: "ready" });
      })
      .catch(() => {
        if (cancelled) return;
        onError("Couldn't load your map.");
        setMap({ canvas, sync, status: "error" });
      });

    // Leaving the page (closing the tab, switching apps on a phone) saves
    // what's new; keepalive lets the request outlive the page.
    function flushOnHide() {
      if (document.visibilityState === "hidden") void sync.flush(true);
    }
    function flushOnPageHide() {
      void sync.flush(true);
    }
    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnPageHide);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushOnPageHide);
      sync.dispose();
      setMap(null);
    };
    // onError is the page's toast; a new function identity must not rebuild
    // the map or drop unsaved chunks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world, enabled]);

  return map;
}
