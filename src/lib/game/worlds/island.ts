// A member's floating My Place island, generated rather than stored: one
// cottage, one mushroom shrine linking back to the Capital gate, and a mailbox,
// on a coastline shaped by the owner's id and tinted by the biome they chose.
// Every device rebuilds the same island from that id, so nothing about its
// layout lives in the database, only the biome and who may visit.
//
// Nothing else grows here yet. Islands start bare (Luke, September 25) so each
// member fills their own: seeds and flowers come next, and maybe rocks you can
// pick up and carry.
//
// The island is a pocket you leave from, not a second town: the Capital stays
// the daily loop, and the network is the only road between the two.

import type { IsoWorld, TerrainKind } from "../world-model";
import type { TintPreset } from "../terrain-tint";
import { createRng, type Rng } from "../prng";
import type { Door, MushroomWarp, Region, WorldFixture, WorldLink } from "../types";
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
export const ISLAND_MAILBOX_ID = "mailbox";

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
// Beside the garden path, clear of the door's and the shrine's reach.
const MAILBOX = { col: CENTRE - 1, row: SPAWN.row + 2 };
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
  const fixtures: WorldFixture[] = [
    {
      id: ISLAND_MAILBOX_ID,
      kind: "mailbox",
      ...MAILBOX,
      label: isOwn ? "Check mailbox" : "Leave a letter",
      owner: owner.username,
    },
  ];
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
    fixtures,
    mushrooms,
    links,
    regions,
  };
  return world;
}
