"use client";

import { useRef, useEffect, useCallback, useState, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/components/AuthProvider";
import WorldTouchControls from "@/components/WorldTouchControls";
import WorldMenu from "@/components/WorldMenu";
import WorldOverlays, { fixtureScreen, type OverlayScreen } from "@/components/WorldOverlays";
import EmotePicker from "@/components/EmotePicker";
import { apiFetch } from "@/lib/api-client";
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
  menuView,
  setMailboxFlag,
  setFriends,
  setGatherings,
  addDiscovered,
  showToast,
  type IsoState,
  type IsoAssets,
  type MenuEntry,
  type FriendsList,
  type GatheringsList,
} from "@/lib/game/iso-engine";
import {
  gatheringIdFromSpawn,
  mushroomLanding,
  withEventMushrooms,
  type PlantedMushroom,
} from "@/lib/game/event-mushroom";
import { loadIsoSave, persistIsoSave, isValidIsoPosition } from "@/lib/game/iso-save";
import { usePresence } from "@/lib/game/use-presence";
import { useWorldMap } from "@/lib/game/use-world-map";
import type { MinimapDraw } from "@/components/WorldMinimap";
import type { IsoWorld } from "@/lib/game/world-model";
import type { SolidGrid } from "@/lib/game/iso-collision";
import type { Door, WorldFixture, WorldLink } from "@/lib/game/types";
import type { NpcId } from "@/lib/npcs";
import type { MailboxStatus, PlantedMushroomWire } from "@/lib/types";

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
  /** The place's owner display name, for panels that need to greet or
   * address them ("<name>'s mailbox") — currently only the mailbox screens.
   * Blank outside an island, where nothing reads it. */
  ownerDisplayName: string;
  /** Remember position and discoveries on this device. Off when visiting
   * someone else's place, so a visit never overwrites your own trail. */
  persist?: boolean;
  /** Friends' islands for the Friends menu at shrines and PCs. */
  friends: FriendsList;
  /** Gatherings with a planted mushroom this member may travel to, for the
   * Gatherings menu at shrines, PCs, and Event Mushrooms. */
  gatherings: GatheringsList;
  /** Ask the page to reload `gatherings` after a mushroom is planted or
   * picked up, or an invitation answered. */
  onGatheringsChange: () => void;
  /** Whether to ask for the island mailbox's flag. False for a gathering's
   * guest, whom the island's own gate would refuse. */
  checkMailbox?: boolean;
  /** Whether the page is in focus or full-screen mode. Here it picks the full
   * screen button's icon and lets a desktop canvas fill the screen, scaled up;
   * the page (not this component) owns the layout change, since the element
   * that goes full screen has to survive WorldCanvas remounting at every door. */
  immersive: boolean;
  /** Toggle full screen / focus mode on or off. */
  onToggleImmersive: () => void;
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

/** Corner-bracket paths for the full-screen toggle button: brackets at the
 * square's true corners, arms pointing inward, read as "expand"; brackets at
 * the inset corners, arms pointing outward, read as "compress" — the same
 * pair used by fullscreen/fullscreen_exit icons elsewhere. */
const EXPAND_PATHS = ["M4 9V4h5", "M15 4h5v5", "M20 15v5h-5", "M9 20H4v-5"];
const COMPRESS_PATHS = ["M9 4v5H4", "M15 4v5h5", "M15 20v-5h5", "M9 20v-5H4"];

