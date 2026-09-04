// A member's floating My Place island, generated rather than stored: one
// cottage whose door ports to their profile, one mushroom shrine linking back
// to the Capital gate, and trees in the biome they chose. Every device rebuilds
// the same island from the owner's id, so nothing about its layout lives in
// the database, only the biome and who may visit.
//
// The island is a pocket you leave from, not a second town: the Capital stays
// the daily loop, and the network is the only road between the two.

import type { IsoWorld, TerrainKind, PlacedObjectData } from "../world-model";
import { OBJECT_CATALOG } from "../world-model";
import type { TintPreset } from "../terrain-tint";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";
import { createRng, type Rng } from "../prng";
import type { Door, MushroomWarp, Region, WorldLink } from "../types";
import { EXIT_DOOR_ID } from "./interior";

export interface IslandOwner {
  id: string;
  username: string;
  displayName: string;
}

export interface IslandOptions {
  owner: IslandOwner;
  biome: TintPreset;
  /** Whether the viewer owns this island: labels and links differ for a visitor. */
  isOwn: boolean;
}

export const ISLAND_DOOR_ID = "my-place";
export const ISLAND_SHRINE_ID = "island-shrine";

/** The world id (and save slot) of a member's island. */
export function islandWorldId(ownerId: string): string {
  return `island:${ownerId}`;
}

/** The `?place=` value for the house on a member's island: `me-inside` when it
 * is your own, `<username>-inside` when visiting. Mirrors how the island itself
 * resolves. Lives here, not in island-house.ts, so the door below can warp
 * inside without the two modules importing each other. */
export function housePlace(who: string): string {
  return `${who}-inside`;
}

/** Save slot for a house, distinct from its island's so each remembers where you
 * last stood in it. */
export function houseWorldId(ownerId: string): string {
  return `${islandWorldId(ownerId)}:inside`;
}

const SIZE = 32;
const CENTRE = 16;
const HOUSE_KIND = "cottage_blue";
// Fixed landmarks: the cottage's south corner, its door, and the shrine, laid
// out on one north-south line with a dirt path between them.
const HOUSE = { col: CENTRE, row: CENTRE - 3 };
const DOOR = { col: CENTRE, row: HOUSE.row + 1 };
const SPAWN = { col: CENTRE, row: DOOR.row + 1 };
const SHRINE = { col: CENTRE, row: CENTRE + 4 };
/** Tiles per scattered object: sparser reads as a garden, denser as a thicket. */
const TILES_PER_OBJECT = 7;
const MAX_OBJECTS = 24;

/** What grows in each biome. The art is the same; the tint does the rest, so
 * the mix only nudges the silhouette (pines for snow, bare rock for scorched). */
const BIOME_FLORA: Record<TintPreset, ReadonlyArray<string>> = {
  forest: ["oak1", "oak2", "oak_big", "pine1", "pine2", "bush", "bush_large", "rock"],
  autumn: ["oak1", "oak2", "oak_big", "oak1", "bush", "bush_large", "rock"],
  snow: ["pine1", "pine2", "pine1", "pine2", "rock", "rock", "bush"],
  dusk: ["oak1", "oak2", "oak_big", "pine1", "pine2", "bush", "bush_large", "rock"],
  swamp: ["bush", "bush_large", "bush", "oak1", "oak2", "rock"],
  scorched: ["rock", "rock", "rock", "bush", "pine1", "oak1"],
};

function inBounds(col: number, row: number): boolean {
  return col >= 0 && col < SIZE && row >= 0 && row < SIZE;
}

/** Stamp a tile-space diamond of `kind`, leaving a two-tile void border. */
function stampDiamond(
  terrain: TerrainKind[][],
  cc: number,
  cr: number,
  radius: number,
  kind: TerrainKind,
): void {
  for (let r = cr - radius; r <= cr + radius; r++) {
    for (let c = cc - radius; c <= cc + radius; c++) {
      const inside = Math.abs(c - cc) + Math.abs(r - cr) <= radius;
      const clearOfEdge = c >= 2 && c < SIZE - 2 && r >= 2 && r < SIZE - 2;
      if (inside && clearOfEdge && inBounds(c, r)) terrain[r][c] = kind;
    }
  }
}

/** The land: a diamond under the cottage, one around the shrine, and a few
 * random lobes so no two islands share a coastline. */
function buildTerrain(rng: Rng): TerrainKind[][] {
  const terrain: TerrainKind[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => "void" as TerrainKind),
  );
  stampDiamond(terrain, HOUSE.col, HOUSE.row - 1, 7, "grass");
  stampDiamond(terrain, SHRINE.col, SHRINE.row, 5, "grass");
  const lobes = rng.int(2, 4);
  for (let i = 0; i < lobes; i++) {
    stampDiamond(terrain, CENTRE + rng.int(-6, 6), CENTRE + rng.int(-5, 6), rng.int(4, 7), "grass");
  }
  // The garden path from the doorstep to the shrine.
  for (let r = DOOR.row; r < SHRINE.row; r++) terrain[r][DOOR.col] = "dirt";
  return terrain;
}

