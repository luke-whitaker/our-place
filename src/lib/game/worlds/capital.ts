// The Capital — the authored starter town, now set inside a larger outskirts
// map (104×88) so there's woods to walk into. The town itself is composed
// exactly as before (two streets of buildings, a plaza, a southern entrance
// avenue, a pond, two shrines) in its own local coordinate space, then shifted
// once by TOWN so every town coordinate moves together — see wc()/wr() below.
// Everything outside the town rectangle is new: a forest ring, dirt trails out
// of town, two clearings, a second pond, and two more mushroom shrines.
//
// Each building uses one of the six Evergrow Town_House sprites (drawn at half
// size — see OBJECT_CATALOG in world-model.ts), with variants alternated so
// neighbours differ. The player spawns south of the town and approaches
// northward, so buildings sit "above" their doors and read cleanly in the 2:1
// projection.
//
// A member's own place is not a building here: it is their floating island,
// reached only through the mycelium network (the "Home" link at every shrine).
// The vacated north-west lot (once a "My Place" cottage) is now a small park.

import type { IsoWorld, TerrainKind, PlacedObjectData } from "../world-model";
import { OBJECT_CATALOG } from "../world-model";
import { ISLAND_SHRINE_ID } from "./island";
import { EXIT_DOOR_ID } from "./interior";
import { interiorPlace } from "./interiors";
import type { Door, MushroomWarp, Region, WorldLink } from "../types";

// ── Map + the town's offset within it ──

const COLS = 104;
const ROWS = 88;
const TOWN_COLS = 56;
const TOWN_ROWS = 48;
/** Where the town's own (0,0) sits in the bigger map — the one offset every
 * town coordinate below moves through via wc()/wr(), so the town's internal
 * geometry (streets, plaza, pond, doors) never needs retyping. */
export const TOWN = { col: 24, row: 20 };
function wc(col: number): number {
  return col + TOWN.col;
}
function wr(row: number): number {
  return row + TOWN.row;
}

interface Rect {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}
function inRect(c: number, r: number, rect: Rect): boolean {
  return c >= rect.c0 && c <= rect.c1 && r >= rect.r0 && r <= rect.r1;
}
const TOWN_RECT: Rect = {
  c0: TOWN.col,
  c1: TOWN.col + TOWN_COLS - 1,
  r0: TOWN.row,
  r1: TOWN.row + TOWN_ROWS - 1,
};

// ── The town, in its own local coordinates ──

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
const NORTH_ROW_LOCAL = 12;
const SOUTH_ROW_LOCAL = 30;
const BUILDING_COLS_LOCAL = [6, 17, 28, 39, 50];

const RAW_BUILDINGS: ReadonlyArray<BuildingSpec> = [
  {
    id: "welcome-center",
    label: "Welcome Center",
    kind: "manor_blue",
    col: 17,
    row: NORTH_ROW_LOCAL,
  },
  { id: "creative", label: "Creative", kind: "house_purple", col: 28, row: NORTH_ROW_LOCAL },
  {
    id: "community-support",
    label: "Community Support",
    kind: "cottage_awning",
    col: 39,
    row: NORTH_ROW_LOCAL,
  },
  { id: "technology", label: "Technology", kind: "tower_green", col: 50, row: NORTH_ROW_LOCAL },
  { id: "health", label: "Health", kind: "cottage_awning", col: 6, row: SOUTH_ROW_LOCAL },
  { id: "music", label: "Music", kind: "tower_green", col: 17, row: SOUTH_ROW_LOCAL },
  { id: "food", label: "Food", kind: "hall_red", col: 28, row: SOUTH_ROW_LOCAL },
  { id: "gaming", label: "Gaming", kind: "house_purple", col: 39, row: SOUTH_ROW_LOCAL },
  { id: "sports", label: "Sports", kind: "cottage_blue", col: 50, row: SOUTH_ROW_LOCAL },
];
/** The town, shifted into world space — the one place the TOWN offset touches building data. */
const BUILDINGS: ReadonlyArray<BuildingSpec> = RAW_BUILDINGS.map((b) => ({
  ...b,
  col: wc(b.col),
  row: wr(b.row),
}));

