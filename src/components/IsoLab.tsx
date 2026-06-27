"use client";

// ── Isometric vertical slice (dev harness) ──
//
// A throwaway page (/iso-lab) for proving the iso migration before touching the
// live world. Renders the real Evergrow autotiled ground (forest-autotile.ts)
// plus real free-standing objects — trees, bushes, rocks, a cottage — that
// depth-sort against the BossNelNel character (world-object.ts). Walk behind and
// in front of the trees and the house to see the painter's-order sort. Authoring
// a real town and wiring into the live engine come next.

import { useEffect, useRef, useState } from "react";
import { CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { tileToScreen, screenToTile } from "@/lib/game/iso";
import {
  loadCharacterSheet,
  pickFrame,
  vectorToDir8,
  type CharacterSprites,
  type Dir8,
} from "@/lib/game/character-sheet";
import { groundCell, type Terrain } from "@/lib/game/forest-autotile";
import {
  loadObjectSprite,
  objectDepth,
  drawObject,
  type ObjectSprite,
  type PlacedObject,
} from "@/lib/game/world-object";

const ZOOM = 2;
const VIEW_W = CANVAS_W / ZOOM;
const VIEW_H = CANVAS_H / ZOOM;

const COLS = 24;
const ROWS = 24;
const CELL = 32;
const SPEED = 1.8;
const ANIM_TICKS = 7;
const FOOT_OFFSET = 4;

const OBJECT_SRC: Record<string, string> = {
  house: "/world/objects/house.png",
  oak_big: "/world/objects/oak_big.png",
  oak1: "/world/objects/oak1.png",
  oak2: "/world/objects/oak2.png",
  pine1: "/world/objects/pine1.png",
  pine2: "/world/objects/pine2.png",
  bush_large: "/world/objects/bush_large.png",
  bush: "/world/objects/bush.png",
  rock: "/world/objects/rock.png",
  mushroom: "/world/objects/mushroom.png",
};

// Scene layout (kind + tile). Spawn is the centre tile (12,12).
const SCENE: ReadonlyArray<{ kind: string; col: number; row: number }> = [
  { kind: "house", col: 9, row: 7 },
  { kind: "oak_big", col: 4, row: 5 },
  { kind: "oak1", col: 6, row: 14 },
  { kind: "pine1", col: 9, row: 16 },
  { kind: "oak2", col: 16, row: 9 },
  { kind: "pine2", col: 18, row: 13 },
  { kind: "oak1", col: 14, row: 18 },
  { kind: "pine1", col: 20, row: 17 },
  { kind: "oak2", col: 5, row: 18 },
  { kind: "bush_large", col: 16, row: 14 },
  { kind: "bush", col: 10, row: 15 },
  { kind: "rock", col: 15, row: 11 },
  { kind: "mushroom", col: 9, row: 13 },
];

function buildTerrain(): Terrain {
  const t: Terrain = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => true));
  for (let r = 6; r <= 9; r++) for (let c = 7; c <= 11; c++) t[r][c] = false; // dirt clearing
  return t;
}

interface PlayerState {
  px: number;
  py: number;
  dir: Dir8;
  moving: boolean;
  animTimer: number;
}

