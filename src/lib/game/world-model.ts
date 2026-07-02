// The serializable iso world model — the source of truth for a place in the
// world. Authored as plain data (terrain grid + a list of placed objects +
// doors + warp shrines + regions) in world-space *tile* coordinates, so the same
// document can be shipped as a JSON file today and a DB row later. The renderer
// projects it to iso pixels; nothing here knows about the screen.
//
// Design seams (locked June 26 — see the iso-world-migration memory):
//   • Coordinates are world-space tiles, never screen pixels.
//   • The world is (static terrain) + (a list of objects). A "Builder" placing
//     something is just an append to `objects` — no baked tile grid to rewrite.
//   • Door ids are community slugs, so Ports keeps working (`?at=<slug>`).

import { z } from "zod";
import type { Door, MushroomWarp, Region } from "./types";

// ── Terrain ──
// Iso ground is a small set of surface types — in iso, structures (walls, roofs,
// houses) are objects, not tiles, so the 30-value top-down tile enum collapses to
// just the ground a player walks on.
export const terrainKindSchema = z.enum(["grass", "dirt", "path", "water", "sand"]);
export type TerrainKind = z.infer<typeof terrainKindSchema>;
export const TERRAIN_KINDS = terrainKindSchema.options;

/** Terrain the player cannot cross. */
export const SOLID_TERRAIN = new Set<TerrainKind>(["water"]);

// ── Object catalog ──
// Placement data is only `{ kind, col, row }` (serializable). The kind resolves
// at runtime to this definition: where the sprite lives, which tiles it blocks
// (footprint, as offsets from the anchor tile), and whether that footprint is
// solid. Adding a buildable object later = adding a catalog entry.
export interface FootprintCell {
  /** Column offset from the object's anchor tile. */
  dc: number;
  /** Row offset from the object's anchor tile. */
  dr: number;
}

export interface ObjectDef {
  /** Sprite path, served out of git (see CREDITS.md). */
  src: string;
  /** Tiles the object occupies, as offsets from its anchor tile. */
  footprint: ReadonlyArray<FootprintCell>;
  /** Whether the footprint blocks movement. */
  solid: boolean;
  /** Draw-time scale (default 1) for art authored oversized for the 32×16 tile.
   * Keep to powers of ½ so nearest-neighbour downscaling stays crisp. */
  scale?: number;
}

/** A one-tile footprint at the anchor — trees, rocks, bushes, the warp shrine. */
const SINGLE: ReadonlyArray<FootprintCell> = [{ dc: 0, dr: 0 }];

/** The house base: a 3-wide × 2-deep block behind its front-anchor tile. Tunable
 * per building art once real town houses are placed. */
const HOUSE_FOOTPRINT: ReadonlyArray<FootprintCell> = [
  { dc: -1, dr: -1 },
  { dc: 0, dr: -1 },
  { dc: 1, dr: -1 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 0 },
  { dc: 1, dr: 0 },
];

/** A wc×wr tile block whose SOUTH CORNER sits on the anchor tile. Sprites anchor
 * at the bottom-centre of their opaque content — for a building that point is the
 * south corner of its base diamond — so the blocked tiles extend north-west of
 * the anchor: dc, dr ∈ [-(w-1) .. 0]. A sprite drawn s×w px wide at scale k spans
 * roughly (k·w)/16 tiles, split across the two axes. */
function baseRect(wc: number, wr: number): ReadonlyArray<FootprintCell> {
  const cells: FootprintCell[] = [];
  for (let dr = -(wr - 1); dr <= 0; dr++) {
    for (let dc = -(wc - 1); dc <= 0; dc++) cells.push({ dc, dr });
  }
  return cells;
}