const BUILDING_COLS = BUILDING_COLS_LOCAL.map(wc);
const NORTH_ROW = wr(NORTH_ROW_LOCAL);
const SOUTH_ROW = wr(SOUTH_ROW_LOCAL);
const NORTH_STREET = NORTH_ROW + 1;
const SOUTH_STREET = SOUTH_ROW + 1;
const PLAZA = { c0: wc(22), c1: wc(34), r0: wr(19), r1: wr(24) };
const ENTRANCE_COL = wc(28);
const SPAWN = { col: wc(28), row: wr(40) };
export const POND = { col: wc(40), row: wr(40), radius: 3 };
/** The vacated My Place lot, now a park; keeps the avenue at BUILDING_COLS[0] open. */
const PARK_RECT: Rect = { c0: 24, c1: 35, r0: 23, r1: 32 };
const PARK_GAP_COL = BUILDING_COLS[0];

// ── The outskirts, authored directly in world space ──

const MILLERS_INTERIOR: Rect = { c0: 4, c1: 18, r0: 33, r1: 47 };
const MIRROR_INTERIOR: Rect = { c0: 84, c1: 99, r0: 33, r1: 50 };
export const MIRROR_POND = { col: 92, row: 42, radius: 3 };

/** Trail waypoints (axis-aligned legs only — see carveTrail). Each starts one
 * tile past the town street it leaves from, so it never re-tags a "path" tile
 * as "dirt" (the two render identically today, but the distinction is real). */
export const OLD_ROAD: ReadonlyArray<readonly [number, number]> = [
  [52, 63],
  [52, 70],
  [46, 70],
  [46, 78],
  [54, 78],
  [54, 84],
];
export const WEST_TRAIL: ReadonlyArray<readonly [number, number]> = [
  [27, 33],
  [20, 33],
  [20, 40],
  [10, 40],
];
export const EAST_TRAIL: ReadonlyArray<readonly [number, number]> = [
  [76, 51],
  [85, 51],
  [85, 45],
  [95, 45],
];

// ── Terrain ──

function stampTownStreets(terrain: TerrainKind[][]): void {
  const path = (c: number, r: number) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) terrain[r][c] = "path";
  };
  for (let c = wc(4); c <= wc(51); c++) {
    path(c, NORTH_STREET);
    path(c, SOUTH_STREET);
  }
  for (const c of BUILDING_COLS) {
    for (let r = NORTH_STREET; r <= SOUTH_STREET; r++) path(c, r);
  }
  for (let r = PLAZA.r0; r <= PLAZA.r1; r++) {
    for (let c = PLAZA.c0; c <= PLAZA.c1; c++) path(c, r);
  }
  for (let r = SOUTH_STREET; r <= SPAWN.row + 2; r++) path(ENTRANCE_COL, r);
}

/** Stamp a diamond pond, only over grass, so it never severs a street or trail. */
function stampPond(
  terrain: TerrainKind[][],
  center: { col: number; row: number },
  radius: number,
): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (
        terrain[r][c] === "grass" &&
        Math.abs(c - center.col) + Math.abs(r - center.row) <= radius
      ) {
        terrain[r][c] = "water";
      }
    }
  }
}

/** Carve straight axis-aligned legs between waypoints (a simple polyline —
 * every trail below is authored as a short, bounded list of turns). */
