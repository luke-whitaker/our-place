// The worlds that have a map, with just what the discoveries route checks
// against: the size (for the bitmap's length) and the real shrine ids. Kept
// apart from the world documents so the route never loads the whole Capital;
// mapped-worlds.test.ts proves it matches CAPITAL.

import { chunkGrid, type ChunkGrid } from "./map-chunks";

export interface MappedWorld {
  cols: number;
  rows: number;
  shrines: readonly string[];
}

/** Only the grown Capital for now: islands and rooms fit on one screen. */
export const MAPPED_WORLDS: Readonly<Record<string, MappedWorld>> = {
  capital: {
    cols: 312,
    rows: 264,
    shrines: [
      "capital-gate",
      "willow-grove",
      "millers-shrine",
      "pond-shrine",
      "frost-shrine",
      "mire-shrine",
      "tide-shrine",
    ],
  },
};

export function mappedWorld(worldId: string): (MappedWorld & { grid: ChunkGrid }) | null {
  const world = Object.hasOwn(MAPPED_WORLDS, worldId) ? MAPPED_WORLDS[worldId] : undefined;
  return world ? { ...world, grid: chunkGrid(world.cols, world.rows) } : null;
}
