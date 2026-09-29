// The Frostline: snow across the whole northern edge, fading into forest along
// an uneven line, with a shrine in its north-east corner.

import type { MushroomWarp, Region } from "../../types";
import { SNOW_LINE, WORLD_COLS } from "./layout";
import {
  forEachTile,
  placeRequired,
  reserveDisc,
  setBiome,
  wobble,
  type WildMap,
} from "./map-builder";

export const SNOW_SHRINE: MushroomWarp = {
  id: "frost-shrine",
  col: 278,
  row: 16,
  label: "Frost Shrine",
  nodeId: "capital",
  connections: "all",
  reachableOnFoot: true,
};

export const SNOW_REGION: Region = {
  id: "frostline",
  label: "The Frostline",
  bounds: { col: 0, row: 0, w: WORLD_COLS, h: SNOW_LINE - 4 },
};

/** The row where snow ends at a column: a slow sway plus a few tiles of noise. */
export function snowLineAt(col: number): number {
  return Math.round(SNOW_LINE + 4 * Math.sin(col / 23) + wobble(col, 4, 17));
}

export function buildSnow(map: WildMap): void {
  forEachTile(map, (c, r) => {
    if (r < snowLineAt(c)) setBiome(map, c, r, "snow");
  });
  placeRequired(map, "mushroom", SNOW_SHRINE.col, SNOW_SHRINE.row);
  reserveDisc(map, SNOW_SHRINE.col, SNOW_SHRINE.row + 1, 3);
}
