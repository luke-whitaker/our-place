// The isometric overworld engine: createIsoState / update / render over an
// IsoWorld. It mirrors engine.ts's shape — the same door/shrine/region/warp/fade
// state machine and the same HUD chrome — but in iso projection, over an entity
// collection, and against the serializable world model. Logic stays pure (no
// canvas in update); render is the only canvas-aware half. This is what
// WorldCanvas will run in Phase 3, replacing the top-down engine.

import { tileToScreen, HALF_W, HALF_H } from "./iso";
import { groundCell, type Terrain } from "./forest-autotile";
import { waterCell, WATER_FRAMES, WATER_FRAME_COLS } from "./water-autotile";
import { drawObject, objectDrawRect, type ObjectSprite } from "./world-object";
import { pickFrame, type CharacterSprites } from "./character-sheet";
import {
  computeIntent,
  applyMovement,
  createEntity,
  type IsoEntity,
  type MoveIntent,
} from "./iso-actor";
import { buildSolidGrid, type SolidGrid } from "./iso-collision";
import { drawPrompt, drawToast, drawWarpMenu, drawNameTag, PROMPT_H, TOAST_BOTTOM } from "./hud";
import {
  CELL,
  ENTITY_CULL_MARGIN,
  visibleGroundTiles,
  rectsOverlap,
  objectCullView,
  type ViewRect,
} from "./iso-cull";
import { FADE_SPEED, PAL } from "./constants";
import type { Viewport } from "./viewport";
import type { GameMode, Door, MushroomWarp, Pc, WorldLink } from "./types";
import type { IsoWorld } from "./world-model";
import type { InputManager } from "./input";

// ── Tuning ──

/** Default (desktop) view: how much world (pre-zoom px) is visible before
 * anything has called setView, e.g. the first tick before the canvas measures
 * itself. Matches the classic 960x640 canvas at a 2x zoom. */
export const ISO_VIEW_W = 480;
export const ISO_VIEW_H = 320;

const ANIM_TICKS = 7; // ticks per walk frame
const WATER_ANIM_TICKS = 12; // ticks per water ripple frame
const FOOT_OFFSET = 4; // nudge the sprite's feet onto the tile centre
const SHADOW_RX = 7;
const SHADOW_RY = 3;

const TOAST_TICKS = 180; // ~3s at 60tps
export const INTERACT_TILES = 1.5; // door/PC/shrine reach, in tiles

/** How long the interaction prompt flashes green before its action fires: 200ms
 * at the 60-tick simulation rate. Long enough to read as a deliberate commit,
 * short enough not to feel like a delay. */
export const CONFIRM_TICKS = 12;

// Camera padding (pre-zoom px). Sides/bottom get a half-tile of breathing room;
// the top gets more so tall sprites (houses, trees) at the north edge aren't
// clipped. Tunable with the real town's camera feel in Phase 4.
const CAM_EDGE_PAD = HALF_W;
const CAM_TOP_PAD = 112;

// ── State ──

/** What an armed interaction prompt will do once its confirm flash finishes. */
export type ConfirmAction = { kind: "door"; door: Door } | { kind: "pc" } | { kind: "shrine" };

export interface IsoState {
  mode: GameMode;
  /** Every actor in the world. The local player is entities[find(localId)];
   * remote players (later) join the same list and update/render treat them all
   * the same. */
  entities: IsoEntity[];
  localId: string;
  /** Camera top-left in world-screen pixels (pre-zoom). */
  camera: { x: number; y: number };
  /** World span visible (pre-zoom px), set by setView on every canvas resize.
   * cameraFor reads this to centre and clamp the camera, so a resize reframes a
   * player who is standing still instead of leaving the old span in place. */
  view: { w: number; h: number };
  frameTick: number;
  fade: number;
  fadeDir: -1 | 0 | 1;
  nearbyDoor: Door | null;
  pendingDoor: Door | null;
  /** Whether walking into `nearbyDoor` may warp. Cleared when a door fires and
   * when the player spawns already standing at one, so arriving through a door
   * never bounces straight back out; set again once no door is in reach. */
  doorArmed: boolean;
  nearbyMushroom: MushroomWarp | null;
  pendingWarp: MushroomWarp | null;
  /** A chosen link to another world, fired at the peak of the fade like a door. */
  pendingLink: WorldLink | null;
  nearbyPc: Pc | null;
  /** A chosen "log on" target, fired at the peak of the fade like a link. */
  pendingPort: string | null;
  discovered: Set<string>;
  /** Cursor into whichever modal list is open — the shrine network or a PC. */
  menuIndex: number;
  currentRegionId: string | null;
  toast: { text: string; ticksLeft: number } | null;
  /** An interaction the player has committed to: the prompt pill flashes green
   * for CONFIRM_TICKS, then the action fires. Null when nothing is armed. */
  confirm: { text: string; ticksLeft: number; action: ConfirmAction } | null;
}