function carveTrail(
  terrain: TerrainKind[][],
  kind: TerrainKind,
  points: ReadonlyArray<readonly [number, number]>,
): void {
  const set = (c: number, r: number) => {
    if (r >= 0 && r < ROWS && c >= 0 && c < COLS) terrain[r][c] = kind;
  };
  for (let i = 0; i < points.length - 1; i++) {
    const [c0, r0] = points[i];
    const [c1, r1] = points[i + 1];
    if (c0 === c1) {
      const [lo, hi] = r0 <= r1 ? [r0, r1] : [r1, r0];
      for (let r = lo; r <= hi; r++) set(c0, r);
    } else if (r0 === r1) {
      const [lo, hi] = c0 <= c1 ? [c0, c1] : [c1, c0];
      for (let c = lo; c <= hi; c++) set(c, r0);
    } else {
      throw new Error(`carveTrail: (${c0},${r0})-(${c1},${r1}) isn't an axis-aligned leg`);
    }
  }
}

function buildTerrain(): TerrainKind[][] {
  const terrain: TerrainKind[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => "grass" as TerrainKind),
  );
  stampTownStreets(terrain);
  stampPond(terrain, POND, POND.radius);
  carveTrail(terrain, "dirt", OLD_ROAD);
  carveTrail(terrain, "dirt", WEST_TRAIL);
  carveTrail(terrain, "dirt", EAST_TRAIL);
  stampPond(terrain, MIRROR_POND, MIRROR_POND.radius);
  return terrain;
}

const terrain = buildTerrain();

// ── Object placement ──
// Every placed object goes through place()/placeRequired() so authoring never
// double-stamps a tile: it checks the catalog footprint against the terrain
// (grass only) and an occupied set, then reserves every footprint cell.
// placeRequired throws on collision — a bug in this file's coordinates, not a
// recoverable runtime case — so authored content that should always fit
// (buildings, shrines, hand-placed decor) fails loudly instead of silently
// vanishing. place() is used where skipping is the normal outcome (the tree
// ring and the forest scatter, which expect to land on occupied tiles often).

const objects: PlacedObjectData[] = [];
const occupied = new Set<string>();

function place(kind: string, c: number, r: number): boolean {
  const def = OBJECT_CATALOG[kind];
  const cells = def.footprint.map((f) => ({ c: c + f.dc, r: r + f.dr }));
  for (const cell of cells) {
    if (cell.c < 0 || cell.c >= COLS || cell.r < 0 || cell.r >= ROWS) return false;
    // Buildings legitimately overlap a street tile at their door-facing edge,
    // so this only rules out the physically absurd (an object on water or the
    // void) — decor callers below choose grass tiles by construction.
    const ground = terrain[cell.r][cell.c];
    if (ground === "water" || ground === "void") return false;
    if (occupied.has(`${cell.c},${cell.r}`)) return false;
  }
  for (const cell of cells) occupied.add(`${cell.c},${cell.r}`);
  objects.push({ kind, col: c, row: r });
  return true;
}

function placeRequired(kind: string, c: number, r: number): void {
  if (!place(kind, c, r)) {
    throw new Error(`capital: could not place "${kind}" at (${c},${r}) — blocked or non-grass`);
  }
}

// Buildings first, so their footprints are reserved before anything else is planted.
for (const b of BUILDINGS) placeRequired(b.kind, b.col, b.row);

// ── Town framing: tree ring, entrance grove, plaza bushes ──

const TREE_KINDS = ["oak1", "oak2", "pine1", "pine2", "oak_big"];

/** A loose ring of trees framing the town's own edges, skipping the park lot. */
function plantRing(c: number, r: number, i: number): void {
  if (inRect(c, r, PARK_RECT)) return;
  place(TREE_KINDS[i % TREE_KINDS.length], c, r);
}

let t = 0;
for (let c = 2; c < TOWN_COLS - 2; c += 3) {
  plantRing(wc(c), wr(2), t++);
  plantRing(wc(c), wr(TOWN_ROWS - 3), t++);
}
for (let r = 4; r < TOWN_ROWS - 4; r += 3) {
  plantRing(wc(2), wr(r), t++);
  plantRing(wc(TOWN_COLS - 3), wr(r), t++);
}

