// The isometric overworld engine: createIsoState / update / render over an
// IsoWorld. It mirrors engine.ts's shape — the same door/shrine/region/warp/fade
// state machine and the same HUD chrome — but in iso projection, over an entity
// collection, and against the serializable world model. Logic stays pure (no
// canvas in update); render is the only canvas-aware half. This is what
// WorldCanvas will run in Phase 3, replacing the top-down engine.

import { tileToScreen } from "./iso";
import { groundCell, type Terrain } from "./forest-autotile";
import { drawObject, type ObjectSprite } from "./world-object";
import { pickFrame, type CharacterSprites } from "./character-sheet";
import { computeIntent, applyMovement, createEntity, type IsoEntity } from "./iso-actor";
import { buildSolidGrid, type SolidGrid } from "./iso-collision";
import { drawPrompt, drawToast, drawWarpMenu } from "./hud";
import { CANVAS_W, CANVAS_H, FADE_SPEED, PAL } from "./constants";
import type { GameMode, Door, MushroomWarp } from "./types";
import type { IsoWorld } from "./world-model";
import type { InputManager } from "./input";

// ── Tuning ──

export const ISO_ZOOM = 2;
export const ISO_VIEW_W = CANVAS_W / ISO_ZOOM;
export const ISO_VIEW_H = CANVAS_H / ISO_ZOOM;

const CELL = 32; // ground tile sprite is 32×32
const ANIM_TICKS = 7; // ticks per walk frame
const FOOT_OFFSET = 4; // nudge the sprite's feet onto the tile centre
const SHADOW_RX = 7;
const SHADOW_RY = 3;

const TOAST_TICKS = 180; // ~3s at 60tps
const INTERACT_TILES = 1.5; // door/shrine reach, in tiles

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
  nearbyMushroom: MushroomWarp | null;
  pendingWarp: MushroomWarp | null;
  discovered: Set<string>;
  warpMenuIndex: number;
  currentRegionId: string | null;
  toast: { text: string; ticksLeft: number } | null;
}