export interface IsoStateOptions {
  /** Spawn tile overriding the world's default spawn. */
  spawnCol?: number;
  spawnRow?: number;
  /** Shrines already discovered (from a saved game). */
  discovered?: Iterable<string>;
  /** The local player's name tag. */
  playerLabel?: string;
  /** Start black and fade in, for arriving from another world. */
  fadeIn?: boolean;
}

export function getLocalEntity(state: IsoState): IsoEntity {
  const entity = state.entities.find((e) => e.id === state.localId);
  if (!entity) throw new Error(`No local entity "${state.localId}" in state`);
  return entity;
}

export function createIsoState(world: IsoWorld, options: IsoStateOptions = {}): IsoState {
  const player = createEntity(
    "local",
    options.spawnCol ?? world.spawn.col,
    options.spawnRow ?? world.spawn.row,
    options.playerLabel,
  );

  const state: IsoState = {
    mode: options.fadeIn ? "fading" : "overworld",
    entities: [player],
    localId: "local",
    camera: { x: 0, y: 0 },
    view: { w: ISO_VIEW_W, h: ISO_VIEW_H },
    frameTick: 0,
    fade: options.fadeIn ? 1 : 0,
    fadeDir: options.fadeIn ? -1 : 0,
    nearbyDoor: null,
    pendingDoor: null,
    // You always arrive next to the door you came through, so start disarmed.
    doorArmed: false,
    nearbyMushroom: null,
    pendingWarp: null,
    pendingLink: null,
    nearbyPc: null,
    pendingPort: null,
    discovered: new Set(options.discovered ?? []),
    menuIndex: 0,
    // Left null so the first update fires the spawn region's entry toast.
    currentRegionId: null,
    toast: null,
    confirm: null,
  };

  updateCamera(state, world);
  return state;
}

// ── Proximity & regions (tile space) ──

function isNear(col: number, row: number, tileCol: number, tileRow: number): boolean {
  return Math.hypot(col - tileCol, row - tileRow) < INTERACT_TILES;
}

function findNearbyDoor(world: IsoWorld, col: number, row: number): Door | null {
  for (const door of world.doors) {
    if (isNear(col, row, door.col, door.row)) return door;
  }
  return null;
}

function findNearbyMushroom(world: IsoWorld, col: number, row: number): MushroomWarp | null {
  for (const shrine of world.mushrooms) {
    if (isNear(col, row, shrine.col, shrine.row)) return shrine;
  }
  return null;
}

function findNearbyPc(world: IsoWorld, col: number, row: number): Pc | null {
  for (const pc of world.pcs ?? []) {
    if (isNear(col, row, pc.col, pc.row)) return pc;
  }
  return null;
}

/** Whatever the player could interact with from where they stand. */
export interface Targets {
  door: Door | null;
  pc: Pc | null;
  mushroom: MushroomWarp | null;
}

/**
 * Narrow what is in reach to the one thing nearest the player, so the prompt,
 * Enter, and walking into a door always agree. Without this a door beat a PC
 * whenever both were in reach, and in rooms where the exit sits two tiles from
 * the computer, stepping up to the PC walked you out of the building instead.
 * Ties go to the door, then the PC, so a door can always be walked into from
 * the tile you arrive on.
 */
