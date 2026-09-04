"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import { loadWorldAssets } from "@/lib/game/world-assets";
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
import type { IsoWorld } from "@/lib/game/world-model";
import type { SolidGrid } from "@/lib/game/iso-collision";
import type { Door, WorldLink } from "@/lib/game/types";

interface WorldCanvasProps {
  /** The place to render. Remount (change the key) to move between places. */
  world: IsoWorld;
  /** Called when the player interacts with a door (at peak of fade). */
  onDoorInteract?: (door: Door) => void;
  /** Called when the player takes a link to another world (at peak of fade). */
  onWorldLink?: (link: WorldLink) => void;
  /** Called when the player logs on at a PC (at peak of fade). */
  onPcPort?: (href: string) => void;
  /** Door or shrine id to spawn at (Portal deep-link); falls back to saved/default spawn. */
  spawnAt?: string;
  /** Remember position and discoveries on this device. Off when visiting
   * someone else's place, so a visit never overwrites your own trail. */
  persist?: boolean;
}

/** Persist position + discoveries every few seconds while playing. */
const SAVE_INTERVAL_MS = 3000;

/** Every traveler's home shrine: always in the warp menu, never needs finding. */
const ALWAYS_KNOWN_SHRINES = ["capital-gate"];

/** Where a deep link lands: just south of the door, shrine, or PC it names. */
function spawnFor(
  world: IsoWorld,
  solid: SolidGrid,
  spawnAt: string | undefined,
  saved: { col: number; row: number } | null,
): { col: number; row: number } | undefined {
  const door = spawnAt ? world.doors.find((d) => d.id === spawnAt) : undefined;
  if (door) return { col: door.col, row: door.row + 1 };
  const shrine = spawnAt ? world.mushrooms.find((m) => m.id === spawnAt) : undefined;
  if (shrine) return { col: shrine.col, row: shrine.row + 1 };
  // PC-to-PC travel names a terminal; arrive standing at it, as at a shrine.
  const pc = spawnAt ? world.pcs?.find((p) => p.id === spawnAt) : undefined;
  if (pc) return { col: pc.col, row: pc.row + 1 };
  if (saved && isValidIsoPosition(solid, saved.col, saved.row)) return saved;
  return undefined;
}

/**
 * <WorldCanvas /> — the isometric overworld.
 *
 * Runs the iso engine (createIsoState / update / render) over an IsoWorld and
 * renders it on a <canvas> with WASD/arrow + touch D-pad movement, a camera that
 * follows and clamps to the world, door interaction with fade transitions,
 * mushroom-shrine fast travel, links to other worlds, region toasts, and
 * responsive scaling. Ports: `spawnAt` deep-links you to a door, shrine, or PC;
 * `onDoorInteract` ports you back to that place's forum view, or warps you into
 * the room behind the door when it names one.
 */
