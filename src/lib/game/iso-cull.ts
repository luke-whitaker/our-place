// Viewport culling for the iso renderer: which ground tiles, objects, and
// entities can possibly appear inside the camera's view. Culling only decides
// what work to skip — it must never change what ends up on screen, so every
// bound here is deliberately generous rather than exact (see the derivations
// below). Kept pure and canvas-free so the range math is unit-testable and so
// tests can measure how much work a given camera/world will visit without
// touching the render path.

import { HALF_W, HALF_H } from "./iso";

/** Ground tile sprite size (px, pre-zoom) — the CELL×CELL square drawGround
 * blits per tile, anchored per drawGround's own −16/−8 offset. Shared with the
 * culling math because that offset is exactly half of CELL on each axis. */
export const CELL = 32;

/** Fixed margin (px, pre-zoom) around an entity's ground anchor, treated as its
 * footprint for culling. Character frames are well under this on every side
 * (see character-sheet.ts), so it covers the sprite and its shadow without
 * needing per-frame dimensions at cull time. */
export const ENTITY_CULL_MARGIN = 64;

/** Sub-pixel safety margin for object/entity view checks. drawObject and
 * drawEntity round their screen position to the nearest pixel, and a half-scale
 * sprite's anchor can itself be a half-integer, so an unrounded rect sitting
 * exactly on the view edge could round a fraction of a pixel into view. Padding
 * by more than that possible rounding error (0.5px) keeps the check generous
 * instead of tight. */
const RECT_CULL_PAD = 1;

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi));
}

export interface GroundCullRange {
  /** Inclusive range of (col+row) diagonal sums that can intersect the view. */
  sumMin: number;
  sumMax: number;
  /** Inclusive range of (col−row) diagonal differences that can intersect the view. */
  diffMin: number;
  diffMax: number;
}

/**
 * Which diagonal bands of a cols×rows terrain grid can intersect a camera view.
 *
 * drawGround places tile (col,row)'s CELL×CELL square with its top-left at
 * (tileToScreen(col,row).x − 16 − camX, tileToScreen(col,row).y − 8 − camY).
 * tileToScreen's y depends only on (col+row) and its x only on (col−row) (2:1
 * projection), so the view's vertical extent bounds the sum band and its
 * horizontal extent bounds the diff band, independently of each other.
 *
 * Padded by a full CELL on every side rather than the exact ±16/±8 draw offset:
 * generous costs a few off-screen tiles, tight would flicker-clip a tile at the
 * view edge. Clamped to the diagonals that actually exist on the grid (sums run
 * 0..cols+rows-2; diffs run -(rows-1)..cols-1).
 */
export function groundCullRange(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  cols: number,
  rows: number,
): GroundCullRange {
  const maxSum = cols + rows - 2;
  return {
    sumMin: clamp(Math.floor((camY - CELL) / HALF_H), 0, maxSum),
    sumMax: clamp(Math.ceil((camY + viewH + CELL) / HALF_H), 0, maxSum),
    diffMin: clamp(Math.floor((camX - CELL) / HALF_W), -(rows - 1), cols - 1),
    diffMax: clamp(Math.ceil((camX + viewW + CELL) / HALF_W), -(rows - 1), cols - 1),
  };
}

/**
 * Row bounds (inclusive) for one diagonal sum: the grid's own valid range for
 * that sum (same as an unculled scan would use) intersected with the culled
 * diff range. Solved directly from diff = sum − 2·row rather than scanning the
 * diagonal, so the cost of finding the band is O(1), not O(cols+rows).
 */
function sumRowRange(
  sum: number,
  cols: number,
  rows: number,
  diffMin: number,
  diffMax: number,
): { rowLo: number; rowHi: number } {
  return {
    rowLo: Math.max(0, sum - cols + 1, Math.ceil((sum - diffMax) / 2)),
    rowHi: Math.min(sum, rows - 1, Math.floor((sum - diffMin) / 2)),
  };
}