export function nearestTarget(inReach: Targets, col: number, row: number): Targets {
  const candidates = [
    { kind: "door", at: inReach.door },
    { kind: "pc", at: inReach.pc },
    { kind: "mushroom", at: inReach.mushroom },
  ] as const;
  let best: (typeof candidates)[number] | null = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    if (!candidate.at) continue;
    const dist = Math.hypot(col - candidate.at.col, row - candidate.at.row);
    // Strictly nearer only, so an earlier kind keeps a tie.
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  return {
    door: best?.kind === "door" ? inReach.door : null,
    pc: best?.kind === "pc" ? inReach.pc : null,
    mushroom: best?.kind === "mushroom" ? inReach.mushroom : null,
  };
}

export function findRegionId(world: IsoWorld, col: number, row: number): string | null {
  const c = Math.floor(col);
  const r = Math.floor(row);
  for (const region of world.regions) {
    const b = region.bounds;
    if (c >= b.col && c < b.col + b.w && r >= b.row && r < b.row + b.h) {
      return region.id;
    }
  }
  return null;
}

/** Discovered shrines the player can warp to (excludes the one they're standing at). */
export function warpMenuOptions(state: IsoState, world: IsoWorld): MushroomWarp[] {
  return world.mushrooms.filter(
    (m) => state.discovered.has(m.id) && m.id !== state.nearbyMushroom?.id,
  );
}

/** One selectable row of a terminal menu: a shrine in this world, a link to
 * another world, or a port out of the world entirely (a PC logging on). */
export type MenuEntry =
  | { kind: "shrine"; label: string; warp: MushroomWarp }
  | { kind: "link"; label: string; link: WorldLink }
  | { kind: "port"; label: string; href: string };

/** The shrine menu: discovered shrines first, then the world's links (which
 * never need discovering). The caller appends its own Cancel row. */
export function warpMenuEntries(state: IsoState, world: IsoWorld): MenuEntry[] {
  return [
    ...warpMenuOptions(state, world).map((warp): MenuEntry => ({
      kind: "shrine",
      label: warp.label,
      warp,
    })),
    ...world.links.map((link): MenuEntry => ({ kind: "link", label: link.label, link })),
  ];
}

/** A PC's menu: log on to the forum view of the place it stands in, then the
 * world's links as the rest of the terminal network. A PC with no href offers
 * travel only. Links are what any terminal here can reach — a shrine draws on
 * the same list, which is why an interior keeps its network in `links`. */
export function pcMenuEntries(pc: Pc, world: IsoWorld): MenuEntry[] {
  const logOn: MenuEntry[] = pc.href ? [{ kind: "port", label: "Log on", href: pc.href }] : [];
  return [
    ...logOn,
    ...world.links.map((link): MenuEntry => ({ kind: "link", label: link.label, link })),
  ];
}

/** The open terminal menu's title and rows (without the Cancel row), or null
 * when no menu is open. Shared by the canvas-drawn menu and the touch DOM
 * overlay (WorldMenu) so their title/row logic can never drift apart. */
export function menuView(
  state: IsoState,
  world: IsoWorld,
): { title: string; entries: MenuEntry[] } | null {
  if (state.mode === "warp-menu") {
    return { title: "Mycelium Network", entries: warpMenuEntries(state, world) };
  }
  if (state.mode === "pc-menu" && state.nearbyPc) {
    return { title: state.nearbyPc.label, entries: pcMenuEntries(state.nearbyPc, world) };
  }
  return null;
}

/** Drive an open modal list. Returns the chosen row, "cancel" when the player
 * backs out or picks the Cancel row, or null while the menu is still open.
 * Shared by both menus so their key handling can never drift apart. A DOM tile
 * tap (touch devices) arrives as a pick rather than a key, and is read first:
 * an in-range pick chooses that row outright; an out-of-range one is ignored
 * (the tile grid never produces one, but a stale pick from a menu that just
 * shrank must not choose the wrong row) and leaves the menu open rather than
 * falling through to the keyboard/joystick handling below. */
function stepMenu(
  state: IsoState,
  input: InputManager,
  entries: MenuEntry[],
): MenuEntry | "cancel" | null {
  const total = entries.length + 1; // + Cancel
  const picked = input.consumePick();
  if (picked !== null) {
    if (!Number.isInteger(picked) || picked < 0 || picked >= entries.length) return null;
    state.menuIndex = picked;
    return entries[picked];
  }
  if (input.consume("Escape")) return "cancel";
  if (input.consume("ArrowUp") || input.consume("KeyW")) {
    state.menuIndex = (state.menuIndex - 1 + total) % total;
  }
  if (input.consume("ArrowDown") || input.consume("KeyS")) {
    state.menuIndex = (state.menuIndex + 1) % total;
  }
  if (input.consume("Enter") || input.consume("Space")) {
    return entries[state.menuIndex] ?? "cancel";
  }
  return null;
}

