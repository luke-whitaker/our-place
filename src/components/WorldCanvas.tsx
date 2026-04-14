"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { generateTileset } from "@/lib/game/tileset";
import { generatePlayerSprites } from "@/lib/game/sprites";
import { createInitialState, update, render } from "@/lib/game/engine";
import { TEST_MAP } from "@/lib/game/maps";
import type { Door } from "@/lib/game/types";

interface WorldCanvasProps {
  /** Called when the player interacts with a door (at peak of fade) */
  onDoorInteract?: (door: Door) => void;
}

/**
 * <WorldCanvas /> — the 8-bit overworld game engine.
 *
 * Renders a tile-based world on a <canvas> element with:
 * - WASD/arrow key + touch D-pad movement
 * - Per-axis collision detection
 * - Camera that follows the player
 * - Door interaction with fade transitions
 * - Responsive scaling (fills viewport width on mobile)
 */
export default function WorldCanvas({ onDoorInteract }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(createInitialState(TEST_MAP));
  const inputRef = useRef(createInputManager());
  const onDoorInteractRef = useRef(onDoorInteract);
  useEffect(() => {
    onDoorInteractRef.current = onDoorInteract;
  }, [onDoorInteract]);

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
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;

    // Generate assets on first frame
    if (!tilesetRef.current) tilesetRef.current = generateTileset();
    if (!spritesRef.current) spritesRef.current = generatePlayerSprites();

    const state = stateRef.current;
    const input = inputRef.current;
    const tileset = tilesetRef.current;
    const sprites = spritesRef.current;
    const map = TEST_MAP;

    let lastTime = performance.now();
    let accumulator = 0;
    let rafId: number;

    function loop(now: number) {
      const elapsed = now - lastTime;
      lastTime = now;
      accumulator = Math.min(accumulator + elapsed, MAX_ACCUMULATOR);

      while (accumulator >= TICK_RATE) {
        update(state, map, input, onDoorInteractRef.current);
        accumulator -= TICK_RATE;
      }

      ctx.imageSmoothingEnabled = false;
      render(ctx, state, map, tileset, sprites);

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);

    return () => cancelAnimationFrame(rafId);
  }, []);

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
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="block border-2 border-gray-800 rounded-lg"
        style={{ imageRendering: "pixelated" }}
      />

      {/* Touch D-pad — only shown on touch devices */}
      {isTouchDevice && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-between items-end px-6 z-30 pointer-events-none">
          {/* D-pad */}
          <div className="flex flex-col items-center gap-1 pointer-events-auto">
            <button
              className="w-14 h-14 rounded-lg bg-white/10 border border-white/20 text-white text-xl active:bg-white/25 select-none"
              onTouchStart={dpadDown("ArrowUp")}
              onTouchEnd={dpadUp("ArrowUp")}
              onTouchCancel={dpadUp("ArrowUp")}
            >
              ▲
            </button>
            <div className="flex gap-1">
              <button
                className="w-14 h-14 rounded-lg bg-white/10 border border-white/20 text-white text-xl active:bg-white/25 select-none"
                onTouchStart={dpadDown("ArrowLeft")}
                onTouchEnd={dpadUp("ArrowLeft")}
                onTouchCancel={dpadUp("ArrowLeft")}
              >
                ◄
              </button>
              <button
                className="w-14 h-14 rounded-lg bg-white/10 border border-white/20 text-white text-xl active:bg-white/25 select-none"
                onTouchStart={dpadDown("ArrowRight")}
                onTouchEnd={dpadUp("ArrowRight")}
                onTouchCancel={dpadUp("ArrowRight")}
              >
                ►
              </button>
            </div>
            <button
              className="w-14 h-14 rounded-lg bg-white/10 border border-white/20 text-white text-xl active:bg-white/25 select-none"
              onTouchStart={dpadDown("ArrowDown")}
              onTouchEnd={dpadUp("ArrowDown")}
              onTouchCancel={dpadUp("ArrowDown")}
            >
              ▼
            </button>
          </div>

          {/* Interact button */}
          <button
            className="w-16 h-16 rounded-full bg-white/10 border-2 border-white/25 text-white text-lg font-bold active:bg-white/25 pointer-events-auto select-none"
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
