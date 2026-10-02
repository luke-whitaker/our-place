// Event Mushrooms on the server: which worlds a host may plant in, how to reach
// a planted one, and which planted mushrooms a member may use. Building a
// world to check a tile lives in event-mushroom-planting.ts, so routes that
// only read gatherings never load the whole Capital. The pure placement rule
// lives in src/lib/game/event-mushroom.ts, shared with the world client.

import prisma from "@/lib/db";
import { islandWorldId } from "@/lib/game/worlds/island";
import { findInterior, interiorPlace } from "@/lib/game/worlds/interiors";
import { gatheringSpawnId } from "@/lib/game/event-mushroom";

/** Who hosts a gathering and which community it belongs to: enough to say
 * where its mushroom may go and how to reach it. */
export interface MushroomHome {
  host: { id: string; username: string };
  community: { slug: string } | null;
}

/** The worlds a host may plant in: the shared world, their own island (not
 * the house), and the room inside the gathering's community building, when
 * the community has one. */
export function plantableWorlds({ host, community }: MushroomHome): string[] {
  const worlds = ["capital", islandWorldId(host.id)];
  if (community && findInterior(interiorPlace(community.slug))) {
    worlds.push(interiorPlace(community.slug));
  }
  return worlds;
}

/** The `?place=` that opens a mushroom's world: the Capital, a community
 * room, or the host's island by username. */
export function mushroomPlace(worldId: string, home: MushroomHome): string | null {
  if (worldId === "capital") return "capital";
  if (worldId === islandWorldId(home.host.id)) return home.host.username;
  if (findInterior(worldId)) return worldId;
  return null;
}

/** The portal into a planted mushroom's world, landing beside it. */
export function mushroomPortal(gatheringId: string, worldId: string, home: MushroomHome): string {
  const place = mushroomPlace(worldId, home) ?? "capital";
  return `/world?place=${encodeURIComponent(place)}&at=${gatheringSpawnId(gatheringId)}`;
}

/** Planted, still scheduled, and not over: the one definition of "standing in
 * the world right now". A mushroom shows from planting until the end. */
export function activeMushroomWhere(now: Date) {
  return {
    status: "scheduled",
    plantedAt: { not: null },
    mushroomWorld: { not: null },
    mushroomCol: { not: null },
    mushroomRow: { not: null },
    endsAt: { gt: now },
  } as const;
}

/** Every mushroom standing in `worldId`. A world holds few, but the cap keeps
 * the read bounded. */
export async function activeInWorld(worldId: string, now: Date) {
  const rows = await prisma.gathering.findMany({
    where: { ...activeMushroomWhere(now), mushroomWorld: worldId },
    select: {
      id: true,
      hostId: true,
      communityId: true,
      mushroomCol: true,
      mushroomRow: true,
      host: { select: { username: true } },
    },
    take: 200,
  });
  return rows.map((g) => ({
    id: g.id,
    hostId: g.hostId,
    communityId: g.communityId,
    // The where clause guarantees these; the fallback only satisfies the type.
    col: g.mushroomCol ?? 0,
    row: g.mushroomRow ?? 0,
    host: g.host.username,
  }));
}

/**
 * Which of these gatherings `viewerId` may open: the host, anyone with an
 * invite row, or a current member of the gathering's community. The same rule
 * as gatheringAccess, read in three queries for a whole list.
 */
export async function openableIds(
  viewerId: string,
  gatherings: { id: string; hostId: string; communityId: string | null }[],
): Promise<Set<string>> {
  if (gatherings.length === 0) return new Set();
  const ids = gatherings.map((g) => g.id);
  const communityIds = [
    ...new Set(gatherings.flatMap((g) => (g.communityId ? [g.communityId] : []))),
  ];
  const [invites, memberships] = await Promise.all([
    prisma.gatheringInvite.findMany({
      where: { userId: viewerId, gatheringId: { in: ids } },
      select: { gatheringId: true },
    }),
    prisma.communityMember.findMany({
      where: { userId: viewerId, communityId: { in: communityIds } },
      select: { communityId: true },
    }),
  ]);
  const invited = new Set(invites.map((i) => i.gatheringId));
  const member = new Set(memberships.map((m) => m.communityId));
  return new Set(
    gatherings
      .filter(
        (g) =>
          g.hostId === viewerId ||
          invited.has(g.id) ||
          (g.communityId !== null && member.has(g.communityId)),
      )
      .map((g) => g.id),
  );
}

/**
 * Whether a gathering lets `viewerId` onto `ownerId`'s island although the
 * island's own setting wouldn't: its mushroom stands on that island right now
 * and the viewer may open the gathering. With `gatheringId`, only that
 * gathering counts (the island route, reached through its portal); without
 * it, any gathering does (live presence, which can't know how you arrived).
 * Never the house: that keeps its own gate.
 */
export async function gatheringOpensIsland(
  viewerId: string,
  ownerId: string,
  gatheringId?: string,
): Promise<boolean> {
  const planted = await prisma.gathering.findMany({
    where: {
      ...activeMushroomWhere(new Date()),
      mushroomWorld: islandWorldId(ownerId),
      hostId: ownerId,
      ...(gatheringId ? { id: gatheringId } : {}),
    },
    select: { id: true, hostId: true, communityId: true },
    take: 50,
  });
  return (await openableIds(viewerId, planted)).size > 0;
}