/** Commit a chosen row: stage it and start the fade. The pending value is acted
 * on at the fade's peak, so every transition looks the same as a door's. */
function chooseEntry(state: IsoState, entry: MenuEntry): void {
  if (entry.kind === "shrine") state.pendingWarp = entry.warp;
  else if (entry.kind === "link") state.pendingLink = entry.link;
  else state.pendingPort = entry.href;
  state.mode = "fading";
  state.fadeDir = 1;
}

/** The world's projected screen extent (tile centres), in pre-zoom pixels. */
function worldScreenBounds(world: IsoWorld): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: -(world.rows - 1) * HALF_W,
    right: (world.cols - 1) * HALF_W,
    top: 0,
    bottom: (world.cols - 1 + (world.rows - 1)) * HALF_H,
  };
}

/** Clamp a camera axis to [lo, hi]; if the world is smaller than the view on that
 * axis (hi < lo), centre it instead of pinning to an edge. */
function clampCamera(value: number, lo: number, hi: number): number {
  if (hi < lo) return (lo + hi) / 2;
  return Math.max(lo, Math.min(value, hi));
}

/** Camera top-left (pre-zoom px) for a local entity at (col,row): centred on the
 * entity, then clamped so the given view stays within the world's padded
 * bounds. Pure, so it's unit-tested directly. */
export function cameraFor(
  world: IsoWorld,
  col: number,
  row: number,
  view: { w: number; h: number },
): { x: number; y: number } {
  const pos = tileToScreen(col, row);
  const b = worldScreenBounds(world);
  return {
    x: Math.round(
      clampCamera(pos.x - view.w / 2, b.left - CAM_EDGE_PAD, b.right + CAM_EDGE_PAD - view.w),
    ),
    y: Math.round(
      clampCamera(pos.y - view.h / 2, b.top - CAM_TOP_PAD, b.bottom + CAM_EDGE_PAD - view.h),
    ),
  };
}

function updateCamera(state: IsoState, world: IsoWorld): void {
  const player = getLocalEntity(state);
  state.camera = cameraFor(world, player.col, player.row, state.view);
}

/** Resize the visible world span, e.g. when the canvas is resized to fit the
 * screen, and reframe the camera around the (possibly stationary) player so a
 * resize never leaves the old, wrong-sized view in place for a tick. */
export function setView(state: IsoState, world: IsoWorld, w: number, h: number): void {
  state.view = { w, h };
  updateCamera(state, world);
}

// ── Update ──

/** Whether an intent heads up-screen, which is what walking into a door looks
 * like: doors sit on the north face of whatever they open (a building's front
 * onto the street, a room's exit in its north wall), and the camera looks at
 * that face. Screen space, not tile space, is the right test here — the tile
 * axes run diagonally, so "east along the street" is screen down-right and would
 * read as northward on the row axis alone. */
function headingIntoDoor(intent: MoveIntent): boolean {
  return intent.sy < 0;
}

/** Stage a door and start the fade. Disarms auto-warp so the door you arrive at
 * on the other side cannot immediately fire in return. */
function enterDoor(state: IsoState, door: Door): void {
  state.mode = "fading";
  state.fadeDir = 1;
  state.pendingDoor = door;
  state.doorArmed = false;
}

/** Arm an interaction: the prompt pill flashes green for CONFIRM_TICKS before
 * `action` actually fires (see the confirm handling in update()). `text` is
 * the target's own label, since the pill drops "Press" and the key name. */
function startConfirm(state: IsoState, text: string, action: ConfirmAction): void {
  state.confirm = { text, ticksLeft: CONFIRM_TICKS, action };
}

/** Fired at the peak of a door fade — the caller ports to that place's forum view. */
export type OnDoorInteract = (door: Door) => void;
/** Fired at the peak of a link fade — the caller navigates to the other world. */
export type OnWorldLink = (link: WorldLink) => void;
/** Fired at the peak of a PC "log on" fade — the caller ports to that href. */
export type OnPcPort = (href: string) => void;

