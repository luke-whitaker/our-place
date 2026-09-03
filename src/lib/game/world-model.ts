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
import { TINT_PRESETS, type TintPreset, type TintTarget } from "./terrain-tint";
import type { Door, MushroomWarp, Region, WorldLink } from "./types";

// ── Terrain ──
// Iso ground is a small set of surface types — in iso, structures (walls, roofs,
// houses) are objects, not tiles, so the 30-value top-down tile enum collapses to
// just the ground a player walks on. `void` is the absence of ground: never
// drawn and never walkable, so a floating island's edge is the autotiler's dirt
// skirt against the dark.
export const terrainKindSchema = z.enum(["grass", "dirt", "path", "water", "sand", "void"]);
export type TerrainKind = z.infer<typeof terrainKindSchema>;
export const TERRAIN_KINDS = terrainKindSchema.options;

/** Terrain the player cannot cross. */
export const SOLID_TERRAIN = new Set<TerrainKind>(["water", "void"]);

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
  /** How a biome tint recolors this art (see terrain-tint.ts): `nature` shifts
   * foliage, `evergreen` keeps pines green in autumn, `building` only takes the
   * scene lighting so paint and props keep their colors. */
  tint: TintTarget;
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

/** A one-tile solid nature sprite (trees, bushes, rocks, the warp shrine). */
function nature(src: string, tint: TintTarget = "nature"): ObjectDef {
  return { src: `/world/objects/${src}.png`, footprint: SINGLE, solid: true, tint };
}

/** One of the Evergrow Town_House sheets, drawn at half size so a building
 * spans 5–7 tiles (the Capital's lots sit 11 columns apart). */
function townHouse(src: string, wc: number, wr: number): ObjectDef {
  return {
    src: `/world/objects/${src}.png`,
    footprint: baseRect(wc, wr),
    solid: true,
    tint: "building",
    scale: 0.5,
  };
}

/** A one-tile non-solid ground decoration (grass tufts, flower beds) that
 * recolors with the terrain instead of foliage. */
function groundDecor(src: string): ObjectDef {
  return { src: `/world/objects/${src}.png`, footprint: SINGLE, solid: false, tint: "ground" };
}

/** A one-tile solid town prop (lamps, crates, fences…) that keeps its paint
 * regardless of biome, drawn at its native size (scale 1). */
function townProp(src: string): ObjectDef {
  return { src: `/world/objects/${src}.png`, footprint: SINGLE, solid: true, tint: "building" };
}

/** A two-tile fallen log or trunk, lying along the column axis from its
 * anchor. */
function natureLog(src: string): ObjectDef {
  return {
    src: `/world/objects/${src}.png`,
    footprint: baseRect(2, 1),
    solid: true,
    tint: "nature",
  };
}