// A small grove flanking the southern entrance.
const ENTRANCE_GROVE: ReadonlyArray<readonly [number, number]> = [
  [22, 38],
  [34, 38],
  [20, 43],
  [37, 44],
  [24, 45],
];
for (const [c, r] of ENTRANCE_GROVE) plantRing(wc(c), wr(r), t++);

// Bushes softening the plaza corners.
const PLAZA_BUSHES: ReadonlyArray<readonly [number, number]> = [
  [21, 18],
  [35, 18],
  [21, 25],
  [35, 25],
];
for (const [c, r] of PLAZA_BUSHES) place("bush", wc(c), wr(r));

// ── The park (the vacated north-west lot) ──

function buildPark(): void {
  placeRequired("well", 32, 27);
  placeRequired("lamp1", 26, 25);
  placeRequired("lamp2", 33, 25);
  placeRequired("lamp3", 26, 30);
  placeRequired("lamp4", 33, 30);
  placeRequired("flower_box1", 28, 27);
  placeRequired("flower_box2", 34, 28);
  placeRequired("chair", 28, 29);

  // Border fence, leaving PARK_GAP_COL open so the avenue reaches the street.
  for (let c = PARK_RECT.c0 + 1; c < PARK_RECT.c1; c++) {
    placeRequired("fence_col", c, PARK_RECT.r0);
    if (c !== PARK_GAP_COL) placeRequired("fence_col", c, PARK_RECT.r1);
  }
  for (let r = PARK_RECT.r0 + 1; r < PARK_RECT.r1; r++) {
    placeRequired("fence_row", PARK_RECT.c0, r);
    placeRequired("fence_row", PARK_RECT.c1, r);
  }
  const corners: ReadonlyArray<readonly [number, number]> = [
    [PARK_RECT.c0, PARK_RECT.r0],
    [PARK_RECT.c1, PARK_RECT.r0],
    [PARK_RECT.c0, PARK_RECT.r1],
    [PARK_RECT.c1, PARK_RECT.r1],
  ];
  for (const [c, r] of corners) placeRequired("bush", c, r);
}
buildPark();

// ── Plaza dressing ──

function dressPlaza(): void {
  placeRequired("lamp1", 44, 39);
  placeRequired("lamp2", 60, 39);
  placeRequired("lamp3", 44, 44);
  placeRequired("lamp4", 60, 44);
  placeRequired("barrel", 54, 49);
  placeRequired("crate1", 55, 48);
  placeRequired("crate2", 56, 49);
}
dressPlaza();

// ── Clearing dressing ──

function dressMillersClearing(): void {
  placeRequired("rock1", 6, 35);
  placeRequired("rock2", 15, 44);
  placeRequired("log1", 5, 42);
  placeRequired("stump1", 16, 36);
  placeRequired("grass_patch1", 7, 45);
  placeRequired("grass_patch3", 13, 34);
  placeRequired("flower_bed", 10, 44);
}
dressMillersClearing();

function dressMirrorPond(): void {
  placeRequired("boulder", 90, 37);
  placeRequired("log2", 97, 40);
  placeRequired("stump2", 86, 47);
  placeRequired("grass_patch2", 98, 44);
  placeRequired("grass_patch4", 87, 48);
  placeRequired("flower_bed", 94, 48);
}
dressMirrorPond();

// ── Mushroom warp network ──

const mushrooms: MushroomWarp[] = [
  {
    id: "capital-gate",
    col: wc(32),
    row: wr(40),
    label: "Capital Gate",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  },
  {
    id: "willow-grove",
    col: wc(45),
    row: wr(43),
    label: "Willow Grove",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  },
  {
    id: "millers-shrine",
    col: 8,
    row: 38,
    label: "Miller's Shrine",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  },
  {
    id: "pond-shrine",
    col: 86,
    row: 36,
    label: "Pond Shrine",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  },
];
for (const m of mushrooms) placeRequired("mushroom", m.col, m.row);