export interface UpdateCallbacks {
  onDoorInteract?: OnDoorInteract;
  onWorldLink?: OnWorldLink;
  onPcPort?: OnPcPort;
}

export function update(
  state: IsoState,
  world: IsoWorld,
  solid: SolidGrid,
  input: InputManager,
  callbacks: UpdateCallbacks = {},
): void {
  state.frameTick++;

  if (state.toast) {
    state.toast.ticksLeft--;
    if (state.toast.ticksLeft <= 0) state.toast = null;
  }

  // ── Fade handling ──
  if (state.fadeDir !== 0) {
    state.fade = Math.max(0, Math.min(1, state.fade + state.fadeDir * FADE_SPEED));

    if (state.fade >= 1 && state.fadeDir === 1) {
      if (state.pendingDoor && callbacks.onDoorInteract) {
        callbacks.onDoorInteract(state.pendingDoor);
      }
      if (state.pendingLink) {
        const link = state.pendingLink;
        state.pendingLink = null;
        state.pendingDoor = null;
        if (callbacks.onWorldLink) {
          // The caller navigates away. Freeze black (fadeDir 0 while still
          // "fading") so the old world never flashes back in before the new
          // one mounts; without a handler, fall through and fade back in.
          state.fadeDir = 0;
          callbacks.onWorldLink(link);
          return;
        }
      }
      if (state.pendingPort) {
        const href = state.pendingPort;
        state.pendingPort = null;
        state.pendingDoor = null;
        if (callbacks.onPcPort) {
          // Same contract as a link: the caller navigates, so hold black rather
          // than fading a world back in that is about to be replaced.
          state.fadeDir = 0;
          callbacks.onPcPort(href);
          return;
        }
      }
      if (state.pendingWarp) {
        const warp = state.pendingWarp;
        const player = getLocalEntity(state);
        // Shrine tiles are solid — land one tile south of the shrine.
        player.col = warp.col;
        player.row = warp.row + 1;
        updateCamera(state, world);
        state.currentRegionId = findRegionId(world, player.col, player.row);
        state.toast = { text: warp.label, ticksLeft: TOAST_TICKS };
        state.pendingWarp = null;
      }
      state.fadeDir = -1;
      state.pendingDoor = null;
    }

    if (state.fade <= 0 && state.fadeDir === -1) {
      state.fadeDir = 0;
      state.fade = 0;
      state.mode = "overworld";
    }
    return; // no input during a fade
  }

  // ── Terminal menus (the shrine network, and a PC) ──
  if (state.mode === "warp-menu" || state.mode === "pc-menu") {
    const entries =
      state.mode === "pc-menu" && state.nearbyPc
        ? pcMenuEntries(state.nearbyPc, world)
        : warpMenuEntries(state, world);
    const chosen = stepMenu(state, input, entries);
    if (chosen === "cancel") state.mode = "overworld";
    else if (chosen) chooseEntry(state, chosen);
    return;
  }

  if (state.mode !== "overworld") return;

  // ── Confirming an interaction (the prompt pill's green flash) ──
  // The player has committed; freeze them in place for CONFIRM_TICKS so the
  // flash reads as a deliberate beat rather than an instant cut, then perform
  // the action. Draining Enter/Space every tick (not just on the last one)
  // stops a second press made mid-flash from being read as the first keypress
  // of the menu that opens right after — which would pick its row 0 instantly.
  if (state.confirm) {
    const player = getLocalEntity(state);
    player.moving = false;
    player.animTimer = 0;
    input.consume("Enter");
    input.consume("Space");

    state.confirm.ticksLeft--;
    if (state.confirm.ticksLeft <= 0) {
      const { action } = state.confirm;
      state.confirm = null;
      if (action.kind === "door") enterDoor(state, action.door);
      else if (action.kind === "pc") {
        state.mode = "pc-menu";
        state.menuIndex = 0;
      } else {
        state.mode = "warp-menu";
        state.menuIndex = 0;
      }
    }
    return;
  }

  const player = getLocalEntity(state);

  // ── Door / PC / shrine proximity ──
  const inReach: Targets = {
    door: findNearbyDoor(world, player.col, player.row),
    pc: findNearbyPc(world, player.col, player.row),
    mushroom: findNearbyMushroom(world, player.col, player.row),
  };
  // Discovery and arming read everything in reach, not just the nearest: a
  // shrine you pass is found even beside a door, and a door re-arms only once
  // you are clear of it.
  if (inReach.mushroom && !state.discovered.has(inReach.mushroom.id)) {
    state.discovered.add(inReach.mushroom.id);
    state.toast = { text: `${inReach.mushroom.label} discovered!`, ticksLeft: TOAST_TICKS };
  }
  if (!inReach.door) state.doorArmed = true;

  const target = nearestTarget(inReach, player.col, player.row);
  state.nearbyDoor = target.door;
  state.nearbyPc = target.pc;
  state.nearbyMushroom = target.mushroom;

  const intent = computeIntent(input);

  // ── Interaction (at most one target survives nearestTarget above) ──
  // A door opens two ways: walk up into it, or press Enter. Enter is not gated
  // on arming, because pressing it is already deliberate; it is also how a
  // player deep-linked onto a doorstep goes straight in.
  // Every path here arms a confirm rather than acting immediately (see above).
  if (state.nearbyDoor && state.doorArmed && headingIntoDoor(intent)) {
    startConfirm(state, state.nearbyDoor.label, { kind: "door", door: state.nearbyDoor });
    return;
  }
  if (state.nearbyDoor && (input.consume("Enter") || input.consume("Space"))) {
    startConfirm(state, state.nearbyDoor.label, { kind: "door", door: state.nearbyDoor });
    return;
  }
  if (state.nearbyPc && (input.consume("Enter") || input.consume("Space"))) {
    startConfirm(state, state.nearbyPc.label, { kind: "pc" });
    return;
  }
  if (state.nearbyMushroom && (input.consume("Enter") || input.consume("Space"))) {
    startConfirm(state, state.nearbyMushroom.label, { kind: "shrine" });
    return;
  }

  // ── Movement (local entity only; remote actors come from the network later) ──
  applyMovement(solid, player, intent);
  updateCamera(state, world);

  // ── Region entry toasts ──
  const regionId = findRegionId(world, player.col, player.row);
  if (regionId !== state.currentRegionId) {
    state.currentRegionId = regionId;
    if (regionId) {
      const region = world.regions.find((r) => r.id === regionId);
      if (region) state.toast = { text: region.label, ticksLeft: TOAST_TICKS };
    }
  }
}

