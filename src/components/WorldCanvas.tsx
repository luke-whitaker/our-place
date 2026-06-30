"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { loadObjectSprite, type ObjectSprite } from "@/lib/game/world-object";
import { loadCharacterSheet, type CharacterSprites } from "@/lib/game/character-sheet";
import { OBJECT_CATALOG } from "@/lib/game/world-model";
import { worldAsset, newWorldImage } from "@/lib/game/asset-url";
import {
  createIsoState,
  update,
  render,
  getLocalEntity,
  terrainToGrass,
  buildWorldCollision,
  type IsoState,
  type IsoAssets,
} from "@/lib/game/iso-engine";
import { loadIsoSave, persistIsoSave, isValidIsoPosition } from "@/lib/game/iso-save";
import { CAPITAL } from "@/lib/game/worlds/capital";
import type { Door } from "@/lib/game/types";

interface WorldCanvasProps {
  /** Called when the player interacts with a door (at peak of fade). */
  onDoorInteract?: (door: Door) => void;
  /** Door id to spawn at (Portal deep-link); falls back to saved/default spawn. */
  spawnAt?: string;
}

/** Persist position + discoveries every few seconds while playing. */
const SAVE_INTERVAL_MS = 3000;

// The world to render. The engine reads it as data, so swapping it (a different
// town, a DB-loaded world later) is a one-line change.
const WORLD = CAPITAL;

/**
 * <WorldCanvas /> — the isometric overworld.
 *
 * Runs the iso engine (createIsoState / update / render) over an IsoWorld and
 * renders it on a <canvas> with WASD/arrow + touch D-pad movement, a camera that
 * follows and clamps to the world, door interaction with fade transitions,
 * mushroom-shrine fast travel, region toasts, and responsive scaling. Ports:
 * `spawnAt` deep-links you to a building's door; `onDoorInteract` ports you back
 * to that place's forum view.
 */
export default function WorldCanvas({ onDoorInteract, spawnAt }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<IsoState | null>(null);
  const assetsRef = useRef<IsoAssets | null>(null);
  const inputRef = useRef(createInputManager());
  const grassRef = useRef(terrainToGrass(WORLD));
  const solidRef = useRef(buildWorldCollision(WORLD));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const onDoorInteractRef = useRef(onDoorInteract);
  useEffect(() => {
    onDoorInteractRef.current = onDoorInteract;
  }, [onDoorInteract]);

  // ── Spawn resolution (Portal deep-link → saved position → default) ──
  useEffect(() => {
    const save = loadIsoSave();
    const discovered = new Set(save?.discovered ?? []);
    // The capital gate is every traveler's home shrine — always unlocked.
    const capitalGate = WORLD.mushrooms.find((m) => m.nodeId === "capital");
    if (capitalGate) discovered.add(capitalGate.id);

    let spawnCol: number | undefined;
    let spawnRow: number | undefined;
    const portalDoor = spawnAt && WORLD.doors.find((d) => d.id === spawnAt);
    if (portalDoor) {
      // Arriving via a Portal: appear just south of that building's door.
      spawnCol = portalDoor.col;
      spawnRow = portalDoor.row + 1;
    } else if (save && isValidIsoPosition(solidRef.current, save.col, save.row)) {
      spawnCol = save.col;
      spawnRow = save.row;
    }

    stateRef.current = createIsoState(WORLD, { spawnCol, spawnRow, discovered });
  }, [spawnAt]);

  // ── Load art (character sheet, ground sheet, one sprite per object kind) ──
  useEffect(() => {
    let cancelled = false;
    const kinds = [...new Set(WORLD.objects.map((o) => o.kind))];
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
          characters: characters as CharacterSprites,
          forest: forest as HTMLImageElement,
          water: water as HTMLImageElement,
          objects,
        };
        setReady(true);
      })
      .catch((err) => {
        console.error("World art load error:", err);
        if (!cancelled) setLoadError("The world failed to load. Please refresh to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Save position + discoveries periodically and on unmount ──
  useEffect(() => {
    if (!ready) return;
    function save() {
      const state = stateRef.current;
      if (!state) return;
      const player = getLocalEntity(state);
      persistIsoSave(player.col, player.row, state.discovered);
    }
    const interval = setInterval(save, SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      save();
    };
  }, [ready]);

  const [isTouchDevice] = useState(
    () =>
      typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0),
  );

  // ── Responsive scaling ──
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      // Scale canvas to fit container width, maintaining the 3:2 aspect ratio.
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
    const input = inputRef.current;

    let lastTime = performance.now();
    let accumulator = 0;
    let rafId: number;

    function loop(now: number) {
      const elapsed = now - lastTime;
      lastTime = now;
      accumulator = Math.min(accumulator + elapsed, MAX_ACCUMULATOR);

      const state = stateRef.current;
      const assets = assetsRef.current;
      if (state) {
        while (accumulator >= TICK_RATE) {
          update(state, WORLD, solidRef.current, input, onDoorInteractRef.current);
          accumulator -= TICK_RATE;
        }
        if (assets) {
          ctx.imageSmoothingEnabled = false;
          render(ctx, state, WORLD, grassRef.current, assets);
        }
      } else {
        accumulator = 0;
      }

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
    <div ref={wrapperRef} className="flex w-full flex-col items-center">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="block rounded-lg border-2 border-line-inverse"
          style={{ imageRendering: "pixelated" }}
        />
        {!ready && (
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
        <div className="fixed bottom-6 left-0 right-0 z-30 flex items-end justify-between px-6 pointer-events-none">
          {/* D-pad */}
          <div className="flex flex-col items-center gap-1 pointer-events-auto">
            <button
              className="h-14 w-14 select-none rounded-lg border border-white/20 bg-surface/10 text-xl text-ink-inverse active:bg-surface/25"
              onTouchStart={dpadDown("ArrowUp")}
              onTouchEnd={dpadUp("ArrowUp")}
              onTouchCancel={dpadUp("ArrowUp")}
            >
              ▲
            </button>
            <div className="flex gap-1">
              <button
                className="h-14 w-14 select-none rounded-lg border border-white/20 bg-surface/10 text-xl text-ink-inverse active:bg-surface/25"
                onTouchStart={dpadDown("ArrowLeft")}
                onTouchEnd={dpadUp("ArrowLeft")}
                onTouchCancel={dpadUp("ArrowLeft")}
              >
                ◄
              </button>
              <button
                className="h-14 w-14 select-none rounded-lg border border-white/20 bg-surface/10 text-xl text-ink-inverse active:bg-surface/25"
                onTouchStart={dpadDown("ArrowRight")}
                onTouchEnd={dpadUp("ArrowRight")}
                onTouchCancel={dpadUp("ArrowRight")}
              >
                ►
              </button>
            </div>
            <button
              className="h-14 w-14 select-none rounded-lg border border-white/20 bg-surface/10 text-xl text-ink-inverse active:bg-surface/25"
              onTouchStart={dpadDown("ArrowDown")}
              onTouchEnd={dpadUp("ArrowDown")}
              onTouchCancel={dpadUp("ArrowDown")}
            >
              ▼
            </button>
          </div>

          {/* Interact button */}
          <button
            className="h-16 w-16 select-none rounded-full border-2 border-white/25 bg-surface/10 text-lg font-bold text-ink-inverse pointer-events-auto active:bg-surface/25"
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

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = newWorldImage(src);
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}
