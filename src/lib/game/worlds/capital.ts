// The Capital — the authored starter town the first invited players explore. A
// deliberate composition (unlike the lab's test scatter): two rows of community
// buildings along streets around a central plaza, a southern entrance avenue you
// spawn on, trees framing the edges, and the mushroom warp network. Each
// building's door id is the real community slug, so a door ports you into that
// community's forum view, and a Portal button (`/world?at=<slug>`) drops you at
// its doorstep.
//
// Each building uses one of the six Evergrow Town_House sprites (drawn at half
// size — see OBJECT_CATALOG in world-model.ts), with variants alternated so
// neighbours differ. The player spawns south of the town and approaches
// northward, so buildings sit "above" their doors and read cleanly in the 2:1
// projection.
//
// A member's own place is not a building here: it is their floating island,
// reached only through the mycelium network (the "Home" link at every shrine).
// The north row's west lot, once a "My Place" cottage, is open ground for a park.

import type { IsoWorld, TerrainKind, PlacedObjectData } from "../world-model";
import { OBJECT_CATALOG } from "../world-model";
import type { Door, MushroomWarp, Region, WorldLink } from "../types";

const COLS = 56;
const ROWS = 48;

interface BuildingSpec {
  id: string;
  label: string;
  /** An OBJECT_CATALOG building kind; its footprint extends north-west of the anchor. */
  kind: string;
  col: number;
  /** Front-anchor tile — the south corner of the building's base. */
  row: number;
}

// Two rows of lots, five per street; the north-west lot (col 6) is the park.
// Doors open onto the street one tile south of each building.
const NORTH_ROW = 12;
const SOUTH_ROW = 30;
const BUILDING_COLS = [6, 17, 28, 39, 50];

const BUILDINGS: ReadonlyArray<BuildingSpec> = [
  { id: "welcome-center", label: "Welcome Center", kind: "manor_blue", col: 17, row: NORTH_ROW },
  { id: "creative", label: "Creative", kind: "house_purple", col: 28, row: NORTH_ROW },
  {
    id: "community-support",
    label: "Community Support",
    kind: "cottage_awning",
    col: 39,
    row: NORTH_ROW,
  },
  { id: "technology", label: "Technology", kind: "tower_green", col: 50, row: NORTH_ROW },
  { id: "health", label: "Health", kind: "cottage_awning", col: 6, row: SOUTH_ROW },
  { id: "music", label: "Music", kind: "tower_green", col: 17, row: SOUTH_ROW },
  { id: "food", label: "Food", kind: "hall_red", col: 28, row: SOUTH_ROW },
  { id: "gaming", label: "Gaming", kind: "house_purple", col: 39, row: SOUTH_ROW },
  { id: "sports", label: "Sports", kind: "cottage_blue", col: 50, row: SOUTH_ROW },
];

const NORTH_STREET = NORTH_ROW + 1; // 13
const SOUTH_STREET = SOUTH_ROW + 1; // 31
const PLAZA = { c0: 22, c1: 34, r0: 19, r1: 24 };
const ENTRANCE_COL = 28;
const SPAWN = { col: 28, row: 40 };
// A diamond pond in the open southern field — south of the building row, so the
// tall building sprites don't occlude it.
const POND = { col: 40, row: 40, radius: 3 };

/** Tiles inside any building's catalog footprint (for keeping trees off them). */
function inFootprint(c: number, r: number): boolean {
  return BUILDINGS.some((b) =>
    OBJECT_CATALOG[b.kind].footprint.some((f) => b.col + f.dc === c && b.row + f.dr === r),
  );
}

function buildTerrain(): { terrain: TerrainKind[][]; isPath: (c: number, r: number) => boolean } {
  const terrain: TerrainKind[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => "grass" as TerrainKind),
  );
  const path = (c: number, r: number) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) terrain[r][c] = "path";
  };

  // East–west door-streets.
  for (let c = 4; c <= 51; c++) {
    path(c, NORTH_STREET);
    path(c, SOUTH_STREET);
  }
  // North–south avenues, one per building column, joining the two streets.
  for (const c of BUILDING_COLS) {
    for (let r = NORTH_STREET; r <= SOUTH_STREET; r++) path(c, r);
  }
  // Central plaza.
  for (let r = PLAZA.r0; r <= PLAZA.r1; r++) {
    for (let c = PLAZA.c0; c <= PLAZA.c1; c++) path(c, r);
  }
  // Southern entrance avenue down to the spawn.
  for (let r = SOUTH_STREET; r <= SPAWN.row + 2; r++) path(ENTRANCE_COL, r);

  // A diamond pond in the open grass east of the plaza — stamped only over grass
  // so it never severs a street (its tile-space diamond keeps the autotiler's
  // edges convex).
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        terrain[r][c] === "grass" &&
        Math.abs(c - POND.col) + Math.abs(r - POND.row) <= POND.radius
      ) {
        terrain[r][c] = "water";
      }
    }
  }

  const isPath = (c: number, r: number) =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS && terrain[r][c] === "path";
  return { terrain, isPath };
}

const { terrain, isPath } = buildTerrain();

// ── Objects: buildings, then framing trees, then accents ──

const objects: PlacedObjectData[] = BUILDINGS.map((b) => ({
  kind: b.kind,
  col: b.col,
  row: b.row,
}));

const TREE_KINDS = ["oak1", "oak2", "pine1", "pine2", "oak_big"];
function canPlant(c: number, r: number): boolean {
  return !isPath(c, r) && !inFootprint(c, r) && terrain[r][c] !== "water";
}
function plant(c: number, r: number, i: number): void {
  if (canPlant(c, r)) objects.push({ kind: TREE_KINDS[i % TREE_KINDS.length], col: c, row: r });
}

// A loose ring of trees framing the town edges.
let t = 0;
for (let c = 2; c < COLS - 2; c += 3) {
  plant(c, 2, t++);
  plant(c, ROWS - 3, t++);
}
for (let r = 4; r < ROWS - 4; r += 3) {
  plant(2, r, t++);
  plant(COLS - 3, r, t++);
}
// A small grove flanking the southern entrance.
for (const [c, r] of [
  [22, 38],
  [34, 38],
  [20, 43],
  [37, 44],
  [24, 45],
] as const) {
  plant(c, r, t++);
}
// Bushes softening the plaza corners.
for (const [c, r] of [
  [21, 18],
  [35, 18],
  [21, 25],
  [35, 25],
] as const) {
  if (canPlant(c, r)) objects.push({ kind: "bush", col: c, row: r });
}

// ── Doors (one per community building) ──

const doors: Door[] = BUILDINGS.map((b) => ({
  id: b.id,
  label: b.label,
  col: b.col,
  row: b.row + 1,
}));

// ── Mushroom warp network ──

const mushrooms: MushroomWarp[] = [
  {
    id: "capital-gate",
    col: 32,
    row: 40,
    label: "Capital Gate",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  },
  {
    id: "willow-grove",
    col: 45,
    row: 43,
    label: "Willow Grove",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  },
];
for (const m of mushrooms) objects.push({ kind: "mushroom", col: m.col, row: m.row });

// Every shrine in town offers the way home: the member's own island.
const links: WorldLink[] = [{ id: "home", label: "Home", place: "me" }];

// ── Region ──

const regions: Region[] = [
  { id: "capital", label: "The Capital", bounds: { col: 0, row: 0, w: COLS, h: ROWS } },
];

export const CAPITAL: IsoWorld = {
  id: "capital",
  cols: COLS,
  rows: ROWS,
  spawn: SPAWN,
  terrain,
  objects,
  doors,
  mushrooms,
  links,
  regions,
};