// ── Render ──

export interface IsoAssets {
  /** The Evergrow ground autotile sheet. */
  forest: HTMLImageElement;
  /** The Evergrow water autotile sheet (grass-bordered). */
  water: HTMLImageElement;
  /** Object sprites keyed by catalog kind. */
  objects: Record<string, ObjectSprite>;
  /** Character frames (shared for now; per-entity once players have identity). */
  characters: CharacterSprites;
}

/** Project a world's terrain to the grass grid the forest autotiler reads. Water
 * counts as grass here so land tiles border the pond with grass (the water cells
 * carry their own grass edge), not a dirt seam. */
export function terrainToGrass(world: IsoWorld): Terrain {
  return world.terrain.map((row) => row.map((kind) => kind === "grass" || kind === "water"));
}

/** Bake a world's collision once (re-export so harnesses build it the same way). */
export function buildWorldCollision(world: IsoWorld): SolidGrid {
  return buildSolidGrid(world);
}

export function render(
  ctx: CanvasRenderingContext2D,
  state: IsoState,
  world: IsoWorld,
  grass: Terrain,
  assets: IsoAssets,
  frame: { viewport: Viewport; promptKey: string; drawMenus?: boolean },
): void {
  const { worldScale, dpr, cssW, cssH } = frame.viewport;
  // Touch devices draw the open menu as a DOM overlay (WorldMenu) instead —
  // its rows are large enough to tap and it fits a phone held sideways, which
  // the canvas's fixed 24px rows never could. Desktop leaves this true.
  const drawMenus = frame.drawMenus ?? true;

  // A canvas resize resets the 2D context's transform, and the world/HUD
  // layers below each set their own, so start from a known identity transform
  // before touching backing-store pixels directly.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAL.darkest;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // World layer: world-space (pre-zoom) px -> device px in one integer scale,
  // so pixel art stays crisp at any DPR/zoom combination. The HUD below draws
  // in its own CSS-px layer instead.
  ctx.save();
  ctx.setTransform(worldScale, 0, 0, worldScale, 0, 0);
  const { x: camX, y: camY } = state.camera;

  drawGround(ctx, world, grass, assets, state.frameTick, camX, camY, state.view);

  // Objects + entities, painter's order by ground-anchor screen-Y. Each is
  // skipped when its drawn rectangle can't possibly overlap the view — this
  // only prunes work from the loop below; it never changes what gets drawn,
  // since the skip test uses the exact same rectangle drawObject/drawEntity
  // would paint.
  const view = objectCullView(camX, camY, state.view.w, state.view.h);
  type Drawable = { depth: number; draw: () => void };
  const drawables: Drawable[] = [];
  for (const obj of world.objects) {
    const sprite = assets.objects[obj.kind];
    if (!sprite) continue;
    const placed = { sprite, col: obj.col, row: obj.row };
    if (!rectsOverlap(objectDrawRect(placed), view)) continue;
    drawables.push({
      depth: tileToScreen(obj.col, obj.row).y,
      draw: () => drawObject(ctx, placed, camX, camY),
    });
  }
  for (const entity of state.entities) {
    const pos = tileToScreen(entity.col, entity.row);
    const entityRect: ViewRect = {
      x: pos.x - ENTITY_CULL_MARGIN,
      y: pos.y - ENTITY_CULL_MARGIN,
      w: ENTITY_CULL_MARGIN * 2,
      h: ENTITY_CULL_MARGIN * 2,
    };
    if (!rectsOverlap(entityRect, view)) continue;
    drawables.push({
      depth: pos.y,
      draw: () => drawEntity(ctx, entity, assets.characters, camX, camY),
    });
  }
  drawables.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

  ctx.restore();

  // ── HUD layer: lays out in CSS px, one unit = one CSS px, so text stays
  // crisp no matter how the world layer above is zoomed or how the canvas is
  // scaled to fit the screen. ──
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hudSize = { w: cssW, h: cssH };
  drawNameTags(ctx, state, assets.characters, view, frame.viewport);
  if (state.fade === 0 && state.mode === "overworld") {
    // Yellow while just in reach, green for the confirm flash right before the
    // action fires; door > PC > shrine when more than one is in reach, as today.
    const label =
      state.confirm?.text ??
      state.nearbyDoor?.label ??
      state.nearbyPc?.label ??
      state.nearbyMushroom?.label;
    if (label) {
      const player = getLocalEntity(state);
      const head = headHudPos(player, assets.characters, state.camera, frame.viewport);
      const above = head.y - NAME_TAG_GAP - NAME_TAG_TEXT_H - PROMPT_GAP;
      // On a short canvas, or near the map's north edge, the pill above the
      // head can land on the region toast. While a toast shows, hang the pill
      // below the player's feet instead.
      const hitsToast = state.toast !== null && above - PROMPT_H < TOAST_BOTTOM + PROMPT_GAP;
      const feetY =
        ((tileToScreen(player.col, player.row).y + FOOT_OFFSET - state.camera.y) * worldScale) /
        dpr;
      const anchor = { x: head.x, y: hitsToast ? feetY + PROMPT_GAP + PROMPT_H : above };
      drawPrompt(ctx, frame.promptKey, label, anchor, hudSize, state.confirm !== null);
    }
  }

  if (drawMenus) {
    const menu = menuView(state, world);
    if (menu) {
      const entries = [...menu.entries.map((e) => e.label), "Cancel"];
      drawWarpMenu(ctx, menu.title, entries, state.menuIndex, hudSize);
    }
  }

  if (state.toast) {
    drawToast(ctx, state.toast, hudSize);
  }

  if (state.fade > 0) {
    ctx.fillStyle = PAL.darkest;
    ctx.globalAlpha = state.fade;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.globalAlpha = 1;
  }
}