export const OBJECT_CATALOG: Record<string, ObjectDef> = {
  house: {
    src: "/world/objects/house.png",
    footprint: HOUSE_FOOTPRINT,
    solid: true,
    tint: "building",
  },
  // Source sheets: cottage_blue=320x320, tower_green=320x480,
  // house_purple=352x384, cottage_awning=384x320, manor_blue=384x448,
  // hall_red=448x448.
  cottage_blue: townHouse("cottage_blue", 5, 5),
  tower_green: townHouse("tower_green", 5, 5),
  house_purple: townHouse("house_purple", 6, 5),
  cottage_awning: townHouse("cottage_awning", 6, 6),
  manor_blue: townHouse("manor_blue", 6, 6),
  hall_red: townHouse("hall_red", 7, 7),
  oak_big: nature("oak_big"),
  oak1: nature("oak1"),
  oak2: nature("oak2"),
  pine1: nature("pine1", "evergreen"),
  pine2: nature("pine2", "evergreen"),
  bush_large: nature("bush_large"),
  bush: nature("bush"),
  rock: nature("rock"),
  mushroom: nature("mushroom"),

  // ── Outskirts nature (Evergrow Nature_Assets_Separated) ──
  // Source: Forest_Deccoration_Assets_FallenLog{1,2}_48x48.png.
  log1: natureLog("log1"),
  log2: natureLog("log2"),
  // Source: Forest_Deccoration_Assets_TreeTrunk{1,2}_32x32.png.
  stump1: nature("stump1"),
  stump2: nature("stump2"),
  // Source: Forest_Deccoration_Assets_Rock{1,2}_32x32.png and Rock_48x48.png.
  rock1: nature("rock1"),
  rock2: nature("rock2"),
  boulder: nature("boulder"),
  // Source: Forest_Deccoration_Assets_FlowerBed1_32x32.png and GrassPatch{1..5}_32x32.png.
  flower_bed: groundDecor("flower_bed"),
  grass_patch1: groundDecor("grass_patch1"),
  grass_patch2: groundDecor("grass_patch2"),
  grass_patch3: groundDecor("grass_patch3"),
  grass_patch4: groundDecor("grass_patch4"),
  grass_patch5: groundDecor("grass_patch5"),
  // Source: Forest_Tree_Assets_{Oak,Pine}{1,2}_80x128.png — single-tile
  // footprint like oak_big: the canopy overhangs neighbouring tiles, but the
  // anchor is one tile, matching how the town's existing big oak already sits.
  oak_tall1: nature("oak_tall1"),
  oak_tall2: nature("oak_tall2"),
  pine_tall1: nature("pine_tall1", "evergreen"),
  pine_tall2: nature("pine_tall2", "evergreen"),

  // ── Outskirts town props (Evergrow Town_Assets_Separated) ──
  // Source: Town_Lamps{1..4}_48x112.png.
  lamp1: townProp("lamp1"),
  lamp2: townProp("lamp2"),
  lamp3: townProp("lamp3"),
  lamp4: townProp("lamp4"),
  // Source: Town_Assets_WaterWell_64x80.png.
  well: {
    src: "/world/objects/well.png",
    footprint: baseRect(2, 2),
    solid: true,
    tint: "building",
  },
  // Source: Town_Assets_Barrel_48x48.png and Crate{1..3}_32x32.png.
  barrel: townProp("barrel"),
  crate1: townProp("crate1"),
  crate2: townProp("crate2"),
  crate3: townProp("crate3"),
  // Source: Town_Assets_FlowerBox{1..4}_48x32.png.
  flower_box1: townProp("flower_box1"),
  flower_box2: townProp("flower_box2"),
  flower_box3: townProp("flower_box3"),
  flower_box4: townProp("flower_box4"),
  // Source: Town_Assets_Chair_32x32.png.
  chair: townProp("chair"),
  // Source: Town_Fences3_32x32.png (col-run) and Town_Fences4_32x32.png
  // (row-run) — the park border's two straight runs; picked by eye from the
  // 12 directional pieces after test-rendering the park (see capital.ts).
  fence_col: townProp("fence_col"),
  fence_row: townProp("fence_row"),
};

// ── World ──

export interface PlacedObjectData {
  /** A key into OBJECT_CATALOG. */
  kind: string;
  col: number;
  row: number;
}

export interface IsoWorld {
  /** Stable identity: the save-slot key and the `/world?place=` value. */
  id: string;
  /** Biome recolor baked into the art at load; absent means the forest as painted. */
  tint?: TintPreset;
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
  /** Warp-menu destinations in other worlds, offered at every shrine here. */
  links: WorldLink[];
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

const linkSchema = z.object({
  id: z.string(),
  label: z.string(),
  place: z.string().min(1),
  spawnAt: z.string().optional(),
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
  id: z.string().min(1),
  tint: z.enum(TINT_PRESETS).optional(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  spawn: tileCoordSchema,
  terrain: z.array(z.array(terrainKindSchema)),
  objects: z.array(z.object({ kind: z.string(), col: z.number().int(), row: z.number().int() })),
  doors: z.array(doorSchema),
  mushrooms: z.array(mushroomSchema),
  links: z.array(linkSchema),
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
