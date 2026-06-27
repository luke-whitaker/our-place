// Isometric projection for the 2:1 diamond world.
//
// The world is authored in continuous *tile* coordinates (col = the down-right
// axis, row = the down-left axis). The renderer projects those to screen pixels;
// gameplay (movement, collision, depth) stays in this projection-agnostic space.
// Everything here is pure math — no canvas — so it carries straight into the real
// engine and is unit-tested.

// Ground-diamond footprint. The Evergrow tiles are authored in 32×32 cells: the
// diamond top surface is 32×16 (2:1) and the lower 16px is the dirt skirt. (The
// earlier "64×32" assumption was 2× off — confirmed by autocorrelation of the
// tile sheet, 32px period, and the pack's pixel-named folders.) Tile sprites are
// drawn 32×32, anchored so the surface diamond lands on this footprint.
export const TILE_W = 32;
export const TILE_H = 16;
export const HALF_W = TILE_W / 2; // 16
export const HALF_H = TILE_H / 2; // 8

export interface ScreenPos {
  x: number;
  y: number;
}
export interface TilePos {
  col: number;
  row: number;
}

/** Tile (col,row) → the screen pixel at that tile's CENTER (before camera). */
export function tileToScreen(col: number, row: number): ScreenPos {
  return { x: (col - row) * HALF_W, y: (col + row) * HALF_H };
}

/** Inverse of {@link tileToScreen}: screen pixel → fractional tile coords. */
export function screenToTile(x: number, y: number): TilePos {
  return {
    col: (x / HALF_W + y / HALF_H) / 2,
    row: (y / HALF_H - x / HALF_W) / 2,
  };
}

/**
 * Painter's-order depth key for a base-anchored sprite standing at (col,row):
 * its anchor's screen-Y. Sort drawables ascending — smaller is farther back and
 * drawn first, so nearer sprites overlap farther ones.
 */
export function depthAt(col: number, row: number): number {
  return (col + row) * HALF_H;
}
