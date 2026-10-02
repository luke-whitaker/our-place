// Who may be seen in, and see into, a world. The world id says whose place it
// is: the Capital and the community rooms are as public as the forum, while an
// island and its house follow the owner's island gate. Checked on every
// presence request, so answers are cached briefly to spare the database.

import { checkIslandAccessById, type IslandRefusal } from "@/lib/islands";
import { gatheringOpensIsland } from "@/lib/event-mushrooms";
import { islandWorldId } from "@/lib/game/worlds/island";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ISLAND_WORLD = new RegExp(`^island:(${UUID})(?::inside)?$`, "i");
const ROOM_WORLD = /^[a-z0-9]+(?:-[a-z0-9]+)*-inside$/;

export type WorldKind = { kind: "public" } | { kind: "island"; ownerId: string };

/** What kind of place a world id names, or null for an id no world uses. */
export function parseWorldId(worldId: string): WorldKind | null {
  if (worldId === "capital" || ROOM_WORLD.test(worldId)) return { kind: "public" };
  const island = ISLAND_WORLD.exec(worldId);
  return island ? { kind: "island", ownerId: island[1].toLowerCase() } : null;
}

export type WorldAccess = { ok: true } | { ok: false; status: 400 | 403 | 404; error: string };

const CACHE_MS = 30_000;
const CACHE_MAX = 2_000;
const cache = new Map<string, { access: WorldAccess; expires: number }>();

function remember(key: string, access: WorldAccess, now: number): void {
  // Insertion order is age order, so the first key is the oldest to evict.
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { access, expires: now + CACHE_MS });
}

/** Whether `viewerId` may appear in and watch `worldId`. A refusal reads the
 * same as the island route's, since it comes from the same gate. */
export async function checkWorldAccess(viewerId: string, worldId: string): Promise<WorldAccess> {
  const world = parseWorldId(worldId);
  if (!world) return { ok: false, status: 400, error: "Unknown world." };
  if (world.kind === "public") return { ok: true };

  const key = `${viewerId}|${worldId}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.access;

  const gate = await checkIslandAccessById(viewerId, world.ownerId);
  // A gathering's guests are on the island through its portal, so they show
  // up for each other there too. Never in the house, which keeps its gate.
  const asGuest =
    !gate.ok &&
    worldId.toLowerCase() === islandWorldId(world.ownerId) &&
    (await gatheringOpensIsland(viewerId, world.ownerId));
  const access: WorldAccess = gate.ok || asGuest ? { ok: true } : refusalAccess(gate.refusal);
  remember(key, access, now);
  return access;
}

function refusalAccess(refusal: IslandRefusal): WorldAccess {
  return { ok: false, status: refusal.status, error: refusal.error };
}