function ScreenModeIcon({ immersive }: { immersive: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {(immersive ? COMPRESS_PATHS : EXPAND_PATHS).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** No planted mushrooms; shared so an empty list keeps one identity. */
const NONE_PLANTED: readonly PlantedMushroom[] = [];

/** Where an `at=gathering-<id>` arrival lands, worked out once per arrival
 * from the first mushroom list, so a later pick-up never moves the player.
 * Null when that mushroom isn't standing here. */
type GatheringArrival = { spawnAt: string; landing: { col: number; row: number } | null };

function toPlanted(wire: PlantedMushroomWire): PlantedMushroom {
  return {
    gatheringId: wire.gathering_id,
    col: wire.col,
    row: wire.row,
    host: wire.host,
    invited: wire.invited,
  };
}

/** The Event Mushrooms standing in a world, for this viewer. */
async function fetchPlanted(worldId: string): Promise<readonly PlantedMushroom[]> {
  const data = await apiFetch<{ mushrooms: PlantedMushroomWire[] }>(
    `/api/gatherings/mushrooms?world=${encodeURIComponent(worldId)}`,
  );
  return data.mushrooms.length > 0 ? data.mushrooms.map(toPlanted) : NONE_PLANTED;
}

/** Where an arrival by `at=gathering-<id>` lands, from the list just read:
 * an open tile beside that mushroom, or null when it isn't standing here. */
function arrivalTile(world: IsoWorld, list: readonly PlantedMushroom[], at: string) {
  const target = list.find((m) => m.gatheringId === gatheringIdFromSpawn(at));
  if (!target) return null;
  const solid = buildWorldCollision(withEventMushrooms(world, list));
  return mushroomLanding(solid, target.col, target.row);
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
  // An NPC id (?at=gnomie) lands the same way — one tile south, like a shrine.
  const npc = spawnAt ? world.npcs?.find((n) => n.id === spawnAt) : undefined;
  if (npc) return { col: npc.col, row: npc.row + 1 };
  // A fixture id (?at=mailbox) lands the same way too.
  const fixture = spawnAt ? world.fixtures?.find((f) => f.id === spawnAt) : undefined;
  if (fixture) return { col: fixture.col, row: fixture.row + 1 };
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
  ownerDisplayName,
  persist = true,
  friends,
  gatherings,
  onGatheringsChange,
  checkMailbox = true,
  immersive,
  onToggleImmersive,
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

  // ── Event Mushrooms planted here ──
  // Runtime state, like the mailbox flag: fetched on arrival and after every
  // plant or pick-up, then added to the world as fixtures (liveWorld), so
  // reach, collision, prompts, and drawing all treat them as furniture.
  // Spawning, saving, and art loading keep the bare `world`, so a mushroom
  // appearing never rebuilds the player's state.
  const [planted, setPlanted] = useState<readonly PlantedMushroom[]>(NONE_PLANTED);
  const [arrival, setArrival] = useState<GatheringArrival | null>(null);
  const liveWorld = useMemo(() => withEventMushrooms(world, planted), [world, planted]);
  const liveSolid = useMemo(() => buildWorldCollision(liveWorld), [liveWorld]);
  const signedIn = !authLoading && !!user;
  const plantedFailed = useCallback(() => {
    const state = stateRef.current;
    if (state) showToast(state, "Couldn't see the Event Mushrooms here.");
  }, []);
  // After a plant or pick-up here.
  const refreshPlanted = useCallback(async () => {
    try {
      setPlanted(await fetchPlanted(world.id));
    } catch {
      plantedFailed();
    }
  }, [world.id, plantedFailed]);
  // On arrival: also works out where an `at=gathering-<id>` arrival lands.
  const arrivingAt = gatheringIdFromSpawn(spawnAt) ? spawnAt : undefined;
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetchPlanted(world.id)
      .then((list) => {
        if (cancelled) return;
        setPlanted(list);
        if (arrivingAt) {
          setArrival({ spawnAt: arrivingAt, landing: arrivalTile(world, list, arrivingAt) });
        }
      })
      .catch(() => {
        if (cancelled) return;
        plantedFailed();
        if (arrivingAt) setArrival({ spawnAt: arrivingAt, landing: null });
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, world, arrivingAt, plantedFailed]);
  // An arrival at a gathering waits for its own answer; any other arrival
  // spawns as before.
  const arrivalReady = !arrivingAt || arrival?.spawnAt === arrivingAt;
  const arrivalKey = arrivalReady && arrivingAt ? JSON.stringify(arrival?.landing ?? null) : "";
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  // Ghost Mode, read by the game loop each frame through a ref so turning it
  // on or off at the armoire takes effect without restarting the loop.
  const ghostRef = useRef(false);
  useEffect(() => {
    ghostRef.current = user?.ghost === true;
  }, [user?.ghost]);
  // The open terminal menu (PC or shrine network), mirrored into React state so
  // the touch overlay (WorldMenu) can render it as tappable DOM tiles. Desktop
  // never reads this — it keeps the canvas-drawn menu. menuKeyRef holds a cheap
  // fingerprint of the last value handed to setMenu, so the game loop (60
  // ticks/sec) only calls setState on an actual change, not every frame.
  const [menu, setMenu] = useState<{ title: string; entries: MenuEntry[] } | null>(null);
  const menuKeyRef = useRef<string | null>(null);
  // Which DOM overlay (dialogue, Pockets, the Notebook, the note reader) is
  // covering the world, if any — see WorldOverlays.tsx, which owns everything
  // about them beyond this one piece of state and the callback below.
  const [overlay, setOverlay] = useState<OverlayScreen>({ kind: "none" });
  const overlayOpen = overlay.kind !== "none";

  // Stable across renders: the engine calls this from inside the game loop
  // (see UpdateCallbacks.onNpcTalk), so it can't close over stale props.
  const handleNpcTalk = useCallback((npcId: NpcId) => {
    setOverlay({ kind: "dialogue", npcId });
  }, []);

  // Same shape as handleNpcTalk: the engine has already paused (pauseForOverlay,
  // inside the "fixture" confirm branch of update()) by the time this fires, so
  // there's nothing to do here beyond choosing which screen to show.
  const handleFixture = useCallback((fixture: WorldFixture) => {
    setOverlay(fixtureScreen(fixture));
  }, []);

  // ── The map (the Capital only) ──
  // Discoveries are per account: loaded on arrival, saved as you explore. The
  // game loop reads them through a ref, so the map arriving never restarts it.
  const mapError = useCallback((message: string) => {
    const state = stateRef.current;
    if (state) showToast(state, message);
  }, []);
  const worldMap = useWorldMap(world, signedIn, mapError);
  const worldMapRef = useRef(worldMap);
  useEffect(() => {
    worldMapRef.current = worldMap;
  }, [worldMap]);
  const minimapDrawRef = useRef<MinimapDraw | null>(null);
  const handleShrineDiscovered = useCallback((shrineId: string) => {
    worldMapRef.current?.sync.noteShrine(shrineId);
  }, []);

  const callbacksRef = useRef({
    onDoorInteract,
    onWorldLink,
    onPcPort,
    onNpcTalk: handleNpcTalk,
    onFixture: handleFixture,
    onShrineDiscovered: handleShrineDiscovered,
  });
  useEffect(() => {
    callbacksRef.current = {
      onDoorInteract,
      onWorldLink,
      onPcPort,
      onNpcTalk: handleNpcTalk,
      onFixture: handleFixture,
      onShrineDiscovered: handleShrineDiscovered,
    };
  }, [onDoorInteract, onWorldLink, onPcPort, handleNpcTalk, handleFixture, handleShrineDiscovered]);

  // ── Live presence: other members here, and emotes ──
  // Members only; a logged-out visitor makes no presence requests at all.
  const { frame: presenceFrameFn, emote: sendEmote } = usePresence(
    world.id,
    !authLoading && !!user,
    stateRef,
  );

  // ── Spawn resolution (deep-link → saved position → default) ──
  const playerLabel = user?.display_name;
  useEffect(() => {
    // An arrival at a gathering's mushroom waits until we know where it
    // stands; the loop idles without a state until then.
    if (!arrivalReady) return;
    const save = persist ? loadIsoSave(world.id) : null;
    const discovered = new Set(save?.discovered ?? []);
    for (const id of ALWAYS_KNOWN_SHRINES) {
      if (world.mushrooms.some((m) => m.id === id)) discovered.add(id);
    }
    const landing: { col: number; row: number } | null = arrivalKey ? JSON.parse(arrivalKey) : null;
    const spawn = landing ?? spawnFor(world, solid, spawnAt, save);
    const state = createIsoState(world, {
      spawnCol: spawn?.col,
      spawnRow: spawn?.row,
      discovered,
      playerLabel,
      fadeIn: true,
    });
    if (arrivalKey === "null") showToast(state, "That gathering's mushroom isn't here right now.");
    stateRef.current = state;
  }, [world, solid, spawnAt, persist, playerLabel, arrivalReady, arrivalKey]);

  // ── Friends' islands and gatherings for the network's menus ──
  // Handed to every fresh state, so this lists every input that makes the
  // spawn effect above build one, plus the lists themselves.
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    setFriends(state, friends);
    setGatherings(state, gatherings);
  }, [friends, gatherings, world, solid, spawnAt, persist, playerLabel, arrivalReady, arrivalKey]);

  // ── Shrines the account already found ──
  // Once the account's discoveries are in, hand its shrines to the engine
  // (this device may never have seen them), and send up any this device found
  // before discoveries were saved per account: the one-time move from the
  // localStorage save, idempotent, so it costs nothing once done. A shrine
  // you've found was a place you stood, so its ground counts as explored.
  // Lists every input that builds a fresh state, like the effect above.
  const mapStatus = worldMap?.status;
  const mapSync = worldMap?.sync;
  useEffect(() => {
    const state = stateRef.current;
    if (!state || !mapSync || mapStatus !== "ready") return;
    for (const id of state.discovered) mapSync.noteShrine(id);
    addDiscovered(state, mapSync.shrines);
    for (const shrine of world.mushrooms) {
      if (mapSync.shrines.has(shrine.id)) mapSync.reveal(shrine.col, shrine.row);
    }
  }, [mapStatus, mapSync, world, solid, spawnAt, persist, playerLabel, arrivalReady, arrivalKey]);

  // ── Mailbox flag on arrival ──
  // The island's mailbox fixture, if this world has one, shows its flag up
  // whenever it holds mail — visible to anyone who walks up, not just the
  // panel's opener. Fetched once per arrival; every mailbox action afterward
  // (WorldOverlays' onMailChange) updates it again from the fresh state
  // instead of refetching. Runs after the spawn-resolution effect above, so
  // stateRef.current already holds this arrival's state by the time it fires.
  useEffect(() => {
    const fixture = world.fixtures?.find((f) => f.kind === "mailbox");
    if (!fixture || !user || !checkMailbox) return;
    let cancelled = false;
    apiFetch<MailboxStatus>(`/api/users/${encodeURIComponent(fixture.owner)}/mailbox`)
      .then((status) => {
        const state = stateRef.current;
        if (!cancelled && state) setMailboxFlag(state, status.has_mail);
      })
      .catch(() => {
        // The flag just stays down — never swallow the failure silently, so
        // show it the same way a region-entry or shrine-discovery message
        // would.
        const state = stateRef.current;
        if (!cancelled && state) showToast(state, "Couldn't check the mailbox.");
      });
    return () => {
      cancelled = true;
    };
    // Every input that makes the spawn effect above build a fresh state (which
    // starts with the flag down) refetches here too, or a new `?at=` on the
    // same island would leave a full mailbox showing its flag down.
  }, [world, user, spawnAt, persist, checkMailbox, arrivalReady, arrivalKey]);

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
  // desktop, then derive an integer device-px zoom from that. Full screen fills
  // on desktop too, scaled up to keep the classic framing. A ResizeObserver
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
      const fill = isTouchDevice || immersive;
      const { cssW, cssH } = fitCanvas(rect.width - border, rect.height - border, fill);
      viewportRef.current = computeViewport(cssW, cssH, dpr, immersive && !isTouchDevice);
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
  }, [isTouchDevice, immersive]);

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
          setView(state, liveWorld, viewport.viewW, viewport.viewH);
        }
        while (accumulator >= TICK_RATE) {
          update(state, liveWorld, liveSolid, input, callbacksRef.current);
          input.endTick();
          accumulator -= TICK_RATE;
        }
        // The map: clear the fog around you (work only on a new tile) and
        // repaint the minimap (only when something changed).
        const map = worldMapRef.current;
        if (map) {
          const player = getLocalEntity(state);
          map.sync.notePosition(player.col, player.row);
          minimapDrawRef.current?.(player, state.discovered);
        }
        // Touch devices render the open menu as DOM tiles (WorldMenu) instead
        // of the canvas rows below; mirror it into React state, but only on an
        // actual change, since this runs every tick.
        if (isTouchDevice) {
          const nextMenu = menuView(state, liveWorld);
          const nextKey = nextMenu
            ? `${nextMenu.title}\n${nextMenu.entries.map((e) => e.label).join("\n")}`
            : null;
          if (nextKey !== menuKeyRef.current) {
            menuKeyRef.current = nextKey;
            setMenu(nextMenu);
          }
        }
        ctx.imageSmoothingEnabled = false;
        // Once per frame, not per tick: other members are placed on the
        // frame's clock, interpolated between the positions the stream sent.
        const presenceFrame = presenceFrameFn(state, now);
        render(ctx, state, liveWorld, grass, assets, {
          viewport,
          promptKey: isTouchDevice ? "A" : "Enter",
          drawMenus: !isTouchDevice,
          presence: presenceFrame,
          ghost: ghostRef.current,
        });
      } else {
        accumulator = 0;
      }

      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [liveWorld, liveSolid, grass, isTouchDevice, presenceFrameFn]);

  // ── Keyboard focus ──
  // Drop whatever holds focus on every arrival (each place remounts this
  // component), so Enter reaches the world. Clicking the navbar's 🍄 left focus
  // on that link, and Next's in-world navigations never move it, so Enter at a
  // PC also followed the link back to /world and dropped you outside. Blurring
  // rather than focusing the canvas keeps a focus ring from appearing around
  // the world after every door; Tab or a click still focuses the canvas.
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, []);

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
            tabIndex={0}
            role="application"
            aria-label="The world. Arrow keys or WASD to move, Enter to interact."
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
          {/* The full screen button, on every device. `menu` is only ever set
              on touch screens, so this hides it under the touch menu overlay
              and never on desktop, where the menu is drawn on the canvas.
              overlayOpen hides it the same way under Pockets/the Notebook/
              dialogue, on every device. */}
          {!menu && !overlayOpen && (
            <button
              type="button"
              onClick={(e) => {
                // Hand focus back to the world: a focused button keeps Enter
                // for itself (input.ts), so the keyboard's next Enter would
                // toggle full screen instead of opening the PC in front of you.
                e.currentTarget.blur();
                onToggleImmersive();
              }}
              aria-label={immersive ? "Exit full screen" : "Full screen"}
              title={immersive ? "Exit full screen" : "Full screen"}
              className="absolute right-2 top-2 z-[5] flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-full border border-white/25 bg-surface/10 hover:bg-surface/20 active:bg-surface/25"
            >
              <ScreenModeIcon immersive={immersive} />
            </button>
          )}
          {/* Emotes: members only, hidden under a menu or overlay like the
              buttons beside it. */}
          {user && !menu && !overlayOpen && <EmotePicker onPick={sendEmote} />}
          <WorldOverlays
            stateRef={stateRef}
            world={liveWorld}
            inputRef={inputRef}
            overlay={overlay}
            setOverlay={setOverlay}
            signedIn={!!user}
            username={user?.username ?? null}
            ownerDisplayName={ownerDisplayName}
            onMushroomsChange={() => {
              void refreshPlanted();
              onGatheringsChange();
            }}
            onGatheringsChange={onGatheringsChange}
            worldMap={worldMap}
            minimapDrawRef={minimapDrawRef}
            isTouchDevice={isTouchDevice}
          />
          {isTouchDevice && menu && (
            <WorldMenu
              title={menu.title}
              entries={menu.entries}
              onPick={(i) => inputRef.current.pick(i)}
              onClose={() => {
                // A press latches until the next tick, so press+release is
                // enough to fire the same Escape the keyboard's Cancel takes.
                inputRef.current.press("Escape");
                inputRef.current.release("Escape");
              }}
            />
          )}
        </div>
      </div>

      {/* Touch joystick — only on touch devices, and hidden while a menu or a
          DOM overlay is open (its unmount already releases any held stick keys). */}
      {isTouchDevice && !menu && !overlayOpen && (
        <WorldTouchControls onPress={handleTouchPress} onRelease={handleTouchRelease} />
      )}
    </div>
  );
}
