"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { TILE, CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { generateTileset } from "@/lib/game/tileset";
import { generatePlayerSprites } from "@/lib/game/sprites";
import { createInitialState, update, render } from "@/lib/game/engine";
import { loadWorld } from "@/lib/game/world-loader";
import { loadWorldSave, persistWorldSave, isValidPosition } from "@/lib/game/world-save";
import type { Door, GameMap, GameState } from "@/lib/game/types";

interface WorldCanvasProps {
  /** Called when the player interacts with a door (at peak of fade) */
  onDoorInteract?: (door: Door) => void;
  /** Door id to spawn at (Portal deep-link); falls back to saved/default spawn */
  spawnAt?: string;
}

/** Persist position + discoveries every few seconds while playing */
const SAVE_INTERVAL_MS = 3000;

/**
 * <WorldCanvas /> — the 8-bit overworld game engine.
 *
 * Loads the generated 500×500 frontier world (public/world/*) and renders it
 * on a <canvas> element with:
 * - WASD/arrow key + touch D-pad movement
 * - Per-axis collision detection
 * - Camera that follows the player
 * - Door interaction with fade transitions
 * - Mushroom shrine fast travel (discover-to-unlock warp menu)
 * - Region entry toasts
 * - Responsive scaling (fills viewport width on mobile)
 */