export default function WorldCanvas({
  world,
  onDoorInteract,
  onWorldLink,
  onPcPort,
  spawnAt,
  persist = true,
}: WorldCanvasProps) {
  const { user, loading: authLoading } = useAuth();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<IsoState | null>(null);
  const assetsRef = useRef<IsoAssets | null>(null);
  const inputRef = useRef(createInputManager());
  const grass = useMemo(() => terrainToGrass(world), [world]);
  const solid = useMemo(() => buildWorldCollision(world), [world]);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");

  const callbacksRef = useRef({ onDoorInteract, onWorldLink, onPcPort });
  useEffect(() => {
    callbacksRef.current = { onDoorInteract, onWorldLink, onPcPort };
  }, [onDoorInteract, onWorldLink, onPcPort]);

  // ── Spawn resolution (deep-link → saved position → default) ──
  const playerLabel = user?.display_name;
  useEffect(() => {
    const save = persist ? loadIsoSave(world.id) : null;
    const discovered = new Set(save?.discovered ?? []);
    for (const id of ALWAYS_KNOWN_SHRINES) {
      if (world.mushrooms.some((m) => m.id === id)) discovered.add(id);
    }
    const spawn = spawnFor(world, solid, spawnAt, save);
    stateRef.current = createIsoState(world, {
      spawnCol: spawn?.col,
      spawnRow: spawn?.row,
      discovered,
      playerLabel,
      fadeIn: true,
    });
  }, [world, solid, spawnAt, persist, playerLabel]);

  // ── Load art, palette-swapped to the signed-in member's avatar ──
  // We wait for auth to settle so the recolor uses the right colors; a
  // logged-out visitor gets the default paint. `avatarKey` keeps the effect
  // stable across auth refreshes that return the same avatar.
  const avatar = isAvatarConfig(user?.avatar) ? user.avatar : null;
  const avatarKey = JSON.stringify(avatar);
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    loadWorldAssets(world, avatarKey === "null" ? null : JSON.parse(avatarKey))
      .then((assets) => {
        if (cancelled) return;
        assetsRef.current = assets;
        setReady(true);
      })
      .catch((err) => {
        console.error("World art load error:", err);
        if (!cancelled) setLoadError("The world failed to load. Please refresh to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [world, authLoading, avatarKey]);

  // ── Save position + discoveries periodically and on unmount ──
  useEffect(() => {
    if (!ready || !persist) return;
    function save() {
      const state = stateRef.current;
      if (!state) return;
      const player = getLocalEntity(state);
      persistIsoSave(world.id, player.col, player.row, state.discovered);
    }
    const interval = setInterval(save, SAVE_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      save();
    };
  }, [ready, persist, world.id]);

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
  // Fixed timestep. Ticks wait for the art so the arrival fade-in plays over
  // a drawn world rather than finishing behind the loading screen.
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
      if (state && assets) {
        while (accumulator >= TICK_RATE) {
          update(state, world, solid, input, callbacksRef.current);
          accumulator -= TICK_RATE;
        }
        ctx.imageSmoothingEnabled = false;
        render(ctx, state, world, grass, assets);
      } else {
        accumulator = 0;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [world, solid, grass]);

  useEffect(() => {
    const cleanupInput = inputRef.current.attach();
    const cleanupLoop = gameLoop();
    return () => {
      cleanupInput();
      cleanupLoop?.();
    };
  }, [gameLoop]);

  // ── Touch D-pad handlers ──
  // Each button carries its key code in data-key so the two handlers stay
  // direct event handlers (a handler factory would read the ref during render).

  function dpadDown(e: React.TouchEvent<HTMLButtonElement>) {
    e.preventDefault();
    const code = e.currentTarget.dataset.key;
    if (code) inputRef.current.press(code);
  }

  function dpadUp(e: React.TouchEvent<HTMLButtonElement>) {
    e.preventDefault();
    const code = e.currentTarget.dataset.key;
    if (code) inputRef.current.release(code);
  }

  return (
    <div className="flex w-full flex-col items-center">
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
      {isTouchDevice && <TouchControls onDown={dpadDown} onUp={dpadUp} />}
    </div>
  );
}

const DPAD_BUTTON =
  "h-14 w-14 select-none rounded-lg border border-white/20 bg-surface/10 text-xl text-ink-inverse active:bg-surface/25";

function TouchControls({
  onDown,
  onUp,
}: {
  onDown: (e: React.TouchEvent<HTMLButtonElement>) => void;
  onUp: (e: React.TouchEvent<HTMLButtonElement>) => void;
}) {
  const handlers = { onTouchStart: onDown, onTouchEnd: onUp, onTouchCancel: onUp };
  return (
    <div className="fixed bottom-6 left-0 right-0 z-30 flex items-end justify-between px-6 pointer-events-none">
      <div className="flex flex-col items-center gap-1 pointer-events-auto">
        <button className={DPAD_BUTTON} data-key="ArrowUp" {...handlers}>
          ▲
        </button>
        <div className="flex gap-1">
          <button className={DPAD_BUTTON} data-key="ArrowLeft" {...handlers}>
            ◄
          </button>
          <button className={DPAD_BUTTON} data-key="ArrowRight" {...handlers}>
            ►
          </button>
        </div>
        <button className={DPAD_BUTTON} data-key="ArrowDown" {...handlers}>
          ▼
        </button>
      </div>

      <button
        className="h-16 w-16 select-none rounded-full border-2 border-white/25 bg-surface/10 text-lg font-bold text-ink-inverse pointer-events-auto active:bg-surface/25"
        data-key="Enter"
        {...handlers}
      >
        A
      </button>
    </div>
  );
}
