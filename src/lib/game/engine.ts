import {
  TILE,
  CANVAS_W,
  CANVAS_H,
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
import type { GameState, GameMap, Tile, Camera, Door } from "./types";
import { SOLID_TILES } from "./types";
import type { InputManager } from "./input";

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

// ── Door detection ──

const INTERACT_DISTANCE = TILE * 1.5;

function findNearbyDoor(map: GameMap, px: number, py: number): Door | null {
  const playerCX = px + TILE / 2;
  const playerCY = py + TILE / 2;

  for (const door of map.doors) {
    const doorCX = door.col * TILE + TILE / 2;
    const doorCY = door.row * TILE + TILE / 2;
    const dx = playerCX - doorCX;
    const dy = playerCY - doorCY;
    if (Math.sqrt(dx * dx + dy * dy) < INTERACT_DISTANCE) {
      return door;
    }
  }
  return null;
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

  // ── Fade handling ──
  if (state.fadeDir !== 0) {
    state.fade = Math.max(0, Math.min(1, state.fade + state.fadeDir * FADE_SPEED));

    // At peak of fade-in: fire the door callback
    if (state.fade >= 1 && state.fadeDir === 1) {
      if (state.pendingDoor && onDoorInteract) {
        onDoorInteract(state.pendingDoor);
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

  if (state.mode !== "overworld") return;

  // ── Door proximity check ──
  state.nearbyDoor = findNearbyDoor(map, state.player.x, state.player.y);

  // ── Interaction (Enter / Space) ──
  if (state.nearbyDoor && (input.consume("Enter") || input.consume("Space"))) {
    state.mode = "fading";
    state.fadeDir = 1;
    state.pendingDoor = state.nearbyDoor;
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
}

function updateCamera(cam: Camera, px: number, py: number, map: GameMap): void {
  cam.x = Math.round(px + TILE / 2 - CANVAS_W / 2);
  cam.y = Math.round(py + TILE / 2 - CANVAS_H / 2);

  // Clamp to map edges
  cam.x = Math.max(0, Math.min(cam.x, map.cols * TILE - CANVAS_W));
  cam.y = Math.max(0, Math.min(cam.y, map.rows * TILE - CANVAS_H));
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

  // Clear
  ctx.fillStyle = PAL.darkest;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Tiles (frustum-culled) ──
  const startCol = Math.max(0, Math.floor(camera.x / TILE));
  const endCol = Math.min(map.cols - 1, Math.floor((camera.x + CANVAS_W) / TILE));
  const startRow = Math.max(0, Math.floor(camera.y / TILE));
  const endRow = Math.min(map.rows - 1, Math.floor((camera.y + CANVAS_H) / TILE));

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

  // ── Interaction prompt ──
  if (nearbyDoor && fade === 0) {
    ctx.fillStyle = PAL.textBg;
    ctx.globalAlpha = 0.85;
    const text = `Press Enter — ${nearbyDoor.label}`;
    const textW = text.length * 5.5 + 16;
    const boxX = Math.round(CANVAS_W / 2 - textW / 2);
    const boxY = CANVAS_H - 28;
    ctx.fillRect(boxX, boxY, textW, 20);
    ctx.globalAlpha = 1;

    // Border
    ctx.strokeStyle = PAL.textBorder;
    ctx.lineWidth = 1;
    ctx.strokeRect(boxX, boxY, textW, 20);

    // Text
    ctx.fillStyle = PAL.textColor;
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, CANVAS_W / 2, boxY + 10);
    ctx.textAlign = "start";
  }

  // ── Fade overlay ──
  if (fade > 0) {
    ctx.fillStyle = PAL.darkest;
    ctx.globalAlpha = fade;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }
}

// ── State factory ──

export function createInitialState(map: GameMap): GameState {
  const player = {
    x: map.spawnCol * TILE,
    y: map.spawnRow * TILE,
    dir: DIR.DOWN as Direction,
    frame: 0 as const,
    animTimer: 0,
    moving: false,
  };

  const camera = { x: 0, y: 0 };
  updateCamera(camera, player.x, player.y, map);

  return {
    mode: "overworld",
    currentMap: "test",
    player,
    camera,
    frameTick: 0,
    fade: 0,
    fadeDir: 0,
    nearbyDoor: null,
    pendingDoor: null,
  };
}
