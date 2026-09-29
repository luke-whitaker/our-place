// Which ground tiles draw from a sand sheet (terrain-tint.ts's `sandSheet`):
// sand itself, and grass beside it, so the grass's dirt edge reads as the
// beach it meets. Everything else keeps the ordinary ground sheet.

import type { TerrainKind } from "./world-model";
import type { TintPreset } from "./terrain-tint";
import { biomeAt } from "./biomes";

type Grid = TerrainKind[][];

function isSand(t: Grid, col: number, row: number): boolean {
  return t[row]?.[col] === "sand";
}

export function drawsAsSand(t: Grid, col: number, row: number): boolean {
  const kind = t[row][col];
  if (kind === "sand") return true;
  if (kind !== "grass") return false;
  return (
    isSand(t, col, row - 1) ||
    isSand(t, col + 1, row) ||
    isSand(t, col, row + 1) ||
    isSand(t, col - 1, row)
  );
}

/** Every biome a world needs a sand sheet for; empty for a world with no sand. */
export function sandBiomes(world: {
  cols: number;
  rows: number;
  terrain: Grid;
  tint?: TintPreset;
  biomes?: { presets: TintPreset[]; grid: number[][] };
}): TintPreset[] {
  const presets = new Set<TintPreset>();
  world.terrain.forEach((row, r) =>
    row.forEach((_, c) => {
      if (drawsAsSand(world.terrain, c, r)) presets.add(biomeAt(world, c, r));
    }),
  );
  return [...presets];
}