/**
 * Every ground tile that can intersect the view, back-to-front (ascending
 * col+row, then ascending row — the same order drawGround always used, which
 * matters because later tiles paint over the dirt skirt of earlier ones). A
 * generator so drawGround and tests share one definition of "the visible
 * tiles" instead of drawGround having a real loop and tests reimplementing it.
 */
export function* visibleGroundTiles(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  cols: number,
  rows: number,
): Generator<{ col: number; row: number }> {
  const { sumMin, sumMax, diffMin, diffMax } = groundCullRange(
    camX,
    camY,
    viewW,
    viewH,
    cols,
    rows,
  );
  for (let sum = sumMin; sum <= sumMax; sum++) {
    const { rowLo, rowHi } = sumRowRange(sum, cols, rows, diffMin, diffMax);
    for (let row = rowLo; row <= rowHi; row++) {
      yield { col: sum - row, row };
    }
  }
}

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether two axis-aligned rectangles overlap (half-open on both axes). */
export function rectsOverlap(a: ViewRect, b: ViewRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** The camera view, padded by {@link RECT_CULL_PAD} for object/entity rect
 * checks (ground culling has its own, larger CELL padding baked into
 * {@link groundCullRange} instead). */
export function objectCullView(camX: number, camY: number, viewW: number, viewH: number): ViewRect {
  return {
    x: camX - RECT_CULL_PAD,
    y: camY - RECT_CULL_PAD,
    w: viewW + 2 * RECT_CULL_PAD,
    h: viewH + 2 * RECT_CULL_PAD,
  };
}

// ── Object index ──
// A big world holds thousands of objects, and testing every one against the
// view each frame costs more than drawing the ones that show. The index
// buckets objects by where their anchor lands on screen, in chunks along the
// two screen diagonals (col+row sets screen y, col−row sets screen x), so a
// frame only visits the chunks near the view. The caller still applies the
// exact rectangle test to each candidate, so the index only skips work.

/** Tiles per chunk along each diagonal. */
const INDEX_CHUNK = 8;

export interface ObjectIndex {
  /** Object indices per chunk, each list in ascending (world) order. */
  chunks: Map<string, number[]>;
  /** How many objects were indexed, so a changed list is noticed. */
  size: number;
}

const chunkKey = (sumChunk: number, diffChunk: number) => `${sumChunk},${diffChunk}`;

export function buildObjectIndex(
  objects: ReadonlyArray<{ col: number; row: number }>,
): ObjectIndex {
  const chunks = new Map<string, number[]>();
  objects.forEach((obj, i) => {
    const k = chunkKey(
      Math.floor((obj.col + obj.row) / INDEX_CHUNK),
      Math.floor((obj.col - obj.row) / INDEX_CHUNK),
    );
    const list = chunks.get(k);
    if (list) list.push(i);
    else chunks.set(k, [i]);
  });
  return { chunks, size: objects.length };
}

/**
 * Indices of every object whose anchor could put its sprite inside `view`,
 * in ascending order (the order render always drew them in, which keeps
 * depth-sort ties stable). `maxW` and `maxH` bound any sprite's drawn size:
 * an anchor further than that from the view can't reach into it.
 */
export function objectsNearView(
  index: ObjectIndex,
  view: ViewRect,
  maxW: number,
  maxH: number,
): number[] {
  // tileToScreen: x = (col − row)·HALF_W, y = (col + row)·HALF_H.
  const sumLo = Math.floor((view.y - maxH) / HALF_H / INDEX_CHUNK) - 1;
  const sumHi = Math.ceil((view.y + view.h + maxH) / HALF_H / INDEX_CHUNK) + 1;
  const diffLo = Math.floor((view.x - maxW) / HALF_W / INDEX_CHUNK) - 1;
  const diffHi = Math.ceil((view.x + view.w + maxW) / HALF_W / INDEX_CHUNK) + 1;
  const found: number[] = [];
  for (let s = sumLo; s <= sumHi; s++) {
    for (let d = diffLo; d <= diffHi; d++) {
      const list = index.chunks.get(chunkKey(s, d));
      if (list) for (const i of list) found.push(i);
    }
  }
  return found.sort((a, b) => a - b);
}
