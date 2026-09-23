"use client";

import { useRef, useEffect, useCallback, useState, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/components/AuthProvider";
import WorldTouchControls from "@/components/WorldTouchControls";
import { TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { isAvatarConfig } from "@/lib/game/avatar-recolor";
import { loadWorldAssets } from "@/lib/game/world-assets";
import { computeViewport, fitCanvas, type Viewport } from "@/lib/game/viewport";
import {
  createIsoState,
  update,
  render,
  setView,
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

/** The canvas border width in CSS px (Tailwind's `border-2`). The canvas is
 * `box-content`, so its CSS size is the drawing surface alone; the border sits
 * outside it and has to come out of the space the container offers. */
const CANVAS_BORDER = 2;

/** Touch support doesn't change during a visit, so there is nothing to subscribe to. */
function subscribeNever(): () => void {
  return () => {};
}

function detectTouch(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

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
 * renders it on a <canvas> with WASD/arrow + touch joystick movement, a camera that
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
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<IsoState | null>(null);
  const assetsRef = useRef<IsoAssets | null>(null);
  const viewportRef = useRef<Viewport | null>(null);
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

  // The server can't know whether the device has touch, so it renders without
  // the touch controls and React re-renders with the client's answer after
  // hydration. A lazy useState initializer gave the two different first
  // renders, which React reported as a hydration mismatch on every phone.
  const isTouchDevice = useSyncExternalStore(subscribeNever, detectTouch, () => false);

  // ── Size the canvas to the screen ──
  // The container fills whatever space the page gives it (world/page.tsx makes
  // that the space under the navbar); we measure it and pick a CSS size that
  // fills the screen on touch devices or letterboxes at the classic 960x640 on
  // desktop, then derive an integer device-px zoom from that. A ResizeObserver
  // catches container size changes; the window resize listener catches a DPR
  // change alone (e.g. dragging the window to another monitor), which doesn't
  // fire the observer.
  useEffect(() => {
    function applySize() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const border = CANVAS_BORDER * 2;
      const { cssW, cssH } = fitCanvas(rect.width - border, rect.height - border, isTouchDevice);
      viewportRef.current = computeViewport(cssW, cssH, dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      // Resizing the backing store resets all context state, including
      // smoothing, so it has to be reapplied every time this runs.
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.imageSmoothingEnabled = false;
    }
    applySize();
    const container = containerRef.current;
    const observer = container ? new ResizeObserver(applySize) : null;
    if (container && observer) observer.observe(container);
    window.addEventListener("resize", applySize);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", applySize);
    };
  }, [isTouchDevice]);

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
      const viewport = viewportRef.current;
      if (state && assets && viewport) {
        // A resize between ticks changes the view span; reframe the camera
        // around the (possibly stationary) player before the next update.
        if (state.view.w !== viewport.viewW || state.view.h !== viewport.viewH) {
          setView(state, world, viewport.viewW, viewport.viewH);
        }
        while (accumulator >= TICK_RATE) {
          update(state, world, solid, input, callbacksRef.current);
          accumulator -= TICK_RATE;
        }
        ctx.imageSmoothingEnabled = false;
        render(ctx, state, world, grass, assets, {
          viewport,
          promptKey: isTouchDevice ? "A" : "Enter",
        });
      } else {
        accumulator = 0;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [world, solid, grass, isTouchDevice]);

  useEffect(() => {
    const cleanupInput = inputRef.current.attach();
    const cleanupLoop = gameLoop();
    return () => {
      cleanupInput();
      cleanupLoop?.();
    };
  }, [gameLoop]);

  // ── Touch joystick handlers ──
  // Plain functions that read the ref when called, not a handler factory that
  // would read it during render (the hooks lint forbids the latter).

  function handleTouchPress(code: string) {
    inputRef.current.press(code);
  }

  function handleTouchRelease(code: string) {
    inputRef.current.release(code);
  }

  return (
    <div className="flex h-full w-full flex-col items-center">
      <div ref={containerRef} className="flex min-h-0 w-full flex-1 items-center justify-center">
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="box-content block rounded-lg border-2 border-line-inverse"
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
      </div>

      {/* Touch joystick — only shown on touch devices */}
      {isTouchDevice && (
        <WorldTouchControls onPress={handleTouchPress} onRelease={handleTouchRelease} />
      )}
    </div>
  );
}
