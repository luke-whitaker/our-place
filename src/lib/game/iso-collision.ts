// World-space collision for the iso world. The solid grid is derived once from a
// world's terrain (which surfaces block) plus every solid object's footprint, so
// movement queries are a flat array lookup. Everything here is pure tile math —
// no canvas, no projection — which means the server can run the exact same code
// to stay authoritative over where players are.

import { OBJECT_CATALOG, SOLID_TERRAIN } from "./world-model";
import type { IsoWorld } from "./world-model";

/** A blocked-tile lookup, indexed `[row][col]`; true = the player can't enter. */
export type SolidGrid = boolean[][];

/** Bake a world into a solid grid: solid terrain ∪ every solid object footprint. */
export function buildSolidGrid(world: IsoWorld): SolidGrid {
  const grid: SolidGrid = world.terrain.map((row) => row.map((kind) => SOLID_TERRAIN.has(kind)));

  for (const obj of world.objects) {
    const def = OBJECT_CATALOG[obj.kind];
    if (!def || !def.solid) continue;
    for (const { dc, dr } of def.footprint) {
      const c = obj.col + dc;
      const r = obj.row + dr;
      if (r >= 0 && r < world.rows && c >= 0 && c < world.cols) {
        grid[r][c] = true;
      }
    }
  }

  return grid;
}

/** Is the tile under continuous coords (col,row) solid? Out of bounds blocks. */
export function isSolidAt(grid: SolidGrid, col: number, row: number): boolean {
  const c = Math.floor(col);
  const r = Math.floor(row);
  if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return true;
  return grid[r][c];
}

/**
 * Resolve a tile-space move with per-axis sliding: try the column delta, then the
 * row delta from the (possibly updated) column, keeping each axis only if it lands
 * out of solid tiles. This lets the player slide along a wall instead of sticking.
 * Pure: returns the new position, mutating nothing.
 */
export function resolveMove(
  grid: SolidGrid,
  col: number,
  row: number,
  dcol: number,
  drow: number,
): { col: number; row: number } {
  let nextCol = col;
  let nextRow = row;
  if (dcol !== 0 && !isSolidAt(grid, col + dcol, row)) nextCol = col + dcol;
  if (drow !== 0 && !isSolidAt(grid, nextCol, row + drow)) nextRow = row + drow;
  return { col: nextCol, row: nextRow };
}