export default function WorldCanvas({ onDoorInteract, spawnAt }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const inputRef = useRef(createInputManager());
  const [map, setMap] = useState<GameMap | null>(null);
  const [loadError, setLoadError] = useState("");
  const onDoorInteractRef = useRef(onDoorInteract);
  useEffect(() => {
    onDoorInteractRef.current = onDoorInteract;
  }, [onDoorInteract]);

  // ── World loading + spawn resolution ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { map: world, meta } = await loadWorld();
        if (cancelled) return;

        const save = loadWorldSave();
        const discovered = new Set(save?.discovered ?? []);
        // The capital gate is every traveler's home shrine — always unlocked
        const capitalGate = meta.mushrooms.find((m) => m.nodeId === "capital");
        if (capitalGate) discovered.add(capitalGate.id);

        let spawnX: number | undefined;
        let spawnY: number | undefined;
        const portalDoor = spawnAt && world.doors.find((d) => d.id === spawnAt);
        if (portalDoor) {
          // Arriving via a Portal: appear just below that building's door
          spawnX = portalDoor.col * TILE;
          spawnY = (portalDoor.row + 1) * TILE;
        } else if (save && isValidPosition(world, save.x, save.y)) {
          spawnX = save.x;
          spawnY = save.y;
        }

        stateRef.current = createInitialState(world, { spawnX, spawnY, discovered });
        setMap(world);
      } catch (err) {
        console.error("World load error:", err);
        if (!cancelled) setLoadError("The world failed to load. Please refresh to try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [spawnAt]);

  // ── Save position + discoveries periodically and on unmount ──
  useEffect(() => {
    if (!map) return;
    function save() {
      const state = stateRef.current;
      if (state) persistWorldSave(state.player.x, state.player.y, state.discovered);
    }
    const interval = setInterval(save, SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      save();
    };
  }, [map]);

  const [isTouchDevice] = useState(
    () =>
      typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0),
  );

  // These are generated once on mount and cached
  const tilesetRef = useRef<ReturnType<typeof generateTileset> | null>(null);
  const spritesRef = useRef<ReturnType<typeof generatePlayerSprites> | null>(null);

  // ── Responsive scaling ──
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Scale canvas to fit container width, maintaining 3:2 aspect ratio
      const maxWidth = Math.min(window.innerWidth - 16, 960);
      const scale = maxWidth / CANVAS_W;
      canvas.style.width = `${Math.round(CANVAS_W * scale)}px`;
      canvas.style.height = `${Math.round(CANVAS_H * scale)}px`;
    }

    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Game loop ──
  const gameLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    if (!canvas || !map || !state) return;

    const ctx = canvas.getContext("2d")!;

    // Generate assets on first frame
    if (!tilesetRef.current) tilesetRef.current = generateTileset();
    if (!spritesRef.current) spritesRef.current = generatePlayerSprites();

    const input = inputRef.current;
    const tileset = tilesetRef.current;
    const sprites = spritesRef.current;

    let lastTime = performance.now();
    let accumulator = 0;
    let rafId: number;

    function loop(now: number) {
      const elapsed = now - lastTime;
      lastTime = now;
      accumulator = Math.min(accumulator + elapsed, MAX_ACCUMULATOR);

      while (accumulator >= TICK_RATE) {
        update(state!, map!, input, onDoorInteractRef.current);
        accumulator -= TICK_RATE;
      }

      ctx.imageSmoothingEnabled = false;
      render(ctx, state!, map!, tileset, sprites);

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, [map]);

  useEffect(() => {
    const cleanupInput = inputRef.current.attach();
    const cleanupLoop = gameLoop();

    return () => {
      cleanupInput();
      cleanupLoop?.();
    };
  }, [gameLoop]);

  // ── Touch D-pad handlers ──
  const input = inputRef.current;

  function dpadDown(code: string) {
    return (e: React.TouchEvent) => {
      e.preventDefault();
      input.press(code);
    };
  }

  function dpadUp(code: string) {
    return (e: React.TouchEvent) => {
      e.preventDefault();
      input.release(code);
    };
  }

  return (
    <div ref={wrapperRef} className="flex flex-col items-center w-full">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block border-2 border-line-inverse rounded-lg"
          style={{ imageRendering: "pixelated" }}
        />
        {!map && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-surface-inverse">
            {loadError ? (
              <p className="px-6 text-center font-mono text-sm text-red-400">{loadError}</p>
            ) : (
              <p className="animate-pulse font-mono text-sm text-ink-faint">
                Entering the world...
              </p>
            )}
          </div>
        )}
      </div>

      {/* Touch D-pad — only shown on touch devices */}
      {isTouchDevice && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-between items-end px-6 z-30 pointer-events-none">
          {/* D-pad */}
          <div className="flex flex-col items-center gap-1 pointer-events-auto">
            <button
              className="w-14 h-14 rounded-lg bg-surface/10 border border-white/20 text-ink-inverse text-xl active:bg-surface/25 select-none"
              onTouchStart={dpadDown("ArrowUp")}
              onTouchEnd={dpadUp("ArrowUp")}
              onTouchCancel={dpadUp("ArrowUp")}
            >
              ▲
            </button>
            <div className="flex gap-1">
              <button
                className="w-14 h-14 rounded-lg bg-surface/10 border border-white/20 text-ink-inverse text-xl active:bg-surface/25 select-none"
                onTouchStart={dpadDown("ArrowLeft")}
                onTouchEnd={dpadUp("ArrowLeft")}
                onTouchCancel={dpadUp("ArrowLeft")}
              >
                ◄
              </button>
              <button
                className="w-14 h-14 rounded-lg bg-surface/10 border border-white/20 text-ink-inverse text-xl active:bg-surface/25 select-none"
                onTouchStart={dpadDown("ArrowRight")}
                onTouchEnd={dpadUp("ArrowRight")}
                onTouchCancel={dpadUp("ArrowRight")}
              >
                ►
              </button>
            </div>
            <button
              className="w-14 h-14 rounded-lg bg-surface/10 border border-white/20 text-ink-inverse text-xl active:bg-surface/25 select-none"
              onTouchStart={dpadDown("ArrowDown")}
              onTouchEnd={dpadUp("ArrowDown")}
              onTouchCancel={dpadUp("ArrowDown")}
            >
              ▼
            </button>
          </div>

          {/* Interact button */}
          <button
            className="w-16 h-16 rounded-full bg-surface/10 border-2 border-white/25 text-ink-inverse text-lg font-bold active:bg-surface/25 pointer-events-auto select-none"
            onTouchStart={dpadDown("Enter")}
            onTouchEnd={dpadUp("Enter")}
            onTouchCancel={dpadUp("Enter")}
          >
            A
          </button>
        </div>
      )}
    </div>
  );
}
