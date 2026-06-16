import {
  TILE,
  CANVAS_W,
  CANVAS_H,
  ZOOM,
  VIEW_W,
  VIEW_H,
  PLAYER_SPEED,
  PLAYER_W,
  PLAYER_H,
  PLAYER_OFFSET_X,
  PLAYER_OFFSET_Y,
  ANIM_FRAME_TICKS,
  FADE_SPEED,
  DIR,
  PAL,
} from "./constants";
import type { Direction } from "./constants";
import type { GameState, GameMap, Tile, Camera, Door, MushroomWarp } from "./types";
import { SOLID_TILES } from "./types";
import type { InputManager } from "./input";

/** How long banners (region entries, discoveries, warp arrivals) stay up */
const TOAST_TICKS = 180; // ~3s at 60tps

// ── Collision ──

function isSolid(map: GameMap, pixelX: number, pixelY: number): boolean {
  const col = Math.floor(pixelX / TILE);
  const row = Math.floor(pixelY / TILE);
  if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) return true;
  return SOLID_TILES.has(map.tiles[row][col]);
}

function collidesAt(map: GameMap, x: number, y: number): boolean {
  const left = x + PLAYER_OFFSET_X;
  const right = x + PLAYER_OFFSET_X + PLAYER_W - 1;
  const top = y + PLAYER_OFFSET_Y;
  const bottom = y + PLAYER_OFFSET_Y + PLAYER_H - 1;

  return (
    isSolid(map, left, top) ||
    isSolid(map, right, top) ||
    isSolid(map, left, bottom) ||
    isSolid(map, right, bottom)
  );
}

// ── Door & shrine detection ──

const INTERACT_DISTANCE = TILE * 1.5;

function isNearTile(px: number, py: number, col: number, row: number): boolean {
  const dx = px + TILE / 2 - (col * TILE + TILE / 2);
  const dy = py + TILE / 2 - (row * TILE + TILE / 2);
  return Math.sqrt(dx * dx + dy * dy) < INTERACT_DISTANCE;
}

function findNearbyDoor(map: GameMap, px: number, py: number): Door | null {
  for (const door of map.doors) {
    if (isNearTile(px, py, door.col, door.row)) return door;
  }
  return null;
}

function findNearbyMushroom(map: GameMap, px: number, py: number): MushroomWarp | null {
  if (!map.mushrooms) return null;
  for (const shrine of map.mushrooms) {
    if (isNearTile(px, py, shrine.col, shrine.row)) return shrine;
  }
  return null;
}

// ── Regions (entry toasts) ──

function findRegionId(map: GameMap, px: number, py: number): string | null {
  if (!map.regions) return null;
  const col = Math.floor((px + TILE / 2) / TILE);
  const row = Math.floor((py + TILE / 2) / TILE);
  for (const region of map.regions) {
    const b = region.bounds;
    if (col >= b.col && col < b.col + b.w && row >= b.row && row < b.row + b.h) {
      return region.id;
    }
  }
  return null;
}

// ── Warp menu ──

/** Discovered shrines the player can warp to from the menu (excludes the one they're at) */
export function warpMenuOptions(state: GameState, map: GameMap): MushroomWarp[] {
  if (!map.mushrooms) return [];
  return map.mushrooms.filter(
    (m) => state.discovered.has(m.id) && m.id !== state.nearbyMushroom?.id,
  );
}

// ── Update ──

/** Optional callback fired when a door interaction completes (at peak of fade) */
export type OnDoorInteract = (door: Door) => void;