// ── The forest ring ──
// Density grows with distance from the town rectangle, so the woods thin out
// near town and wall up toward the map edge. Deterministic hashing (not
// Math.random) keeps the authored map reproducible from run to run.

const FAR_TREE_KINDS = [
  "oak_tall1",
  "oak_tall2",
  "pine_tall1",
  "pine_tall2",
  "oak_big",
  "oak1",
  "pine1",
];

function hash32(c: number, r: number, seed: number): number {
  return (Math.imul(c, 374761393) ^ Math.imul(r, 668265263) ^ Math.imul(seed, 2246822519)) >>> 0;
}

/** Chebyshev distance from (c,r) to the town rectangle; 0 inside it. */
function distFromTown(c: number, r: number): number {
  const dc = c < TOWN_RECT.c0 ? TOWN_RECT.c0 - c : c > TOWN_RECT.c1 ? c - TOWN_RECT.c1 : 0;
  const dr = r < TOWN_RECT.r0 ? TOWN_RECT.r0 - r : r > TOWN_RECT.r1 ? r - TOWN_RECT.r1 : 0;
  return Math.max(dc, dr);
}

function forestThreshold(dist: number): number {
  if (dist <= 3) return 15; // thin edge right outside town
  if (dist <= 8) return 45;
  if (dist <= 14) return 70;
  return 92; // dense wall toward the map perimeter
}

/** Scatter trees over every outskirts grass tile not reserved for a clearing.
 * Trails are "dirt", not "grass", so they're skipped automatically — the
 * forest can never grow over a walked path. */
function plantForest(): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (inRect(c, r, TOWN_RECT)) continue;
      if (inRect(c, r, MILLERS_INTERIOR) || inRect(c, r, MIRROR_INTERIOR)) continue;
      if (terrain[r][c] !== "grass") continue;
      const dist = distFromTown(c, r);
      if (hash32(c, r, 1) % 100 >= forestThreshold(dist)) continue;
      const pool = dist >= 9 ? FAR_TREE_KINDS : TREE_KINDS;
      place(pool[hash32(c, r, 2) % pool.length], c, r);
    }
  }
}
plantForest();

// ── Doors (one per community building) ──

// Each door warps into that building's room (Ports v2) rather than porting
// straight to the forum; the PC inside is what reaches the community page. The
// room's own `exit` door warps back here, arriving at this door's id.
const doors: Door[] = BUILDINGS.map((b) => ({
  id: b.id,
  label: b.label,
  col: b.col,
  row: b.row + 1,
  warpTo: interiorPlace(b.id),
  spawnAt: EXIT_DOOR_ID,
}));

// Every shrine in town offers the way home: the member's own island, arriving
// at its shrine because that is how they traveled.
const links: WorldLink[] = [{ id: "home", label: "Home", place: "me", spawnAt: ISLAND_SHRINE_ID }];

// ── Regions ──
// Willow Grove is listed before the Capital so its smaller, nested bounds win
// the region lookup near that shrine (see findRegionId — first match wins).

const regions: Region[] = [
  { id: "willow-grove", label: "Willow Grove", bounds: { col: 63, row: 57, w: 12, h: 11 } },
  {
    id: "capital",
    label: "The Capital",
    bounds: { col: TOWN.col, row: TOWN.row, w: TOWN_COLS, h: TOWN_ROWS },
  },
  { id: "old-road", label: "The Old Road", bounds: { col: 40, row: 68, w: 24, h: 20 } },
  { id: "north-woods", label: "The North Woods", bounds: { col: 0, row: 0, w: COLS, h: 20 } },
  { id: "millers-clearing", label: "Miller's Clearing", bounds: { col: 0, row: 28, w: 24, h: 24 } },
  { id: "mirror-pond", label: "Mirror Pond", bounds: { col: 80, row: 28, w: 24, h: 24 } },
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