function drawGround(
  ctx: CanvasRenderingContext2D,
  world: IsoWorld,
  grass: Terrain,
  assets: IsoAssets,
  frameTick: number,
  camX: number,
  camY: number,
  view: { w: number; h: number },
): void {
  const { cols, rows, terrain } = world;
  const waterFrame = Math.floor(frameTick / WATER_ANIM_TICKS) % WATER_FRAMES;
  // Back-to-front by (col+row) so each surface covers the dirt skirt behind it.
  // visibleGroundTiles restricts this to the diagonal bands the camera can
  // actually see (see iso-cull.ts) instead of the whole grid — it yields tiles
  // in the same order the old unculled double loop did, so output is unchanged.
  for (const { col, row } of visibleGroundTiles(camX, camY, view.w, view.h, cols, rows)) {
    const kind = terrain[row][col];
    if (kind === "void") continue;
    const s = tileToScreen(col, row);
    const dx = Math.round(s.x - 16 - camX);
    const dy = Math.round(s.y - 8 - camY);
    if (kind === "water") {
      const [bc, br] = waterCell(terrain, col, row);
      const sc = bc + waterFrame * WATER_FRAME_COLS;
      ctx.drawImage(assets.water, sc * CELL, br * CELL, CELL, CELL, dx, dy, CELL, CELL);
    } else {
      const [sc, sr] = groundCell(grass, col, row);
      ctx.drawImage(assets.forest, sc * CELL, sr * CELL, CELL, CELL, dx, dy, CELL, CELL);
    }
  }
}

