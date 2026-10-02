"use client";

import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { drawMinimap, type MapCanvas } from "@/lib/game/map-canvas";
import type { DiscoverySync } from "@/lib/game/map-discoveries";

/** CSS pixels per map pixel: each tile is 4x2 CSS px, so the minimap shows
 * about 30 tiles across, roughly a screen and a half around you. */
const MINIMAP_ZOOM = 2;

/** What the game loop calls once per frame; it redraws only on news. */
export type MinimapDraw = (
  player: { col: number; row: number },
  discovered: ReadonlySet<string>,
) => void;

interface WorldMinimapProps {
  map: MapCanvas;
  sync: DiscoverySync;
  /** Filled with this minimap's draw function, for the game loop to call. */
  drawRef: RefObject<MinimapDraw | null>;
  onOpen: () => void;
  /** Whether the open-map shortcut is a key (desktop) or a tap (touch). */
  isTouchDevice: boolean;
}

/**
 * <WorldMinimap /> — a small map in the world's top-left corner, centred on
 * you, with unexplored ground fogged. Tap or click it (or press M) to open the
 * full map. The game loop calls the draw function this registers every frame,
 * and it repaints only when you've moved a tile, a chunk has cleared, a shrine
 * was found, or the canvas changed size.
 */
export default function WorldMinimap({
  map,
  sync,
  drawRef,
  onOpen,
  isTouchDevice,
}: WorldMinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let lastKey = "";
    const draw: MinimapDraw = (player, discovered) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      const key = `${player.col.toFixed(2)},${player.row.toFixed(2)},${sync.version},${discovered.size},${w}x${h}`;
      if (key === lastKey) return;
      lastKey = key;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      map.refresh(sync.visited, sync.version);
      drawMinimap(ctx, map, player, discovered, MINIMAP_ZOOM * dpr);
    };
    drawRef.current = draw;
    return () => {
      if (drawRef.current === draw) drawRef.current = null;
    };
  }, [map, sync, drawRef]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.currentTarget.blur();
        onOpen();
      }}
      aria-label="Open the map"
      title={isTouchDevice ? "Open the map" : "Open the map (M)"}
      className="absolute left-2 top-2 z-[5] block touch-manipulation select-none overflow-hidden rounded-md border-2 border-white/40 bg-black/40 p-0 shadow-md"
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="block h-[68px] w-[104px] sm:h-[88px] sm:w-[136px]"
        style={{ imageRendering: "pixelated" }}
      />
    </button>
  );
}