export default function IsoLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(createInputManager());
  const spritesRef = useRef<CharacterSprites | null>(null);
  const forestRef = useRef<HTMLImageElement | null>(null);
  const placedRef = useRef<PlacedObject[]>([]);
  const terrainRef = useRef<Terrain>(buildTerrain());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const spawn = tileToScreen(12, 12);
  const playerRef = useRef<PlayerState>({
    px: spawn.x,
    py: spawn.y,
    dir: "S",
    moving: false,
    animTimer: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const kinds = Object.keys(OBJECT_SRC);
    Promise.all([
      loadCharacterSheet("/world/characters/long.png"),
      loadImage("/world/tiles/forest.png"),
      ...kinds.map((k) => loadObjectSprite(OBJECT_SRC[k])),
    ])
      .then(([sprites, forest, ...objs]) => {
        if (cancelled) return;
        spritesRef.current = sprites as CharacterSprites;
        forestRef.current = forest as HTMLImageElement;
        const byKind = Object.fromEntries(
          kinds.map((k, i) => [k, objs[i] as ObjectSprite]),
        ) as Record<string, ObjectSprite>;
        placedRef.current = SCENE.map((p) => ({ sprite: byKind[p.kind], col: p.col, row: p.row }));
        setReady(true);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setError("Couldn't load art.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const input = inputRef.current;
    const cleanupInput = input.attach();

    let lastTime = performance.now();
    let accumulator = 0;
    let rafId = 0;
    function loop(now: number) {
      const elapsed = now - lastTime;
      lastTime = now;
      accumulator = Math.min(accumulator + elapsed, MAX_ACCUMULATOR);
      while (accumulator >= TICK_RATE) {
        update(playerRef.current, input);
        accumulator -= TICK_RATE;
      }
      ctx.imageSmoothingEnabled = false;
      render(
        ctx,
        playerRef.current,
        terrainRef.current,
        placedRef.current,
        spritesRef.current,
        forestRef.current,
      );
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      cleanupInput();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className="block rounded-lg border-2 border-line-inverse"
        style={{ width: 768, height: 512, imageRendering: "pixelated" }}
      />
      <p className="font-mono text-xs text-ink-faint">
        {error
          ? error
          : ready
            ? "WASD / Arrows — walk behind and in front of the trees and house"
            : "Loading art…"}
      </p>
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

// ── Update ──

function update(player: PlayerState, input: ReturnType<typeof createInputManager>): void {
  let dx = 0;
  let dy = 0;
  if (input.isDown("ArrowUp") || input.isDown("KeyW")) dy -= 1;
  if (input.isDown("ArrowDown") || input.isDown("KeyS")) dy += 1;
  if (input.isDown("ArrowLeft") || input.isDown("KeyA")) dx -= 1;
  if (input.isDown("ArrowRight") || input.isDown("KeyD")) dx += 1;

  player.moving = dx !== 0 || dy !== 0;
  if (player.moving) {
    const len = Math.hypot(dx, dy);
    const tryX = player.px + (dx / len) * SPEED;
    const tryY = player.py + (dy / len) * SPEED;
    const t = screenToTile(tryX, tryY);
    if (t.col >= 0 && t.col <= COLS - 1 && t.row >= 0 && t.row <= ROWS - 1) {
      player.px = tryX;
      player.py = tryY;
    }
    player.dir = vectorToDir8(dx, dy) ?? player.dir;
    player.animTimer++;
  } else {
    player.animTimer = 0;
  }
}

// ── Render ──

function render(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  terrain: Terrain,
  placed: PlacedObject[],
  sprites: CharacterSprites | null,
  forest: HTMLImageElement | null,
): void {
  ctx.fillStyle = "#23232b";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  const camX = Math.round(player.px - VIEW_W / 2);
  const camY = Math.round(player.py - VIEW_H / 2);

  // Ground: back-to-front by (col+row) so each surface covers the skirt behind it.
  if (forest) {
    for (let sum = 0; sum <= COLS + ROWS - 2; sum++) {
      for (let row = Math.max(0, sum - COLS + 1); row <= Math.min(sum, ROWS - 1); row++) {
        const col = sum - row;
        const [sc, sr] = groundCell(terrain, col, row);
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

  // Objects + player, painter's order by ground-anchor screen-Y.
  type Drawable = { depth: number; draw: () => void };
  const drawables: Drawable[] = placed.map((o) => ({
    depth: objectDepth(o),
    draw: () => drawObject(ctx, o, camX, camY),
  }));
  if (sprites) {
    drawables.push({ depth: player.py, draw: () => drawPlayer(ctx, player, sprites, camX, camY) });
  }
  drawables.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  sprites: CharacterSprites,
  camX: number,
  camY: number,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(player.px - camX, player.py - camY, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const frame = pickFrame(sprites, player.dir, player.moving, player.animTimer, ANIM_TICKS);
  const x = Math.round(player.px - frame.width / 2 - camX);
  const y = Math.round(player.py - frame.height + FOOT_OFFSET - camY);
  ctx.drawImage(frame, x, y);
}
