// The south: autumn woods in the south-west corner running down to a sand
// beach, and the uncharted sea along the whole coast. Just offshore, straight
// south of the Capital, sits a small island with a shrine nobody can reach
// yet. It's decoration (a mushroom object, not a warp), and the water around it
// is what keeps it out of reach until boats arrive.

import type { MushroomWarp, Region } from "../../types";
import { COAST_ROW, ISLAND, ISLAND_COAST_ROW, WORLD_COLS, WORLD_ROWS } from "./layout";
import {
  forEachTile,
  noise2,
  placeRequired,
  reserveDisc,
  setBiome,
  setTerrain,
  wobble,
  type WildMap,
} from "./map-builder";

const BEACH_ROWS = 3;
const ISLAND_GRASS = 2.3;
const ISLAND_SAND = 3.6;
/** The island's decorative shrine: scenery, never a warp. */
export const ISLAND_SHRINE = { col: ISLAND.col, row: ISLAND.row - 2 } as const;

/** The first row of open water at a column. Near the island the coast never
 * dips south of ISLAND_COAST_ROW, so the gap to the island stays wide. */
export function coastRowAt(col: number): number {
  const row = Math.round(COAST_ROW + 2 * Math.sin(col / 17) + wobble(col, 2, 23));
  return Math.abs(col - ISLAND.col) <= 24 ? Math.min(row, ISLAND_COAST_ROW) : row;
}

/** The shrine on the beach just south-east of the lake. */
export const COAST_SHRINE: MushroomWarp = {
  id: "tide-shrine",
  col: 296,
  row: coastRowAt(296) - 2,
  label: "Tide Shrine",
  nodeId: "capital",
  connections: "all",
  reachableOnFoot: true,
};

/** Listed before the other southern regions so the whole coast shows it. */
export const COAST_REGION: Region = {
  id: "uncharted-sea",
  label: "Uncharted waters. No way across... yet.",
  bounds: { col: 0, row: COAST_ROW - 6, w: WORLD_COLS, h: WORLD_ROWS - (COAST_ROW - 6) },
};

export const AUTUMN_REGION: Region = {
  id: "emberwood",
  label: "Emberwood",
  bounds: { col: 0, row: 170, w: 118, h: COAST_ROW - 6 - 170 },
};

/** Autumn fills the south-west corner, its edge wandering in both directions. */
function isAutumn(c: number, r: number): boolean {
  return c < 116 + wobble(r, 6, 51) && r > 168 + wobble(c, 6, 53);
}

export function buildCoast(map: WildMap): void {
  forEachTile(map, (c, r) => {
    if (isAutumn(c, r)) setBiome(map, c, r, "autumn");
    const coast = coastRowAt(c);
    if (r >= coast) setTerrain(map, c, r, "water");
    else if (r >= coast - BEACH_ROWS) setTerrain(map, c, r, "sand");
  });
  buildIsland(map);
  placeRequired(map, "mushroom", COAST_SHRINE.col, COAST_SHRINE.row);
  reserveDisc(map, COAST_SHRINE.col, COAST_SHRINE.row, 3);
}

function buildIsland(map: WildMap): void {
  forEachTile(map, (c, r) => {
    const d = Math.hypot(c - ISLAND.col, (r - ISLAND.row) * 1.1) + (noise2(c, r, 3, 61) - 0.5);
    if (d < ISLAND_GRASS) setTerrain(map, c, r, "grass");
    else if (d < ISLAND_SAND) setTerrain(map, c, r, "sand");
  });
  // A shrine on the island, for looking at: it's not in the network. It stands
  // on the north side, facing the beach, so it rises into view sooner. The
  // rest of the island stays clear, so no forest tree grows out there.
  placeRequired(map, "mushroom", ISLAND_SHRINE.col, ISLAND_SHRINE.row);
  reserveDisc(map, ISLAND.col, ISLAND.row, Math.ceil(ISLAND_SAND) + 1);
  placeRequired(map, "bush", ISLAND.col - 1, ISLAND.row + 1);
  placeRequired(map, "rock1", ISLAND.col + 1, ISLAND.row);
}
