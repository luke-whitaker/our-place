// Seeds and flowers on the server: reading what grows in a world, building the
// world a member plants in, and deciding a seed's bloom. The pure placement
// rule lives in src/lib/game/plants.ts, shared with the world client.

import prisma from "@/lib/db";
import { CAPITAL } from "@/lib/game/worlds/world-map";
import { islandWorldId } from "@/lib/game/worlds/island";
import { withEventMushrooms } from "@/lib/game/event-mushroom";
import { isFlowerColor, placedFromWire, plantableWorld, withPlants } from "@/lib/game/plants";
import { activeInWorld } from "@/lib/event-mushrooms";
import { ownIslandWorld } from "@/lib/event-mushroom-planting";
import type { IsoWorld } from "@/lib/game/world-model";
import type { PlantWire } from "@/lib/types";

/** The most plants one read returns. The Capital holds at most 10 per member
 * and an island 200, so this only bounds the query. */
const PLANT_LIST_CAP = 3000;

const PLANT_SELECT = {
  id: true,
  ownerId: true,
  col: true,
  row: true,
  color: true,
  bloomsAt: true,
  owner: { select: { username: true, displayName: true } },
} as const;

interface PlantRow {
  id: string;
  ownerId: string;
  col: number;
  row: number;
  color: string;
  bloomsAt: Date | null;
  owner: { username: string; displayName: string };
}

/** Whether a plant is in bloom: a placed flower always, a seed from its time. */
export function isBloomed(bloomsAt: Date | null, now: Date): boolean {
  return bloomsAt === null || bloomsAt.getTime() <= now.getTime();
}

/** A plant on the wire. A seed's color stays on the server until it blooms. */
export function toPlantWire(row: PlantRow, viewerId: string, now: Date): PlantWire {
  const color = isBloomed(row.bloomsAt, now) && isFlowerColor(row.color) ? row.color : null;
  return {
    id: row.id,
    col: row.col,
    row: row.row,
    owner: { username: row.owner.username, display_name: row.owner.displayName },
    mine: row.ownerId === viewerId,
    color,
  };
}

/** Everything growing in a world, as this viewer sees it. */
export async function plantsInWorld(
  worldId: string,
  viewerId: string,
  now: Date,
): Promise<PlantWire[]> {
  const rows = await prisma.worldPlant.findMany({
    where: { worldId },
    select: PLANT_SELECT,
    orderBy: { plantedAt: "asc" },
    take: PLANT_LIST_CAP,
  });
  return rows.map((row) => toPlantWire(row, viewerId, now));
}

export async function plantById(id: string) {
  return prisma.worldPlant.findUnique({
    where: { id },
    select: { ...PLANT_SELECT, worldId: true, yieldsSeed: true },
  });
}

/**
 * The world a member may plant in, with its standing mushrooms and plants, or
 * null when it isn't theirs to plant in. Only the plant route loads this, so
 * routes that only read plants never pull in the whole Capital.
 */
export async function plantingWorld(worldId: string, memberId: string): Promise<IsoWorld | null> {
  if (!plantableWorld(worldId, islandWorldId(memberId))) return null;
  const now = new Date();
  const base = worldId === "capital" ? CAPITAL : await ownIslandWorld(memberId);
  const [mushrooms, plants] = await Promise.all([
    activeInWorld(worldId, now),
    plantsInWorld(worldId, memberId, now),
  ]);
  const withMushrooms = withEventMushrooms(
    base,
    mushrooms.map((g) => ({
      gatheringId: g.id,
      col: g.col,
      row: g.row,
      host: g.host,
      invited: false,
    })),
  );
  return withPlants(withMushrooms, plants.map(placedFromWire));
}
