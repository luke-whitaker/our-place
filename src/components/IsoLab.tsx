"use client";

// ── Isometric vertical slice (dev harness) ──
//
// A throwaway page (/iso-lab) for proving engine work before touching the live
// world. It is a thin harness over the real iso engine (iso-engine.ts), exactly
// the shape WorldCanvas takes. It loads the art through the same loader, builds
// collision, and runs the engine's createIsoState / update / render loop. The
// engine owns movement, collision, doors, shrine discovery, region toasts, the
// warp menu, and fades; this component owns only the canvas and the loop.
//
// Lab-only query params: `?world=capital` renders the live town and
// `?world=island` a sample member island instead of the test scatter, and
// `?tint=<preset>` overrides the world's biome recolor (see terrain-tint.ts).

import { useEffect, useRef, useState } from "react";
import { CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import type { IsoWorld } from "@/lib/game/world-model";
import { isTintPreset } from "@/lib/game/terrain-tint";
import { loadWorldAssets } from "@/lib/game/world-assets";
import {
  createIsoState,
  update,
  render,
  terrainToGrass,
  buildWorldCollision,
  type IsoState,
  type IsoAssets,
} from "@/lib/game/iso-engine";
import { LAB_TOWN } from "@/lib/game/worlds/lab-town";
import { CAPITAL } from "@/lib/game/worlds/capital";
import { buildIsland } from "@/lib/game/worlds/island";

const SAMPLE_ISLAND_OWNER = { id: "lab-island", username: "lab", displayName: "Lab" };

function readLabWorld(): IsoWorld {
  if (typeof window === "undefined") return LAB_TOWN;
  const params = new URLSearchParams(window.location.search);
  const tint = params.get("tint");
  const tintOverride = isTintPreset(tint) ? { tint } : {};
  switch (params.get("world")) {
    case "capital":
      return { ...CAPITAL, ...tintOverride };
    case "island":
      return {
        ...buildIsland({ owner: SAMPLE_ISLAND_OWNER, biome: "forest", isOwn: true }),
        ...tintOverride,
      };
    default:
      return { ...LAB_TOWN, ...tintOverride };
  }
}

export default function IsoLab() {
  const [world] = useState(readLabWorld);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(createInputManager());
  const assetsRef = useRef<IsoAssets | null>(null);
  const grassRef = useRef(terrainToGrass(world));
  const solidRef = useRef(buildWorldCollision(world));
  const stateRef = useRef<IsoState>(createIsoState(world, { playerLabel: "Lab" }));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadWorldAssets(world)
      .then((assets) => {
        if (cancelled) return;
        assetsRef.current = assets;
        setReady(true);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError("Couldn't load art.");
      });
    return () => {
      cancelled = true;
    };
  }, [world]);

  // Fixed-timestep loop (mirrors WorldCanvas).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const input = inputRef.current;
    const cleanupInput = input.attach();

    let lastTime = performance.now();
    let accumulator = 0;
    let rafId = 0;
    function loop(now: number) {
      const elapsed = now - lastTime;
      lastTime = now;
      accumulator = Math.min(accumulator + elapsed, MAX_ACCUMULATOR);
      while (accumulator >= TICK_RATE) {
        update(stateRef.current, world, solidRef.current, input);
        accumulator -= TICK_RATE;
      }
      const assets = assetsRef.current;
      if (assets) {
        ctx.imageSmoothingEnabled = false;
        render(ctx, stateRef.current, world, grassRef.current, assets);
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      cleanupInput();
    };
  }, [world]);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="block rounded-lg border-2 border-line-inverse"
        style={{ width: 768, height: 512, imageRendering: "pixelated" }}
      />
      <p className="font-mono text-xs text-ink-faint">
        {error
          ? error
          : ready
            ? `WASD / Arrows to walk · Enter at a door or shrine · ${world.id} · tint: ${world.tint ?? "forest"}`
            : "Loading art…"}
      </p>
    </div>
  );
}