export interface IsoStateOptions {
  /** Spawn tile overriding the world's default spawn. */
  spawnCol?: number;
  spawnRow?: number;
  /** Shrines already discovered (from a saved game). */
  discovered?: Iterable<string>;
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
  );

  const state: IsoState = {
    mode: "overworld",
    entities: [player],
    localId: "local",
    camera: { x: 0, y: 0 },
    frameTick: 0,
    fade: 0,
    fadeDir: 0,
    nearbyDoor: null,
    pendingDoor: null,
    nearbyMushroom: null,
    pendingWarp: null,
    discovered: new Set(options.discovered ?? []),
    warpMenuIndex: 0,
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

function updateCamera(state: IsoState, world: IsoWorld): void {
  // Center on the local entity. Bounds-clamping waits for Phase 3, where the real
  // town's size and camera feel get tuned together.
  void world;
  const pos = tileToScreen(getLocalEntity(state).col, getLocalEntity(state).row);
  state.camera.x = Math.round(pos.x - ISO_VIEW_W / 2);
  state.camera.y = Math.round(pos.y - ISO_VIEW_H / 2);
}

// ── Update ──

/** Fired at the peak of a door fade — the caller ports to that place's forum view. */
export type OnDoorInteract = (door: Door) => void;

export function update(
  state: IsoState,
  world: IsoWorld,
  solid: SolidGrid,
  input: InputManager,
  onDoorInteract?: OnDoorInteract,
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
      if (state.pendingDoor && onDoorInteract) {
        onDoorInteract(state.pendingDoor);
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

  // ── Warp menu ──
  if (state.mode === "warp-menu") {
    const options = warpMenuOptions(state, world);
    const total = options.length + 1; // + Cancel

    if (input.consume("Escape")) {
      state.mode = "overworld";
      return;
    }
    if (input.consume("ArrowUp") || input.consume("KeyW")) {
      state.warpMenuIndex = (state.warpMenuIndex - 1 + total) % total;
    }
    if (input.consume("ArrowDown") || input.consume("KeyS")) {
      state.warpMenuIndex = (state.warpMenuIndex + 1) % total;
    }
    if (input.consume("Enter") || input.consume("Space")) {
      if (state.warpMenuIndex < options.length) {
        state.pendingWarp = options[state.warpMenuIndex];
        state.mode = "fading";
        state.fadeDir = 1;
      } else {
        state.mode = "overworld";
      }
    }
    return;
  }

  if (state.mode !== "overworld") return;

  const player = getLocalEntity(state);

  // ── Door / shrine proximity ──
  state.nearbyDoor = findNearbyDoor(world, player.col, player.row);
  state.nearbyMushroom = findNearbyMushroom(world, player.col, player.row);
  if (state.nearbyMushroom && !state.discovered.has(state.nearbyMushroom.id)) {
    state.discovered.add(state.nearbyMushroom.id);
    state.toast = { text: `${state.nearbyMushroom.label} discovered!`, ticksLeft: TOAST_TICKS };
  }

  // ── Interaction (doors take priority over shrines) ──
  if (state.nearbyDoor && (input.consume("Enter") || input.consume("Space"))) {
    state.mode = "fading";
    state.fadeDir = 1;
    state.pendingDoor = state.nearbyDoor;
    return;
  }
  if (state.nearbyMushroom && (input.consume("Enter") || input.consume("Space"))) {
    state.mode = "warp-menu";
    state.warpMenuIndex = 0;
    return;
  }

  // ── Movement (local entity only; remote actors come from the network later) ──
  applyMovement(solid, player, computeIntent(input));
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
  /** Object sprites keyed by catalog kind. */
  objects: Record<string, ObjectSprite>;
  /** Character frames (shared for now; per-entity once players have identity). */
  characters: CharacterSprites;
}

/** Project a world's terrain to the grass/dirt grid the autotiler reads. */
export function terrainToGrass(world: IsoWorld): Terrain {
  return world.terrain.map((row) => row.map((kind) => kind === "grass"));
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

  drawGround(ctx, grass, assets.forest, camX, camY);

  // Objects + entities, painter's order by ground-anchor screen-Y.
  type Drawable = { depth: number; draw: () => void };
  const drawables: Drawable[] = [];
  for (const obj of world.objects) {
    const sprite = assets.objects[obj.kind];
    if (!sprite) continue;
    drawables.push({
      depth: tileToScreen(obj.col, obj.row).y,
      draw: () => drawObject(ctx, { sprite, col: obj.col, row: obj.row }, camX, camY),
    });
  }
  for (const entity of state.entities) {
    drawables.push({
      depth: tileToScreen(entity.col, entity.row).y,
      draw: () => drawEntity(ctx, entity, assets.characters, camX, camY),
    });
  }
  drawables.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

  ctx.restore();

  // ── HUD (native resolution) ──
  if (state.fade === 0 && state.mode === "overworld") {
    if (state.nearbyDoor) {
      drawPrompt(ctx, `Press Enter — ${state.nearbyDoor.label}`);
    } else if (state.nearbyMushroom) {
      drawPrompt(ctx, `Press Enter — ${state.nearbyMushroom.label}`);
    }
  }

  if (state.mode === "warp-menu") {
    const entries = [...warpMenuOptions(state, world).map((o) => o.label), "Cancel"];
    drawWarpMenu(ctx, "Mycelium Network", entries, state.warpMenuIndex);
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
  grass: Terrain,
  forest: HTMLImageElement,
  camX: number,
  camY: number,
): void {
  const rows = grass.length;
  const cols = grass[0].length;
  // Back-to-front by (col+row) so each surface covers the dirt skirt behind it.
  for (let sum = 0; sum <= cols + rows - 2; sum++) {
    for (let row = Math.max(0, sum - cols + 1); row <= Math.min(sum, rows - 1); row++) {
      const col = sum - row;
      const [sc, sr] = groundCell(grass, col, row);
      const s = tileToScreen(col, row);
      ctx.drawImage(
        forest,
        sc * CELL,
        sr * CELL,
        CELL,
        CELL,
        Math.round(s.x - 16 - camX),
        Math.round(s.y - 8 - camY),
        CELL,
        CELL,
      );
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