function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: IsoEntity,
  characters: CharacterSprites,
  camX: number,
  camY: number,
): void {
  const pos = tileToScreen(entity.col, entity.row);

  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(pos.x - camX, pos.y - camY, SHADOW_RX, SHADOW_RY, 0, 0, Math.PI * 2);
  ctx.fill();

  const frame = pickFrame(characters, entity.dir, entity.moving, entity.animTimer, ANIM_TICKS);
  ctx.drawImage(
    frame,
    Math.round(pos.x - frame.width / 2 - camX),
    Math.round(pos.y - frame.height + FOOT_OFFSET - camY),
  );
}

/** Gap between a sprite's head and its name tag, in CSS px. */
const NAME_TAG_GAP = 4;
/** Approximate visual height of a name tag's text (drawNameTag's bold 12px
 * monospace). Only used to clear the tag when placing the prompt pill above
 * it, not as exact glyph metrics — the pill just needs to sit above the tag,
 * not hug it. */
const NAME_TAG_TEXT_H = 12;
/** Gap between the top of a name tag and the bottom of the prompt pill above it. */
const PROMPT_GAP = 6;

/** A sprite's head anchor in the HUD's CSS-px layer: where drawNameTags hangs a
 * name tag below it, and where render() hangs the interaction prompt pill
 * further above it. Shared so the two can never drift apart. Sprites are one
 * height per sheet, so the idle frame's height places the anchor for any pose. */
function headHudPos(
  entity: Pick<IsoEntity, "col" | "row" | "dir">,
  characters: CharacterSprites,
  camera: { x: number; y: number },
  viewport: Viewport,
): { x: number; y: number } {
  const pos = tileToScreen(entity.col, entity.row);
  const headY =
    pos.y - pickFrame(characters, entity.dir, false, 0, ANIM_TICKS).height + FOOT_OFFSET;
  return {
    x: ((pos.x - camera.x) * viewport.worldScale) / viewport.dpr,
    y: ((headY - camera.y) * viewport.worldScale) / viewport.dpr,
  };
}

/** Name tags for every labelled entity in view, drawn in the HUD's CSS-px layer
 * (after the zoomed world layer) so the text stays crisp. */
function drawNameTags(
  ctx: CanvasRenderingContext2D,
  state: IsoState,
  characters: CharacterSprites,
  view: ViewRect,
  viewport: Viewport,
): void {
  for (const entity of state.entities) {
    if (!entity.label) continue;
    const pos = tileToScreen(entity.col, entity.row);
    if (!rectsOverlap({ x: pos.x - 1, y: pos.y - 1, w: 2, h: 2 }, view)) continue;
    const hud = headHudPos(entity, characters, state.camera, viewport);
    drawNameTag(ctx, entity.label, Math.round(hud.x), Math.round(hud.y) - NAME_TAG_GAP);
  }
}
