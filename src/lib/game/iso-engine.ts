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
import { drawPrompt, drawToast, drawWarpMenu, drawNameTag } from "./hud";
import {
  CELL,
  ENTITY_CULL_MARGIN,
  visibleGroundTiles,
  rectsOverlap,
  objectCullView,
  type ViewRect,
} from "./iso-cull";
import { CANVAS_W, CANVAS_H, FADE_SPEED, PAL } from "./constants";
import type { GameMode, Door, MushroomWarp, Pc, WorldLink } from "./types";
import type { IsoWorld } from "./world-model";
import type { InputManager } from "./input";

// ── Tuning ──

export const ISO_ZOOM = 2;
export const ISO_VIEW_W = CANVAS_W / ISO_ZOOM;
export const ISO_VIEW_H = CANVAS_H / ISO_ZOOM;

const ANIM_TICKS = 7; // ticks per walk frame
const WATER_ANIM_TICKS = 12; // ticks per water ripple frame
const FOOT_OFFSET = 4; // nudge the sprite's feet onto the tile centre
const SHADOW_RX = 7;
const SHADOW_RY = 3;

const TOAST_TICKS = 180; // ~3s at 60tps
const INTERACT_TILES = 1.5; // door/shrine reach, in tiles

// Camera padding (pre-zoom px). Sides/bottom get a half-tile of breathing room;
// the top gets more so tall sprites (houses, trees) at the north edge aren't
// clipped. Tunable with the real town's camera feel in Phase 4.
const CAM_EDGE_PAD = HALF_W;
const CAM_TOP_PAD = 112;

// ── State ──

