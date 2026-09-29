// The Capital world members walk: the old Capital (capital.ts) set in the
// middle of a map three times its size in each direction, with the regions
// from Luke's hand-drawn map around it (see wilds/layout.ts). The world id
// stays "capital", so presence, doors, shrines, links, and deep links keep
// working, and every town coordinate moves by exactly CORE_OFFSET.
//
// Build order matters: regions stamp their ground and walls first, the old
// Capital is pasted over its rectangle, trails cut through to every region,
// and the forest fills whatever is left.

import type { IsoWorld } from "../world-model";
import { OBJECT_CATALOG } from "../world-model";
import type { MushroomWarp, Region } from "../types";
import { CAPITAL_CORE } from "./capital";
import {
  CORE_COLS,
  CORE_OFFSET,
  CORE_ROWS,
  LAKE,
  LAKE_OPENINGS,
  OPENING_OUTER,
  SWAMP,
  SWAMP_OPENINGS,
  WORLD_COLS,
  WORLD_ROWS,
} from "./wilds/layout";
import { carveTrail, createWildMap, pointOnEllipse, type WildMap } from "./wilds/map-builder";
import { SNOW_REGION, SNOW_SHRINE, buildSnow } from "./wilds/snow";
import { SWAMP_REGION, SWAMP_SHRINE, buildSwamp } from "./wilds/swamp";
import { LAKE_REGION, buildLake } from "./wilds/lake";
import { AUTUMN_REGION, COAST_REGION, COAST_SHRINE, buildCoast, coastRowAt } from "./wilds/coast";
import { plantForest } from "./wilds/forest";

const shift = <T extends { col: number; row: number }>(p: T): T => ({
  ...p,
  col: p.col + CORE_OFFSET.col,
  row: p.row + CORE_OFFSET.row,
});

function inCore(c: number, r: number): boolean {
  return (
    c >= CORE_OFFSET.col &&
    c < CORE_OFFSET.col + CORE_COLS &&
    r >= CORE_OFFSET.row &&
    r < CORE_OFFSET.row + CORE_ROWS
  );
}

/** Copy the old Capital's ground and objects into place. */
function pasteCore(map: WildMap): void {
  CAPITAL_CORE.terrain.forEach((row, r) =>
    row.forEach((kind, c) => {
      map.terrain[r + CORE_OFFSET.row][c + CORE_OFFSET.col] = kind;
    }),
  );
  for (const obj of CAPITAL_CORE.objects) {
    const moved = shift(obj);
    map.objects.push(moved);
    for (const f of OBJECT_CATALOG[obj.kind].footprint) {
      map.occupied.add(`${moved.col + f.dc},${moved.row + f.dr}`);
    }
  }
}

const TRAIL_WIDTH = 5;
const TRAIL_CLEARANCE = 9;

const swampGate = (i: number) => pointOnEllipse(SWAMP, SWAMP_OPENINGS[i], OPENING_OUTER);
const lakeGate = (i: number) => pointOnEllipse(LAKE, LAKE_OPENINGS[i], OPENING_OUTER);

/**
 * Trails out of the old Capital to every region, as waypoints in world tiles.
 * Each starts on a town street or trail, crosses the old outer woods (the
 * trail clears the trees it runs through), and ends at a region's opening, a
 * shrine, or the beach.
 */
function trails(): ReadonlyArray<ReadonlyArray<readonly [number, number]>> {
  const coast = coastRowAt(158) - 1;
  return [
    // North to the snow and its shrine, with a branch west to the swamp.
    [
      [148, 113],
      [148, 24],
      [SNOW_SHRINE.col, 24],
      [SNOW_SHRINE.col, SNOW_SHRINE.row + 2],
    ],
    [[148, 60], [swampGate(1)[0], 60], swampGate(1)],
    [[swampGate(0)[0], 60], swampGate(0)],
    // West along the old trail, then south to the swamp's south-east opening.
    [[114, 120], [92, 120], [92, swampGate(2)[1]], swampGate(2)],
    // South along the Old Road to the beach.
    [
      [158, 164],
      [158, coast],
    ],
    // East along the old trail to both lake openings.
    [[199, 125], [210, 125], [210, lakeGate(0)[1]], lakeGate(0)],
    [[210, 125], [210, lakeGate(1)[1]], lakeGate(1)],
  ];
}

function buildWorldMap(): WildMap {
  const map = createWildMap(WORLD_COLS, WORLD_ROWS, ["forest", "snow", "swamp", "autumn"]);
  pasteCore(map);
  buildSnow(map);
  buildCoast(map);
  buildSwamp(map);
  buildLake(map);
  // Five tiles of dirt with trees cleared a little wider: the old Capital's
  // outer woods are tall, and a trail through them otherwise disappears
  // under the canopies on either side.
  for (const trail of trails()) carveTrail(map, trail, TRAIL_WIDTH, TRAIL_CLEARANCE);
  plantForest(map, inCore);
  return map;
}

const map = buildWorldMap();

export const NEW_SHRINES: readonly MushroomWarp[] = [SNOW_SHRINE, SWAMP_SHRINE, COAST_SHRINE];

/** Region order is lookup order (first match wins): the old Capital's small
 * named places first, then the coast, so the beach toast shows even in the
 * autumn corner. */
const regions: Region[] = [
  ...CAPITAL_CORE.regions.map((region) => ({ ...region, bounds: shift(region.bounds) })),
  COAST_REGION,
  SWAMP_REGION,
  LAKE_REGION,
  SNOW_REGION,
  AUTUMN_REGION,
];

export const CAPITAL: IsoWorld = {
  ...CAPITAL_CORE,
  cols: WORLD_COLS,
  rows: WORLD_ROWS,
  spawn: shift(CAPITAL_CORE.spawn),
  terrain: map.terrain,
  biomes: { presets: map.presets, grid: map.biome },
  objects: map.objects,
  doors: CAPITAL_CORE.doors.map(shift),
  npcs: (CAPITAL_CORE.npcs ?? []).map(shift),
  mushrooms: [...CAPITAL_CORE.mushrooms.map(shift), ...NEW_SHRINES],
  regions,
};