export const OBJECT_CATALOG: Record<string, ObjectDef> = {
  house: { src: "/world/objects/house.png", footprint: HOUSE_FOOTPRINT, solid: true },
  // The six Evergrow Town_House sheets, drawn at half size so a building spans
  // 5–7 tiles (the Capital's lots sit 11 columns apart). Source sheets:
  // cottage_blue=320x320, tower_green=320x480, house_purple=352x384,
  // cottage_awning=384x320, manor_blue=384x448, hall_red=448x448.
  cottage_blue: {
    src: "/world/objects/cottage_blue.png",
    footprint: baseRect(5, 5),
    solid: true,
    scale: 0.5,
  },
  tower_green: {
    src: "/world/objects/tower_green.png",
    footprint: baseRect(5, 5),
    solid: true,
    scale: 0.5,
  },
  house_purple: {
    src: "/world/objects/house_purple.png",
    footprint: baseRect(6, 5),
    solid: true,
    scale: 0.5,
  },
  cottage_awning: {
    src: "/world/objects/cottage_awning.png",
    footprint: baseRect(6, 6),
    solid: true,
    scale: 0.5,
  },
  manor_blue: {
    src: "/world/objects/manor_blue.png",
    footprint: baseRect(6, 6),
    solid: true,
    scale: 0.5,
  },
  hall_red: {
    src: "/world/objects/hall_red.png",
    footprint: baseRect(7, 7),
    solid: true,
    scale: 0.5,
  },
  oak_big: { src: "/world/objects/oak_big.png", footprint: SINGLE, solid: true },
  oak1: { src: "/world/objects/oak1.png", footprint: SINGLE, solid: true },
  oak2: { src: "/world/objects/oak2.png", footprint: SINGLE, solid: true },
  pine1: { src: "/world/objects/pine1.png", footprint: SINGLE, solid: true },
  pine2: { src: "/world/objects/pine2.png", footprint: SINGLE, solid: true },
  bush_large: { src: "/world/objects/bush_large.png", footprint: SINGLE, solid: true },
  bush: { src: "/world/objects/bush.png", footprint: SINGLE, solid: true },
  rock: { src: "/world/objects/rock.png", footprint: SINGLE, solid: true },
  mushroom: { src: "/world/objects/mushroom.png", footprint: SINGLE, solid: true },
};

// ── World ──

export interface PlacedObjectData {
  /** A key into OBJECT_CATALOG. */
  kind: string;
  col: number;
  row: number;
}

export interface IsoWorld {
  cols: number;
  rows: number;
  /** Default spawn tile (world-space). */
  spawn: { col: number; row: number };
  /** Ground terrain, indexed `[row][col]`; dimensions are `rows × cols`. */
  terrain: TerrainKind[][];
  /** Free-standing objects (trees, houses, shrines…), depth-sorted at render. */
  objects: PlacedObjectData[];
  /** Building entrances; `id` is the community slug for Ports. */
  doors: Door[];
  /** Mushroom warp shrines (the mycelium fast-travel network). */
  mushrooms: MushroomWarp[];
  /** Named regions, for entry toasts. */
  regions: Region[];
}

// ── Validation ──
// Zod covers the structural shape; parseIsoWorld adds the cross-field invariants
// (grid dimensions, known object kinds) that a schema can't express cleanly.

const tileCoordSchema = z.object({ col: z.number().int(), row: z.number().int() });

const doorSchema = z.object({
  col: z.number().int(),
  row: z.number().int(),
  id: z.string(),
  label: z.string(),
});

const mushroomSchema = z.object({
  id: z.string(),
  col: z.number().int(),
  row: z.number().int(),
  label: z.string(),
  nodeId: z.string(),
  connections: z.union([z.array(z.string()), z.literal("all")]),
  reachableOnFoot: z.boolean(),
});

const regionSchema = z.object({
  id: z.string(),
  label: z.string(),
  bounds: z.object({
    col: z.number().int(),
    row: z.number().int(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
  }),
});

export const isoWorldSchema = z.object({
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  spawn: tileCoordSchema,
  terrain: z.array(z.array(terrainKindSchema)),
  objects: z.array(z.object({ kind: z.string(), col: z.number().int(), row: z.number().int() })),
  doors: z.array(doorSchema),
  mushrooms: z.array(mushroomSchema),
  regions: z.array(regionSchema),
});

/** Parse + validate raw data (a JSON file, an API payload, or a literal) into an
 * IsoWorld. Throws on a malformed shape, mismatched grid dimensions, or an
 * unknown object kind. The cast is sound: the schema mirrors the interface and
 * the extra checks below guard what Zod can't. */
export function parseIsoWorld(data: unknown): IsoWorld {
  const world = isoWorldSchema.parse(data) as IsoWorld;

  if (world.terrain.length !== world.rows) {
    throw new Error(`terrain has ${world.terrain.length} rows, expected ${world.rows}`);
  }
  world.terrain.forEach((row, r) => {
    if (row.length !== world.cols) {
      throw new Error(`terrain row ${r} has ${row.length} cols, expected ${world.cols}`);
    }
  });
  world.objects.forEach((obj, i) => {
    if (!(obj.kind in OBJECT_CATALOG)) {
      throw new Error(`objects[${i}] has unknown kind "${obj.kind}"`);
    }
  });

  return world;
}

/** Fetch a serialized world by URL — a static JSON file now, a DB-backed API
 * route later. The rest of the engine depends only on the returned IsoWorld, not
 * on where it came from. */
export async function fetchIsoWorld(url: string): Promise<IsoWorld> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch world: ${url}`);
  return parseIsoWorld(await res.json());
}
