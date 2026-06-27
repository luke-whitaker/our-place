"use client";

// ── Isometric vertical slice (dev harness) ──
//
// A throwaway page (/iso-lab) for proving the iso migration before touching the
// live world. As of Phase 1 it runs on the real engine seams: an IsoWorld
// document (worlds/lab-town.ts), a baked solid grid for collision, and the
// computeIntent → applyMovement movement split — so the player now collides with
// the cottage, trees, and rocks instead of walking through them. Positions live
// in world-space tile coords; the iso projection happens only here at render.

import { useEffect, useRef, useState } from "react";
import { CANVAS_W, CANVAS_H, TICK_RATE, MAX_ACCUMULATOR } from "@/lib/game/constants";
import { createInputManager } from "@/lib/game/input";
import { tileToScreen } from "@/lib/game/iso";
import { loadCharacterSheet, pickFrame, type CharacterSprites } from "@/lib/game/character-sheet";
import { groundCell, type Terrain } from "@/lib/game/forest-autotile";
import {
  loadObjectSprite,
  objectDepth,
  drawObject,
  type ObjectSprite,
  type PlacedObject,
} from "@/lib/game/world-object";
import { OBJECT_CATALOG, type IsoWorld } from "@/lib/game/world-model";
import { buildSolidGrid, type SolidGrid } from "@/lib/game/iso-collision";
import { computeIntent, applyMovement, createEntity, type IsoEntity } from "@/lib/game/iso-actor";
import { LAB_TOWN } from "@/lib/game/worlds/lab-town";

const ZOOM = 2;
const VIEW_W = CANVAS_W / ZOOM;
const VIEW_H = CANVAS_H / ZOOM;

const CELL = 32;
const ANIM_TICKS = 7;
const FOOT_OFFSET = 4;

/** The autotiler reads a grass/dirt boolean grid; everything non-grass renders as
 * bare ground for now (water gets its own autotiler in a later pass). */
function grassGrid(world: IsoWorld): Terrain {
  return world.terrain.map((row) => row.map((kind) => kind === "grass"));
}

export default function IsoLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef(createInputManager());
  const spritesRef = useRef<CharacterSprites | null>(null);
  const forestRef = useRef<HTMLImageElement | null>(null);
  const placedRef = useRef<PlacedObject[]>([]);
  const terrainRef = useRef<Terrain>(grassGrid(LAB_TOWN));
  const solidRef = useRef<SolidGrid>(buildSolidGrid(LAB_TOWN));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const playerRef = useRef<IsoEntity>(
    createEntity("local", LAB_TOWN.spawn.col, LAB_TOWN.spawn.row),
  );

  useEffect(() => {
    let cancelled = false;
    // Load one sprite per unique kind the world places, then resolve placements.
    const kinds = [...new Set(LAB_TOWN.objects.map((o) => o.kind))];
    Promise.all([
      loadCharacterSheet("/world/characters/long.png"),
      loadImage("/world/tiles/forest.png"),
      ...kinds.map((k) => loadObjectSprite(OBJECT_CATALOG[k].src)),
    ])
      .then(([sprites, forest, ...objs]) => {
        if (cancelled) return;
        spritesRef.current = sprites as CharacterSprites;
        forestRef.current = forest as HTMLImageElement;
        const byKind = Object.fromEntries(
          kinds.map((k, i) => [k, objs[i] as ObjectSprite]),
        ) as Record<string, ObjectSprite>;
        placedRef.current = LAB_TOWN.objects.map((o) => ({
          sprite: byKind[o.kind],
          col: o.col,
          row: o.row,
        }));
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
        applyMovement(solidRef.current, playerRef.current, computeIntent(input));
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
            ? "WASD / Arrows — you now collide with the cottage, trees, and rocks"
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

// ── Render ──

function render(
  ctx: CanvasRenderingContext2D,
  player: IsoEntity,
  terrain: Terrain,
  placed: PlacedObject[],
  sprites: CharacterSprites | null,
  forest: HTMLImageElement | null,
): void {
  ctx.fillStyle = "#23232b";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  const pos = tileToScreen(player.col, player.row);
  const camX = Math.round(pos.x - VIEW_W / 2);
  const camY = Math.round(pos.y - VIEW_H / 2);

  // Ground: back-to-front by (col+row) so each surface covers the skirt behind it.
  if (forest) {
    const rows = terrain.length;
    const cols = terrain[0].length;
    for (let sum = 0; sum <= cols + rows - 2; sum++) {
      for (let row = Math.max(0, sum - cols + 1); row <= Math.min(sum, rows - 1); row++) {
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
    drawables.push({ depth: pos.y, draw: () => drawPlayer(ctx, player, pos, sprites, camX, camY) });
  }
  drawables.sort((a, b) => a.depth - b.depth).forEach((d) => d.draw());

  ctx.restore();
}

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  player: IsoEntity,
  pos: { x: number; y: number },
  sprites: CharacterSprites,
  camX: number,
  camY: number,
): void {
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(pos.x - camX, pos.y - camY, 7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  const frame = pickFrame(sprites, player.dir, player.moving, player.animTimer, ANIM_TICKS);
  const x = Math.round(pos.x - frame.width / 2 - camX);
  const y = Math.round(pos.y - frame.height + FOOT_OFFSET - camY);
  ctx.drawImage(frame, x, y);
}
