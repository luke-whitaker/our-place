// Seeds and flowers placed in a world: where a member may put one, how a
// placed plant joins the world, and the colors a flower comes in. Pure, shared
// by the plant routes (which are authoritative) and the world client (which
// only uses it to offer Plant and Place where the server will agree).

import { buildSolidGrid } from "./iso-collision";
import { fixtureFootprint, type IsoWorld } from "./world-model";
import { PLANT_CLEARANCE } from "./event-mushroom";
import type { PlantFixture } from "./types";
import type { PlantWire } from "@/lib/types/plants";

export const FLOWER_COLORS = ["red", "yellow", "blue", "purple", "pink"] as const;
export type FlowerColor = (typeof FLOWER_COLORS)[number];

export function isFlowerColor(value: unknown): value is FlowerColor {
  return typeof value === "string" && (FLOWER_COLORS as readonly string[]).includes(value);
}

/** A Keepsake Mushroom's two colors: the Our Place logo's and the Event
 * Mushroom's. */
export const KEEPSAKE_COLORS = ["ourplace", "red"] as const;
export type KeepsakeColor = (typeof KEEPSAKE_COLORS)[number];
export type KeepsakeLook = `keepsake_${KeepsakeColor}`;

/** What a worn or placed thing looks like: a flower's color, or a Keepsake
 * Mushroom's as `keepsake_<color>`. One vocabulary for `items.color`,
 * `world_plants.color`, and a hat, so wearing and placing never ask which
 * kind it is. */
export type PlantLook = FlowerColor | KeepsakeLook;

export const PLANT_LOOKS: readonly PlantLook[] = [
  ...FLOWER_COLORS,
  ...KEEPSAKE_COLORS.map((color): KeepsakeLook => `keepsake_${color}`),
];

export function isPlantLook(value: unknown): value is PlantLook {
  return typeof value === "string" && (PLANT_LOOKS as readonly string[]).includes(value);
}

export function isKeepsakeLook(look: PlantLook): look is KeepsakeLook {
  return look.startsWith("keepsake_");
}

/** What a placed plant is called: a seed until it blooms, then a flower or a
 * mushroom. */
export function plantNoun(look: PlantLook | null): "seed" | "flower" | "mushroom" {
  if (look === null) return "seed";
  return isKeepsakeLook(look) ? "mushroom" : "flower";
}

/** The OBJECT_CATALOG sprite for a placed look. */
export function plantSprite(look: PlantLook): string {
  return isKeepsakeLook(look)
    ? `keepsake_mushroom_${look.slice("keepsake_".length)}`
    : `flower_${look}`;
}

/** How many seeds and flowers one member may have standing in the shared
 * Capital at once, so the commons never fills up. */
export const CAPITAL_PLANT_CAP = 10;
/** The same bound on a member's own island: generous, but a bound. */
export const ISLAND_PLANT_CAP = 200;

/** A planted seed blooms somewhere in this window (decided September 24). */
export const BLOOM_MIN_MS = 12 * 60 * 60 * 1000;
export const BLOOM_MAX_MS = 24 * 60 * 60 * 1000;

/** A planted seed's color and bloom time, decided at planting and kept on
 * the server until then. `random` returns [0, 1), so tests can pin both. */
export function chooseBloom(
  now: Date,
  random: () => number = Math.random,
): { color: FlowerColor; bloomsAt: Date } {
  const color = FLOWER_COLORS[Math.floor(random() * FLOWER_COLORS.length)] ?? FLOWER_COLORS[0];
  const delay = BLOOM_MIN_MS + Math.floor(random() * (BLOOM_MAX_MS - BLOOM_MIN_MS));
  return { color, bloomsAt: new Date(now.getTime() + delay) };
}

/** The worlds a member may plant in: the shared world and their own island
 * (outside; the house is an interior). Never another member's island. */
export function plantableWorld(worldId: string, ownIslandId: string): boolean {
  return worldId === "capital" || worldId === ownIslandId;
}

/** The most a member may have standing in a world they may plant in. */
export function plantCap(worldId: string): number {
  return worldId === "capital" ? CAPITAL_PLANT_CAP : ISLAND_PLANT_CAP;
}

/** A placed seed, flower, or keepsake mushroom as the world needs it. `color` is null for a seed
 * that hasn't bloomed: the server never sends its color before then. */
export interface PlacedPlant {
  id: string;
  col: number;
  row: number;
  /** The planter's username and display name. */
  owner: string;
  ownerName: string;
  mine: boolean;
  color: PlantLook | null;
}

export function placedFromWire(p: PlantWire): PlacedPlant {
  return {
    id: p.id,
    col: p.col,
    row: p.row,
    owner: p.owner.username,
    ownerName: p.owner.display_name,
    mine: p.mine,
    color: p.color,
  };
}

const FIXTURE_PREFIX = "plant-";

export function plantFixture(p: PlacedPlant): PlantFixture {
  const noun = plantNoun(p.color);
  const label = p.mine
    ? { seed: "Dig up the seed", flower: "Pick the flower", mushroom: "Pick up the mushroom" }[noun]
    : noun === "seed"
      ? "Look at the mound"
      : `Look at the ${noun}`;
  return {
    id: `${FIXTURE_PREFIX}${p.id}`,
    kind: "plant",
    col: p.col,
    row: p.row,
    label,
    owner: p.owner,
    plantId: p.id,
    ownerName: p.ownerName,
    mine: p.mine,
    color: p.color,
  };
}

/** The world with its placed plants added as fixtures, so reach, the prompt,
 * and drawing treat them like other furniture. Plants are never solid
 * (iso-collision.ts skips them), so they can't block a path. Returns `world`
 * itself when there are none, so memoized consumers keep their identity. */
export function withPlants(world: IsoWorld, plants: readonly PlacedPlant[]): IsoWorld {
  if (plants.length === 0) return world;
  return { ...world, fixtures: [...(world.fixtures ?? []), ...plants.map(plantFixture)] };
}

/** Every tile someone could interact with, except plants: a flower may stand
 * beside another flower, so gardens can be planted in rows. */
function interactionTiles(world: IsoWorld): { col: number; row: number }[] {
  const fixtures = (world.fixtures ?? [])
    .filter((f) => f.kind !== "plant")
    .flatMap((f) =>
      fixtureFootprint(f).map(({ dc, dr }) => ({ col: f.col + dc, row: f.row + dr })),
    );
  return [
    ...world.doors,
    ...world.mushrooms,
    ...(world.pcs ?? []),
    ...(world.npcs ?? []),
    ...fixtures,
  ];
}

/**
 * Why a seed or flower can't go on (col, row), or null when it can. `world`
 * already holds the planted mushrooms and every plant (withPlants). The tile
 * must be open ground, hold no other plant, and keep clear of anything people
 * use, the Event Mushroom's rule. Unlike a mushroom, a plant is never solid,
 * so it can't cut anyone off and needs no reachability check.
 */
export function plotProblem(world: IsoWorld, col: number, row: number): string | null {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return "That isn't a spot in this place.";
  if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) {
    return "That isn't a spot in this place.";
  }
  const taken = (world.fixtures ?? []).some(
    (f) => f.kind === "plant" && f.col === col && f.row === row,
  );
  if (taken) return "Something's already growing there.";
  if (buildSolidGrid(world)[row][col]) return "Something's already there. Try open ground.";
  const crowded = interactionTiles(world).some(
    (t) => Math.hypot(t.col - col, t.row - row) < PLANT_CLEARANCE,
  );
  if (crowded) return "Too close to something people use. Try a few steps away.";
  return null;
}
