"use client";

import { useEffect, useRef, useState } from "react";
import { PAL } from "@/lib/game/constants";
import { drawFullMap, SHRINE_COLOR, type MapCanvas } from "@/lib/game/map-canvas";
import type { DiscoverySync } from "@/lib/game/map-discoveries";

interface WorldMapPanelProps {
  map: MapCanvas;
  sync: DiscoverySync;
  /** Where you stood when the map opened (the world is paused meanwhile). */
  player: { col: number; row: number };
  discovered: ReadonlySet<string>;
  onClose: () => void;
}

const TITLE_ID = "world-map-title";

/** Where a shrine's name hangs from its marker: centred, except near the
 * map's sides, where it leans inward so it never runs off a narrow phone. */
function labelShift(fractionAcross: number): string {
  if (fractionAcross > 0.75) return "-100%";
  if (fractionAcross < 0.25) return "0%";
  return "-50%";
}

/**
 * <WorldMapPanel /> — the whole world map, opened from the minimap or with M.
 * Places you haven't been are greyed out; your position and the shrines
 * you've found are marked, and the shrines are named. Never anyone else: the
 * map shows no other members and no counts. Closes on the ×, a tap outside,
 * Esc, or M (WorldOverlays handles the keys).
 */
export default function WorldMapPanel({
  map,
  sync,
  player,
  discovered,
  onClose,
}: WorldMapPanelProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // CSS pixels per map pixel: as large as the space allows.
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    function fit() {
      if (!area) return;
      const s = Math.min(
        area.clientWidth / map.canvas.width,
        area.clientHeight / map.canvas.height,
      );
      setScale(s > 0 ? s : 0);
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || scale <= 0) return;
    // Draw at whole device pixels per map pixel for crisp edges; CSS scales
    // the result to the exact fit with nearest-neighbour.
    const deviceScale = Math.max(1, Math.round(scale * (window.devicePixelRatio || 1)));
    canvas.width = map.canvas.width * deviceScale;
    canvas.height = map.canvas.height * deviceScale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    map.refresh(sync.visited, sync.version);
    drawFullMap(ctx, map, player, discovered, deviceScale);
  }, [map, sync, player, discovered, scale]);

  const spots = map.shrineSpots(discovered);
  const cssW = map.canvas.width * scale;
  const cssH = map.canvas.height * scale;

  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 p-1 sm:p-3"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
        className="flex h-full max-h-full w-full max-w-4xl flex-col rounded-sm border-2 px-1.5 pb-1.5 font-mono"
        style={{ backgroundColor: PAL.textBg, borderColor: PAL.textBorder }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-8 shrink-0 items-center gap-1">
          <span
            id={TITLE_ID}
            className="min-w-0 flex-1 truncate text-center text-sm font-bold sm:text-base"
            style={{ color: PAL.lightest }}
          >
            Map of the Capital
          </span>
          <button
            type="button"
            aria-label="Close the map"
            onClick={onClose}
            className="-my-1.5 flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-sm text-lg font-bold active:opacity-60"
            style={{ color: PAL.white }}
          >
            ×
          </button>
        </div>
        <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center">
          <div className="relative" style={{ width: cssW, height: cssH }}>
            <canvas
              ref={canvasRef}
              aria-label="Your map. Grey areas are still to explore."
              role="img"
              className="block h-full w-full"
              style={{ imageRendering: "pixelated" }}
            />
            {spots.map((spot) => (
              <span
                key={spot.id}
                className="pointer-events-none absolute whitespace-nowrap rounded-sm px-1 text-[10px] leading-4 sm:text-xs"
                style={{
                  left: spot.x * scale,
                  top: spot.y * scale,
                  transform: `translate(${labelShift(spot.x / map.canvas.width)}, -150%)`,
                  color: PAL.white,
                  backgroundColor: "rgba(20, 20, 28, 0.75)",
                }}
              >
                {spot.label}
              </span>
            ))}
          </div>
        </div>
        <p
          className="flex shrink-0 flex-wrap items-center justify-center gap-x-3 pt-1 text-[10px] sm:text-xs"
          style={{ color: PAL.light }}
        >
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 border border-black bg-white" /> You
          </span>
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 border border-black"
              style={{ backgroundColor: SHRINE_COLOR }}
            />
            Shrines you&apos;ve found
          </span>
          <span>Grey is still to explore</span>
        </p>
      </div>
    </div>
  );
}
