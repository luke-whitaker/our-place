// The wall of dense trees around the swamp and the lake. Every tile in a band
// just outside the ellipse's rim gets a tree, except where an opening's trail
// runs through, so the wall is solid ground-truth rather than a visual hint.
// The band is about 3 tiles thick, which closes every diagonal gap as well.

import { OPENING_INNER, OPENING_OUTER } from "./layout";
import {
  carveTrail,
  ellipseDist,
  forEachTile,
  hash32,
  place,
  pointOnEllipse,
  type Ellipse,
  type WildMap,
} from "./map-builder";

const WALL_TILES = 3;
const WALL_TREES = ["pine_tall1", "oak_tall1", "pine1", "oak2", "pine_tall2", "oak_big", "oak1"];

export function plantWall(map: WildMap, e: Ellipse, seed: number): void {
  const band = WALL_TILES / Math.min(e.rx, e.ry);
  forEachTile(map, (c, r) => {
    const d = ellipseDist(e, c, r);
    if (d < 1 || d >= 1 + band) return;
    if (map.terrain[r][c] !== "grass") return;
    place(map, WALL_TREES[hash32(c, r, seed) % WALL_TREES.length], c, r);
  });
}

/** Cut each opening: a trail from just outside the wall to just inside it,
 * which clears the wall's trees along the way. */
export function cutOpenings(map: WildMap, e: Ellipse, angles: readonly number[]): void {
  for (const angle of angles) {
    carveTrail(
      map,
      [pointOnEllipse(e, angle, OPENING_OUTER), pointOnEllipse(e, angle, OPENING_INNER)],
      4,
    );
  }
}