export function update(
  state: GameState,
  map: GameMap,
  input: InputManager,
  onDoorInteract?: OnDoorInteract,
): void {
  state.frameTick++;

  // ── Toast countdown ──
  if (state.toast) {
    state.toast.ticksLeft--;
    if (state.toast.ticksLeft <= 0) state.toast = null;
  }

  // ── Fade handling ──
  if (state.fadeDir !== 0) {
    state.fade = Math.max(0, Math.min(1, state.fade + state.fadeDir * FADE_SPEED));

    // At peak of fade-in: fire the door callback or land the warp
    if (state.fade >= 1 && state.fadeDir === 1) {
      if (state.pendingDoor && onDoorInteract) {
        onDoorInteract(state.pendingDoor);
      }
      if (state.pendingWarp) {
        const warp = state.pendingWarp;
        // Shrine tiles are solid — land the player just below
        state.player.x = warp.col * TILE;
        state.player.y = (warp.row + 1) * TILE;
        updateCamera(state.camera, state.player.x, state.player.y, map);
        // Arrival banner replaces the region-entry toast
        state.currentRegionId = findRegionId(map, state.player.x, state.player.y);
        state.toast = { text: warp.label, ticksLeft: TOAST_TICKS };
        state.pendingWarp = null;
      }
      // Start fading back out
      state.fadeDir = -1;
      state.pendingDoor = null;
    }

    // Fade complete
    if (state.fade <= 0 && state.fadeDir === -1) {
      state.fadeDir = 0;
      state.fade = 0;
      state.mode = "overworld";
    }
    return; // Don't process input during fade
  }

  // ── Warp menu ──
  if (state.mode === "warp-menu") {
    const options = warpMenuOptions(state, map);
    const total = options.length + 1; // + Cancel entry

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

  // ── Door proximity check ──
  state.nearbyDoor = findNearbyDoor(map, state.player.x, state.player.y);

  // ── Shrine proximity: walking up to a shrine discovers it ──
  state.nearbyMushroom = findNearbyMushroom(map, state.player.x, state.player.y);
  if (state.nearbyMushroom && !state.discovered.has(state.nearbyMushroom.id)) {
    state.discovered.add(state.nearbyMushroom.id);
    state.toast = { text: `${state.nearbyMushroom.label} discovered!`, ticksLeft: TOAST_TICKS };
  }

  // ── Interaction (Enter / Space): doors take priority over shrines ──
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

  // ── Player movement ──
  const player = state.player;
  let dx = 0;
  let dy = 0;

  if (input.isDown("ArrowUp") || input.isDown("KeyW")) {
    dy = -PLAYER_SPEED;
    player.dir = DIR.UP;
  }
  if (input.isDown("ArrowDown") || input.isDown("KeyS")) {
    dy = PLAYER_SPEED;
    player.dir = DIR.DOWN;
  }
  if (input.isDown("ArrowLeft") || input.isDown("KeyA")) {
    dx = -PLAYER_SPEED;
    player.dir = DIR.LEFT;
  }
  if (input.isDown("ArrowRight") || input.isDown("KeyD")) {
    dx = PLAYER_SPEED;
    player.dir = DIR.RIGHT;
  }

  // Normalize diagonal movement
  if (dx !== 0 && dy !== 0) {
    const factor = PLAYER_SPEED / Math.sqrt(dx * dx + dy * dy);
    dx *= factor;
    dy *= factor;
  }

  // Per-axis collision
  if (dx !== 0) {
    const newX = player.x + dx;
    if (!collidesAt(map, newX, player.y)) {
      player.x = newX;
    }
  }
  if (dy !== 0) {
    const newY = player.y + dy;
    if (!collidesAt(map, player.x, newY)) {
      player.y = newY;
    }
  }

  // Clamp to map bounds
  player.x = Math.max(0, Math.min(player.x, map.cols * TILE - TILE));
  player.y = Math.max(0, Math.min(player.y, map.rows * TILE - TILE));

  // Animation
  player.moving = dx !== 0 || dy !== 0;
  if (player.moving) {
    player.animTimer++;
    if (player.animTimer >= ANIM_FRAME_TICKS) {
      player.animTimer = 0;
      player.frame = player.frame === 0 ? 1 : 0;
    }
  } else {
    player.frame = 0;
    player.animTimer = 0;
  }

  // ── Camera ──
  updateCamera(state.camera, player.x, player.y, map);

  // ── Region entry toasts ──
  const regionId = findRegionId(map, player.x, player.y);
  if (regionId !== state.currentRegionId) {
    state.currentRegionId = regionId;
    if (regionId && map.regions) {
      const region = map.regions.find((r) => r.id === regionId);
      if (region) state.toast = { text: region.label, ticksLeft: TOAST_TICKS };
    }
  }
}

function updateCamera(cam: Camera, px: number, py: number, map: GameMap): void {
  // Center on the player within the zoomed viewport (VIEW_* = world span on screen)
  cam.x = Math.round(px + TILE / 2 - VIEW_W / 2);
  cam.y = Math.round(py + TILE / 2 - VIEW_H / 2);

  // Clamp to map edges
  cam.x = Math.max(0, Math.min(cam.x, map.cols * TILE - VIEW_W));
  cam.y = Math.max(0, Math.min(cam.y, map.rows * TILE - VIEW_H));
}

// ── Render ──

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  map: GameMap,
  tileset: Map<Tile, HTMLCanvasElement>,
  playerSprites: Record<Direction, [HTMLCanvasElement, HTMLCanvasElement]>,
): void {
  const { camera, player, frameTick, fade, nearbyDoor } = state;

  // Clear (native resolution)
  ctx.fillStyle = PAL.darkest;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // The world layer (tiles + player) is drawn scaled by ZOOM; the HUD below it is
  // drawn at native resolution so text and menus stay crisp.
  ctx.save();
  ctx.scale(ZOOM, ZOOM);

  // ── Tiles (frustum-culled to the visible world span) ──
  const startCol = Math.max(0, Math.floor(camera.x / TILE));
  const endCol = Math.min(map.cols - 1, Math.floor((camera.x + VIEW_W) / TILE));
  const startRow = Math.max(0, Math.floor(camera.y / TILE));
  const endRow = Math.min(map.rows - 1, Math.floor((camera.y + VIEW_H) / TILE));

  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      let tileId = map.tiles[r][c];

      // Water animation: swap frames every 30 ticks
      if (tileId === 3 && Math.floor(frameTick / 30) % 2 === 1) {
        tileId = 4 as Tile;
      } else if (tileId === 4 && Math.floor(frameTick / 30) % 2 === 1) {
        tileId = 3 as Tile;
      }

      const img = tileset.get(tileId);
      if (img) {
        ctx.drawImage(img, c * TILE - camera.x, r * TILE - camera.y);
      }
    }
  }

  // ── Player ──
  const spriteSet = playerSprites[player.dir];
  if (spriteSet) {
    ctx.drawImage(
      spriteSet[player.frame],
      Math.round(player.x - camera.x),
      Math.round(player.y - camera.y),
    );
  }

  // End of the zoomed world layer — everything below draws at native resolution.
  ctx.restore();

  // ── Interaction prompt (doors take priority over shrines) ──
  if (fade === 0 && state.mode === "overworld") {
    if (nearbyDoor) {
      drawPrompt(ctx, `Press Enter — ${nearbyDoor.label}`);
    } else if (state.nearbyMushroom) {
      drawPrompt(ctx, `Press Enter — ${state.nearbyMushroom.label}`);
    }
  }

  // ── Warp menu ──
  if (state.mode === "warp-menu") {
    drawWarpMenu(ctx, state, map);
  }

  // ── Toast banner ──
  if (state.toast) {
    drawToast(ctx, state.toast);
  }

  // ── Fade overlay ──
  if (fade > 0) {
    ctx.fillStyle = PAL.darkest;
    ctx.globalAlpha = fade;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }
}