/** Tiles no scattered object may take: the path and doorstep with a one-tile
 * margin (so nothing leans over the door), and the tiles around the shrine
 * where a traveler arrives, so nothing stands in front of them. */
function protectedTiles(): Set<string> {
  const keep = new Set<string>();
  for (let r = DOOR.row - 1; r <= SHRINE.row + 2; r++) {
    for (let c = DOOR.col - 1; c <= DOOR.col + 1; c++) keep.add(`${c},${r}`);
  }
  return keep;
}

/** Tiles reachable on foot from spawn (4-neighbour flood fill), as "c,r" keys. */
function reachable(grid: SolidGrid): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[SPAWN.col, SPAWN.row]];
  // Bounded by the grid: each tile enters `seen` at most once.
  while (queue.length > 0 && seen.size <= SIZE * SIZE) {
    const [c, r] = queue.pop()!;
    const key = `${c},${r}`;
    if (seen.has(key) || isSolidAt(grid, c, r)) continue;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}

/** Whether the door and a tile beside the shrine can still be walked to. */
function landmarksReachable(world: IsoWorld): boolean {
  const seen = reachable(buildSolidGrid(world));
  const shrineApproach = `${SHRINE.col},${SHRINE.row - 1}`;
  return seen.has(`${DOOR.col},${DOOR.row}`) && seen.has(shrineApproach);
}

/** Scatter flora over free grass, keeping only placements that leave the
 * door and shrine reachable. Each candidate costs one small flood fill. */
function scatterFlora(world: IsoWorld, rng: Rng, biome: TintPreset): void {
  const keep = protectedTiles();
  const footprint = new Set(
    OBJECT_CATALOG[HOUSE_KIND].footprint.map((f) => `${HOUSE.col + f.dc},${HOUSE.row + f.dr}`),
  );
  const candidates: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const key = `${c},${r}`;
      if (world.terrain[r][c] === "grass" && !keep.has(key) && !footprint.has(key)) {
        candidates.push([c, r]);
      }
    }
  }
  const budget = Math.min(MAX_OBJECTS, Math.floor(candidates.length / TILES_PER_OBJECT));
  const flora = BIOME_FLORA[biome];
  let placed = 0;
  for (let attempt = 0; attempt < candidates.length && placed < budget; attempt++) {
    const [col, row] = candidates.splice(rng.int(0, candidates.length - 1), 1)[0];
    const object: PlacedObjectData = { kind: rng.pick(flora), col, row };
    world.objects.push(object);
    if (landmarksReachable(world)) placed++;
    else world.objects.pop();
  }
}

export function buildIsland({ owner, biome, isOwn }: IslandOptions): IsoWorld {
  const rng = createRng(owner.id);
  const possessive = `${owner.displayName}'s`;

  // The cottage door opens the house rather than porting to the forum: the PC
  // inside is the way through to a profile now (Ports v2).
  const doors: Door[] = [
    {
      id: ISLAND_DOOR_ID,
      label: isOwn ? "My Place" : `${possessive} Place`,
      ...DOOR,
      warpTo: housePlace(isOwn ? "me" : owner.username),
      spawnAt: EXIT_DOOR_ID,
    },
  ];
  const mushrooms: MushroomWarp[] = [
    {
      id: ISLAND_SHRINE_ID,
      ...SHRINE,
      label: "Island Shrine",
      nodeId: "island",
      connections: "all",
      reachableOnFoot: true,
    },
  ];
  const links: WorldLink[] = [
    { id: "capital", label: "The Capital", place: "capital", spawnAt: "capital-gate" },
  ];
  if (!isOwn) links.push({ id: "home", label: "Home", place: "me", spawnAt: ISLAND_SHRINE_ID });
  const regions: Region[] = [
    {
      id: "island",
      label: isOwn ? "Home" : `${possessive} Island`,
      bounds: { col: 0, row: 0, w: SIZE, h: SIZE },
    },
  ];

  const world: IsoWorld = {
    id: islandWorldId(owner.id),
    tint: biome,
    cols: SIZE,
    rows: SIZE,
    spawn: SPAWN,
    terrain: buildTerrain(rng),
    objects: [
      { kind: HOUSE_KIND, ...HOUSE },
      { kind: "mushroom", ...SHRINE },
    ],
    doors,
    mushrooms,
    links,
    regions,
  };
  scatterFlora(world, rng, biome);
  return world;
}
