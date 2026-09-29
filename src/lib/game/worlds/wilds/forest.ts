// The woods that fill everything between the regions. Density follows smooth
// noise, so trees gather into groves with open glades between them rather than
// an even speckle, and each region keeps its own character: pines in the snow,
// dead growth in the swamp, an open shore at the lake.

import { LAKE, SWAMP } from "./layout";
import {
  ellipseDist,
  forEachTile,
  hash32,
  noise2,
  place,
  rand01,
  type WildMap,
} from "./map-builder";

// Small trees for the open woods; the tall ones, whose canopies cover several
// tiles on screen, only at the heart of a grove.
const WOODS = ["oak1", "oak2", "pine1", "pine2", "bush", "oak1", "pine1"];
const GROVE_HEART = ["oak_big", "oak_tall1", "oak_tall2", "pine_tall1"];
const SNOW_TREES = ["pine1", "pine2", "pine1", "rock1"];
const SNOW_HEART = ["pine_tall1", "pine_tall2"];
const HEART = 0.3;
const SWAMP_GROWTH = ["bush", "bush_large", "stump1", "stump2", "oak1", "rock2", "log2"];
const SHORE = ["rock1", "rock2", "bush", "grass_patch2", "boulder"];

interface Growth {
  density: number;
  pool: readonly string[];
}

function growthAt(map: WildMap, c: number, r: number): Growth {
  if (ellipseDist(LAKE, c, r) < 1) return { density: 0.04, pool: SHORE };
  if (ellipseDist(SWAMP, c, r) < 1) return { density: 0.1, pool: SWAMP_GROWTH };
  // Cubed, so most ground is open glade and trees gather in a few groves.
  const grove = noise2(c, r, 13, 71) ** 3;
  const heart = grove > HEART;
  if (map.presets[map.biome[r][c]] === "snow") {
    return { density: 0.03 + 0.2 * grove, pool: heart ? SNOW_HEART : SNOW_TREES };
  }
  return { density: 0.02 + 0.32 * grove, pool: heart ? GROVE_HEART : WOODS };
}

/** Plant over every open grass tile outside `skip` (the old Capital, which
 * keeps its own authored woods) that nothing has reserved. */
export function plantForest(map: WildMap, skip: (c: number, r: number) => boolean): void {
  forEachTile(map, (c, r) => {
    if (skip(c, r) || map.terrain[r][c] !== "grass") return;
    if (map.reserved.has(`${c},${r}`)) return;
    const growth = growthAt(map, c, r);
    if (rand01(c, r, 5) >= growth.density) return;
    place(map, growth.pool[hash32(c, r, 6) % growth.pool.length], c, r);
  });
}
