// Biomes by region: one world can hold snow, swamp, autumn, and forest side by
// side. A world with a `biomes` map names the preset of every tile; a world
// without one keeps its single `tint` everywhere (islands, interiors, the lab).
//
// The ground draws each tile with its own biome's sheets, and each object takes
// the biome of its anchor tile, so a tree on the snow line is snowy all over
// rather than split down the middle. world-assets.ts bakes only the (sheet or
// kind) x preset pairs a world actually uses.

import type { TintPreset } from "./terrain-tint";

/** The biome of every tile, as an index into `presets` (`grid[row][col]`). An
 * index grid keeps the document compact and JSON-friendly at 80k+ tiles. */
export interface BiomeMap {
  presets: TintPreset[];
  grid: number[][];
}

interface BiomeWorld {
  cols: number;
  rows: number;
  tint?: TintPreset;
  biomes?: BiomeMap;
}

/** The preset a world falls back to wherever it has no biome map. */
export function baseBiome(world: Pick<BiomeWorld, "tint">): TintPreset {
  return world.tint ?? "forest";
}

/** The biome of the tile under (col, row). Out of bounds, or a world without a
 * map, answers the world's own tint, so callers never need a special case. */
export function biomeAt(world: BiomeWorld, col: number, row: number): TintPreset {
  const map = world.biomes;
  if (!map) return baseBiome(world);
  const c = Math.floor(col);
  const r = Math.floor(row);
  if (r < 0 || r >= world.rows || c < 0 || c >= world.cols) return baseBiome(world);
  return map.presets[map.grid[r][c]] ?? baseBiome(world);
}

/** Every preset a world's ground uses other than its base, deduplicated. */
export function extraGroundBiomes(world: BiomeWorld): TintPreset[] {
  if (!world.biomes) return [];
  const used = new Set<number>();
  for (const row of world.biomes.grid) for (const index of row) used.add(index);
  const base = baseBiome(world);
  return [...used]
    .map((i) => world.biomes!.presets[i])
    .filter((preset): preset is TintPreset => preset !== undefined && preset !== base);
}

/** Every (kind, preset) pair the world's objects need beyond the base preset,
 * so the loader bakes a tinted sprite for exactly those and nothing else. */
export function extraObjectBiomes(
  world: BiomeWorld & { objects: ReadonlyArray<{ kind: string; col: number; row: number }> },
): Map<TintPreset, Set<string>> {
  const pairs = new Map<TintPreset, Set<string>>();
  if (!world.biomes) return pairs;
  const base = baseBiome(world);
  for (const obj of world.objects) {
    const preset = biomeAt(world, obj.col, obj.row);
    if (preset === base) continue;
    const kinds = pairs.get(preset) ?? new Set<string>();
    kinds.add(obj.kind);
    pairs.set(preset, kinds);
  }
  return pairs;
}
