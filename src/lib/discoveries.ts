// Per-account map discoveries (world_discoveries): where a member has walked
// and which shrines they've found, in a world with a map. Writes only add, so
// any device can send what it knows in any order and nothing is ever lost.

import prisma from "@/lib/db";
import { emptyVisited, encodeVisited, orVisited, type ChunkGrid } from "@/lib/game/map-chunks";
import type { WorldDiscoveries } from "@/lib/types";

interface MapWorld {
  id: string;
  grid: ChunkGrid;
}

/** A stored bitmap of the wrong length (the world's size changed) starts
 * over rather than being misread chunk by chunk. */
function storedVisited(bytes: Uint8Array | null, grid: ChunkGrid): Uint8Array<ArrayBuffer> {
  return bytes && bytes.length === grid.bytes ? new Uint8Array(bytes) : emptyVisited(grid);
}

function toWire(world: MapWorld, visited: Uint8Array, shrines: string[]): WorldDiscoveries {
  return { world: world.id, visited: encodeVisited(visited), shrines };
}

export async function readDiscoveries(userId: string, world: MapWorld): Promise<WorldDiscoveries> {
  const row = await prisma.worldDiscovery.findUnique({
    where: { userId_worldId: { userId, worldId: world.id } },
    select: { visited: true, shrines: true },
  });
  return toWire(world, storedVisited(row?.visited ?? null, world.grid), row?.shrines ?? []);
}

/**
 * Merge a device's discoveries into the account's: bitwise OR for the visited
 * chunks, set union for the shrines. The row is created if missing, then
 * locked (SELECT ... FOR UPDATE) for the read-merge-write, so two devices
 * saving at once can't each overwrite the other's new chunks.
 */
export async function mergeDiscoveries(
  userId: string,
  world: MapWorld,
  visited: Uint8Array<ArrayBuffer> | null,
  shrines: readonly string[],
): Promise<WorldDiscoveries> {
  return prisma.$transaction(async (tx) => {
    await tx.worldDiscovery.createMany({
      data: [{ userId, worldId: world.id, visited: emptyVisited(world.grid) }],
      skipDuplicates: true,
    });
    await tx.$queryRaw`SELECT id FROM world_discoveries WHERE user_id = ${userId} AND world_id = ${world.id} FOR UPDATE`;
    const row = await tx.worldDiscovery.findUniqueOrThrow({
      where: { userId_worldId: { userId, worldId: world.id } },
      select: { visited: true, shrines: true },
    });
    const stored = storedVisited(row.visited, world.grid);
    const merged = visited ? orVisited(stored, visited) : stored;
    const allShrines = [...new Set([...row.shrines, ...shrines])];
    await tx.worldDiscovery.update({
      where: { userId_worldId: { userId, worldId: world.id } },
      data: { visited: merged, shrines: allShrines },
    });
    return toWire(world, merged, allShrines);
  });
}
