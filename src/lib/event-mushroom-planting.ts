// Building the world a host is planting in, so the plant route can check the
// tile with the same pure rule the client uses. Kept apart from
// event-mushrooms.ts because it loads the whole Capital.

import prisma from "@/lib/db";
import { CAPITAL } from "@/lib/game/worlds/world-map";
import { buildIsland, islandWorldId } from "@/lib/game/worlds/island";
import { findInterior } from "@/lib/game/worlds/interiors";
import { withEventMushrooms } from "@/lib/game/event-mushroom";
import { isTintPreset } from "@/lib/game/terrain-tint";
import { isMailboxColor } from "@/lib/game/mailbox-colors";
import { activeInWorld, plantableWorlds, type MushroomHome } from "@/lib/event-mushrooms";
import type { IsoWorld } from "@/lib/game/world-model";

/** The bare world, or null when it isn't one of this host's to plant in. The
 * island is rebuilt from the host's id, exactly as every visitor's device
 * builds it. */
async function baseWorld(worldId: string, home: MushroomHome): Promise<IsoWorld | null> {
  if (!plantableWorlds(home).includes(worldId)) return null;
  if (worldId === "capital") return CAPITAL;
  if (worldId !== islandWorldId(home.host.id)) return findInterior(worldId);
  return ownIslandWorld(home.host.id);
}

/** A member's island, rebuilt from their id exactly as every visitor's device
 * builds it. Shared with the plant routes. */
export async function ownIslandWorld(userId: string): Promise<IsoWorld> {
  const owner = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, username: true, displayName: true, biome: true, mailboxColor: true },
  });
  return buildIsland({
    owner: { id: owner.id, username: owner.username, displayName: owner.displayName },
    biome: isTintPreset(owner.biome) ? owner.biome : "forest",
    mailboxColor: isMailboxColor(owner.mailboxColor) ? owner.mailboxColor : "slate",
    isOwn: true,
  });
}

/** The world a host may plant in, with every other gathering's mushroom
 * already standing in it, or null when it isn't one of theirs. */
export async function plantingWorld(
  worldId: string,
  home: MushroomHome,
  gatheringId: string,
): Promise<IsoWorld | null> {
  const world = await baseWorld(worldId, home);
  if (!world) return null;
  const others = await activeInWorld(worldId, new Date());
  return withEventMushrooms(
    world,
    others
      .filter((g) => g.id !== gatheringId)
      .map((g) => ({ gatheringId: g.id, col: g.col, row: g.row, host: g.host, invited: false })),
  );
}
