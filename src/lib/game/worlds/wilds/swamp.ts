// Mirewood: the swamp to the west. Murky ground inside a wall of dense trees,
// two ponds, dead-looking growth, and its own shrine, open on the north, west,
// and south-east.

import type { MushroomWarp, Region } from "../../types";
import { SWAMP, SWAMP_OPENINGS } from "./layout";
import {
  ellipseDist,
  forEachTile,
  noise2,
  placeRequired,
  reserveDisc,
  setBiome,
  setTerrain,
  type WildMap,
} from "./map-builder";
import { cutOpenings, plantWall } from "./walled";

export const SWAMP_SHRINE: MushroomWarp = {
  id: "mire-shrine",
  col: 44,
  row: 112,
  label: "Mire Shrine",
  nodeId: "capital",
  connections: "all",
  reachableOnFoot: true,
};

const PONDS = [
  { col: 64, row: 132, radius: 5 },
  { col: 38, row: 128, radius: 3 },
] as const;

export const SWAMP_REGION: Region = {
  id: "mirewood",
  label: "Mirewood",
  bounds: {
    col: SWAMP.col - SWAMP.rx - 3,
    row: SWAMP.row - SWAMP.ry - 3,
    w: SWAMP.rx * 2 + 7,
    h: SWAMP.ry * 2 + 7,
  },
};

export function buildSwamp(map: WildMap): void {
  forEachTile(map, (c, r) => {
    // The swamp's murk spills a few tiles past its wall, unevenly.
    if (ellipseDist(SWAMP, c, r) < 1.15 + (noise2(c, r, 6, 31) - 0.5) * 0.2) {
      setBiome(map, c, r, "swamp");
    }
  });
  for (const pond of PONDS) {
    forEachTile(map, (c, r) => {
      if (Math.abs(c - pond.col) + Math.abs(r - pond.row) <= pond.radius) {
        setTerrain(map, c, r, "water");
      }
    });
  }
  plantWall(map, SWAMP, 7);
  cutOpenings(map, SWAMP, SWAMP_OPENINGS);
  placeRequired(map, "mushroom", SWAMP_SHRINE.col, SWAMP_SHRINE.row);
  reserveDisc(map, SWAMP_SHRINE.col, SWAMP_SHRINE.row + 1, 3);
}
