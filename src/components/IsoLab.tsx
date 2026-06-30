"use client";

// ── Isometric vertical slice (dev harness) ──
//
// A throwaway page (/iso-lab) for proving the iso migration before touching the
// live world. As of Phase 2 it's a thin harness over the real iso engine
// (iso-engine.ts) — exactly the shape WorldCanvas will take in Phase 3. It loads
// the art, builds collision, and runs the engine's createIsoState / update /
// render loop. The engine owns movement, collision, doors, shrine discovery,
// region toasts, the warp menu, and fades; this component owns only the canvas,
// the fixed-timestep loop, and art loading.

import { useEffect, useRef, useState } from "react";
import { CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { loadObjectSprite, type ObjectSprite } from "@/lib/game/world-object";
import { loadCharacterSheet } from "@/lib/game/character-sheet";
import { OBJECT_CATALOG } from "@/lib/game/world-model";
import { worldAsset, newWorldImage } from "@/lib/game/asset-url";
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

export default function IsoLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(createInputManager());
  const assetsRef = useRef<IsoAssets | null>(null);
  const grassRef = useRef(terrainToGrass(LAB_TOWN));
  const solidRef = useRef(buildWorldCollision(LAB_TOWN));
  const stateRef = useRef<IsoState>(createIsoState(LAB_TOWN));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  // Load art (character sheet, ground sheet, one sprite per object kind used).
  useEffect(() => {
    let cancelled = false;
    const kinds = [...new Set(LAB_TOWN.objects.map((o) => o.kind))];
    Promise.all([
      loadCharacterSheet(worldAsset("/world/characters/long.png")),
      loadImage(worldAsset("/world/tiles/forest.png")),
      loadImage(worldAsset("/world/tiles/water.png")),
      ...kinds.map((k) => loadObjectSprite(worldAsset(OBJECT_CATALOG[k].src))),
    ])
      .then(([characters, forest, water, ...objs]) => {
        if (cancelled) return;
        const objects = Object.fromEntries(
          kinds.map((k, i) => [k, objs[i] as ObjectSprite]),
        ) as Record<string, ObjectSprite>;
        assetsRef.current = {
          characters: characters as Awaited<ReturnType<typeof loadCharacterSheet>>,
          forest: forest as HTMLImageElement,
          water: water as HTMLImageElement,
          objects,
        };
        setReady(true);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError("Couldn't load art.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        update(stateRef.current, LAB_TOWN, solidRef.current, input);
        accumulator -= TICK_RATE;
      }
      const assets = assetsRef.current;
      if (assets) {
        ctx.imageSmoothingEnabled = false;
        render(ctx, stateRef.current, LAB_TOWN, grassRef.current, assets);
      }
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      cleanupInput();
    };
  }, []);

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
            ? "WASD / Arrows to walk · Enter at a door or shrine"
            : "Loading art…"}
      </p>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = newWorldImage(src);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
