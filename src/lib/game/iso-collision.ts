// World-space collision for the iso world. The solid grid is derived once from a
// world's terrain (which surfaces block) plus every solid object's footprint, so
// movement queries are a flat array lookup. Everything here is pure tile math —
// no canvas, no projection — which means the server can run the exact same code
// to stay authoritative over where players are.

import { OBJECT_CATALOG, SOLID_TERRAIN, fixtureFootprint } from "./world-model";
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

  // An NPC blocks its own tile like any other standing body, so the player
  // walks up beside one rather than through it.
  for (const npc of world.npcs ?? []) {
    if (npc.row >= 0 && npc.row < world.rows && npc.col >= 0 && npc.col < world.cols) {
      grid[npc.row][npc.col] = true;
    }
  }

  // A fixture is furniture, not open ground: block every tile it covers, so
  // the player walks up beside the mailbox or the desk rather than through it.
  // Seeds and flowers are the exception: you walk over them, so a garden can
  // never block a path.
  for (const fixture of world.fixtures ?? []) {
    if (fixture.kind === "plant") continue;
    for (const { dc, dr } of fixtureFootprint(fixture)) {
      const c = fixture.col + dc;
      const r = fixture.row + dr;
      if (r >= 0 && r < world.rows && c >= 0 && c < world.cols) grid[r][c] = true;
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
  // Something solid can appear under a player who is standing still (another
  // member plants an Event Mushroom on their tile). Moving within that tile
  // stays allowed, so they can always walk off it instead of being stuck.
  const open = (c: number, r: number) =>
    !isSolidAt(grid, c, r) || (sameTile(c, r, col, row) && isSolidAt(grid, col, row));
  let nextCol = col;
  let nextRow = row;
  if (dcol !== 0 && open(col + dcol, row)) nextCol = col + dcol;
  if (drow !== 0 && open(nextCol, row + drow)) nextRow = row + drow;
  return { col: nextCol, row: nextRow };
}

function sameTile(c1: number, r1: number, c2: number, r2: number): boolean {
  return Math.floor(c1) === Math.floor(c2) && Math.floor(r1) === Math.floor(r2);
}
