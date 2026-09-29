// Stillwater Lake, to the east: open water ringed by a walkable shore, inside a
// wall of dense trees with two ways in on its west side, facing the Capital.

import type { Region } from "../../types";
import { LAKE, LAKE_OPENINGS, LAKE_WATER } from "./layout";
import { ellipseDist, forEachTile, noise2, setTerrain, type WildMap } from "./map-builder";
import { cutOpenings, plantWall } from "./walled";

export const LAKE_REGION: Region = {
  id: "stillwater-lake",
  label: "Stillwater Lake",
  bounds: {
    col: LAKE.col - LAKE.rx - 3,
    row: LAKE.row - LAKE.ry - 3,
    w: LAKE.rx * 2 + 7,
    h: LAKE.ry * 2 + 7,
  },
};

export function buildLake(map: WildMap): void {
  forEachTile(map, (c, r) => {
    // A wandering waterline, so the shore is wider in some places than others.
    const edge = LAKE_WATER + (noise2(c, r, 7, 43) - 0.5) * 0.1;
    if (ellipseDist(LAKE, c, r) < edge) setTerrain(map, c, r, "water");
  });
  plantWall(map, LAKE, 11);
  cutOpenings(map, LAKE, LAKE_OPENINGS);
}