function drawPrompt(ctx: CanvasRenderingContext2D, text: string): void {
  const textW = text.length * 5.5 + 16;
  const boxX = Math.round(CANVAS_W / 2 - textW / 2);
  const boxY = CANVAS_H - 28;

  ctx.fillStyle = PAL.textBg;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(boxX, boxY, textW, 20);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textW, 20);

  ctx.fillStyle = PAL.textColor;
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, CANVAS_W / 2, boxY + 10);
  ctx.textAlign = "start";
}

function drawToast(
  ctx: CanvasRenderingContext2D,
  toast: { text: string; ticksLeft: number },
): void {
  // Fade out over the final half second
  const alpha = Math.min(1, toast.ticksLeft / 30);
  const textW = toast.text.length * 7 + 28;
  const boxX = Math.round(CANVAS_W / 2 - textW / 2);
  const boxY = 16;

  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = PAL.textBg;
  ctx.fillRect(boxX, boxY, textW, 26);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textW, 26);

  ctx.fillStyle = PAL.textColor;
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(toast.text, CANVAS_W / 2, boxY + 13);
  ctx.textAlign = "start";
  ctx.globalAlpha = 1;
}

function drawWarpMenu(ctx: CanvasRenderingContext2D, state: GameState, map: GameMap): void {
  const options = warpMenuOptions(state, map);
  const entries = [...options.map((o) => o.label), "Cancel"];

  const rowH = 22;
  const titleH = 30;
  const padding = 12;
  const longest = Math.max("Mycelium Network".length, ...entries.map((e) => e.length));
  const boxW = longest * 7 + padding * 2 + 20;
  const boxH = titleH + entries.length * rowH + padding;
  const boxX = Math.round(CANVAS_W / 2 - boxW / 2);
  const boxY = Math.round(CANVAS_H / 2 - boxH / 2);

  // Dim the world behind the menu
  ctx.fillStyle = PAL.darkest;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = PAL.textBg;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = PAL.lightest;
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Mycelium Network", CANVAS_W / 2, boxY + titleH / 2 + 2);

  ctx.font = "11px monospace";
  ctx.textAlign = "start";
  entries.forEach((label, i) => {
    const y = boxY + titleH + i * rowH + rowH / 2;
    const selected = i === state.warpMenuIndex;
    if (selected) {
      ctx.fillStyle = PAL.textBorder;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(boxX + 6, y - rowH / 2 + 2, boxW - 12, rowH - 4);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = selected ? PAL.white : PAL.light;
    ctx.fillText(`${selected ? "▶ " : "  "}${label}`, boxX + padding, y);
  });
  ctx.textBaseline = "alphabetic";
}

// ── State factory ──

export interface InitialStateOptions {
  /** Pixel spawn position overriding the map's default spawn tile */
  spawnX?: number;
  spawnY?: number;
  /** Shrine IDs already discovered (from a saved game) */
  discovered?: Iterable<string>;
}

export function createInitialState(map: GameMap, options: InitialStateOptions = {}): GameState {
  const player = {
    x: options.spawnX ?? map.spawnCol * TILE,
    y: options.spawnY ?? map.spawnRow * TILE,
    dir: DIR.DOWN as Direction,
    frame: 0 as const,
    animTimer: 0,
    moving: false,
  };

  const camera = { x: 0, y: 0 };
  updateCamera(camera, player.x, player.y, map);

  return {
    mode: "overworld",
    currentMap: "world",
    player,
    camera,
    frameTick: 0,
    fade: 0,
    fadeDir: 0,
    nearbyDoor: null,
    pendingDoor: null,
    nearbyMushroom: null,
    pendingWarp: null,
    discovered: new Set(options.discovered ?? []),
    warpMenuIndex: 0,
    currentRegionId: null,
    toast: null,
  };
}