export interface IsoState {
  mode: GameMode;
  /** Every actor in the world. The local player is entities[find(localId)];
   * remote players (later) join the same list and update/render treat them all
   * the same. */
  entities: IsoEntity[];
  localId: string;
  /** Camera top-left in world-screen pixels (pre-zoom). */
  camera: { x: number; y: number };
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

/** Drive an open modal list. Returns the chosen row, "cancel" when the player
 * backs out or picks the Cancel row, or null while the menu is still open.
 * Shared by both menus so their key handling can never drift apart. */
function stepMenu(
  state: IsoState,
  input: InputManager,
  entries: MenuEntry[],
): MenuEntry | "cancel" | null {
  const total = entries.length + 1; // + Cancel
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
 * entity, then clamped so the view stays within the world's padded bounds. Pure,
 * so it's unit-tested directly. */
export function cameraFor(world: IsoWorld, col: number, row: number): { x: number; y: number } {
  const pos = tileToScreen(col, row);
  const b = worldScreenBounds(world);
  return {
    x: Math.round(
      clampCamera(
        pos.x - ISO_VIEW_W / 2,
        b.left - CAM_EDGE_PAD,
        b.right + CAM_EDGE_PAD - ISO_VIEW_W,
      ),
    ),
    y: Math.round(
      clampCamera(
        pos.y - ISO_VIEW_H / 2,
        b.top - CAM_TOP_PAD,
        b.bottom + CAM_EDGE_PAD - ISO_VIEW_H,
      ),
    ),
  };
}

function updateCamera(state: IsoState, world: IsoWorld): void {
  const player = getLocalEntity(state);
  state.camera = cameraFor(world, player.col, player.row);
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

  const player = getLocalEntity(state);

  // ── Door / shrine proximity ──
  state.nearbyDoor = findNearbyDoor(world, player.col, player.row);
  state.nearbyPc = findNearbyPc(world, player.col, player.row);
  state.nearbyMushroom = findNearbyMushroom(world, player.col, player.row);
  if (state.nearbyMushroom && !state.discovered.has(state.nearbyMushroom.id)) {
    state.discovered.add(state.nearbyMushroom.id);
    state.toast = { text: `${state.nearbyMushroom.label} discovered!`, ticksLeft: TOAST_TICKS };
  }

  // Re-arm as soon as the player is clear of every door.
  if (!state.nearbyDoor) state.doorArmed = true;

  const intent = computeIntent(input);

  // ── Interaction (doors take priority over shrines) ──
  // A door opens two ways: walk up into it, or press Enter. Enter is not gated
  // on arming, because pressing it is already deliberate; it also keeps doors
  // usable from the touch controls, where there is no "walk into" gesture.
  if (state.nearbyDoor && state.doorArmed && headingIntoDoor(intent)) {
    enterDoor(state, state.nearbyDoor);
    return;
  }
  if (state.nearbyDoor && (input.consume("Enter") || input.consume("Space"))) {
    enterDoor(state, state.nearbyDoor);
    return;
  }
  if (state.nearbyPc && (input.consume("Enter") || input.consume("Space"))) {
    state.mode = "pc-menu";
    state.menuIndex = 0;
    return;
  }
  if (state.nearbyMushroom && (input.consume("Enter") || input.consume("Space"))) {
    state.mode = "warp-menu";
    state.menuIndex = 0;
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
): void {
  ctx.fillStyle = PAL.darkest;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // World layer (scaled by ZOOM); the HUD below draws at native resolution.
  ctx.save();
  ctx.scale(ISO_ZOOM, ISO_ZOOM);
  const { x: camX, y: camY } = state.camera;

  drawGround(ctx, world, grass, assets, state.frameTick, camX, camY);

  // Objects + entities, painter's order by ground-anchor screen-Y. Each is
  // skipped when its drawn rectangle can't possibly overlap the view — this
  // only prunes work from the loop below; it never changes what gets drawn,
  // since the skip test uses the exact same rectangle drawObject/drawEntity
  // would paint.
  const view = objectCullView(camX, camY, ISO_VIEW_W, ISO_VIEW_H);
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

  // ── HUD (native resolution) ──
  drawNameTags(ctx, state, assets.characters, view);
  if (state.fade === 0 && state.mode === "overworld") {
    if (state.nearbyDoor) {
      drawPrompt(ctx, `Press Enter — ${state.nearbyDoor.label}`);
    } else if (state.nearbyPc) {
      drawPrompt(ctx, `Press Enter — ${state.nearbyPc.label}`);
    } else if (state.nearbyMushroom) {
      drawPrompt(ctx, `Press Enter — ${state.nearbyMushroom.label}`);
    }
  }

  if (state.mode === "warp-menu") {
    const entries = [...warpMenuEntries(state, world).map((e) => e.label), "Cancel"];
    drawWarpMenu(ctx, "Mycelium Network", entries, state.menuIndex);
  }

  if (state.mode === "pc-menu" && state.nearbyPc) {
    const entries = [...pcMenuEntries(state.nearbyPc, world).map((e) => e.label), "Cancel"];
    drawWarpMenu(ctx, state.nearbyPc.label, entries, state.menuIndex);
  }

  if (state.toast) {
    drawToast(ctx, state.toast);
  }

  if (state.fade > 0) {
    ctx.fillStyle = PAL.darkest;
    ctx.globalAlpha = state.fade;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
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
): void {
  const { cols, rows, terrain } = world;
  const waterFrame = Math.floor(frameTick / WATER_ANIM_TICKS) % WATER_FRAMES;
  // Back-to-front by (col+row) so each surface covers the dirt skirt behind it.
  // visibleGroundTiles restricts this to the diagonal bands the camera can
  // actually see (see iso-cull.ts) instead of the whole grid — it yields tiles
  // in the same order the old unculled double loop did, so output is unchanged.
  for (const { col, row } of visibleGroundTiles(camX, camY, ISO_VIEW_W, ISO_VIEW_H, cols, rows)) {
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

/** Gap between a sprite's head and its name tag, in native pixels. */
const NAME_TAG_GAP = 4;

/** Name tags for every labelled entity in view, drawn at native resolution
 * (after the zoomed world layer) so the text stays crisp. Sprites are one
 * height per sheet, so the idle frame's height places the tag for any pose. */
function drawNameTags(
  ctx: CanvasRenderingContext2D,
  state: IsoState,
  characters: CharacterSprites,
  view: ViewRect,
): void {
  const { x: camX, y: camY } = state.camera;
  for (const entity of state.entities) {
    if (!entity.label) continue;
    const pos = tileToScreen(entity.col, entity.row);
    if (!rectsOverlap({ x: pos.x - 1, y: pos.y - 1, w: 2, h: 2 }, view)) continue;
    const head =
      pos.y - pickFrame(characters, entity.dir, false, 0, ANIM_TICKS).height + FOOT_OFFSET;
    drawNameTag(
      ctx,
      entity.label,
      Math.round((pos.x - camX) * ISO_ZOOM),
      Math.round((head - camY) * ISO_ZOOM) - NAME_TAG_GAP,
    );
  }
}
