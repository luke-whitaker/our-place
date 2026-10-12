// Keepsake Mushrooms on the server: one per person per world gathering, the
// host's when they plant its Event Mushroom and each guest's the first time
// they come near it. The color rule lives in src/lib/game/keepsake.ts.

import type { Prisma } from "@/generated/prisma/client";
import { ITEM_SELECT, addItems } from "@/lib/pockets";
import { nextKeepsakeColor } from "@/lib/game/keepsake";
import type { KeepsakeLook } from "@/lib/game/plants";

type ItemPayload = Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }>;

export type KeepsakeOutcome =
  { outcome: "given"; item: ItemPayload } | { outcome: "already" } | { outcome: "pockets_full" };

/**
 * Give `userId` this gathering's keepsake, inside the caller's transaction.
 * Locks the gathering's row first, so two arrivals at once take turns and the
 * colors alternate in the order people really got them. Nothing is recorded
 * when pockets are full, so the member can make room and come back.
 */
export async function giveKeepsake(
  tx: Prisma.TransactionClient,
  gatheringId: string,
  userId: string,
  random: () => number = Math.random,
): Promise<KeepsakeOutcome> {
  await tx.$queryRaw`SELECT id FROM gatherings WHERE id = ${gatheringId} FOR UPDATE`;
  const mine = await tx.gatheringKeepsake.findUnique({
    where: { gatheringId_userId: { gatheringId, userId } },
    select: { id: true },
  });
  if (mine) return { outcome: "already" };

  const last = await tx.gatheringKeepsake.findFirst({
    where: { gatheringId },
    orderBy: { ordinal: "desc" },
    select: { ordinal: true, color: true },
  });
  const color = nextKeepsakeColor(last?.color ?? null, random);
  const look: KeepsakeLook = `keepsake_${color}`;
  const landed = await addItems(tx, userId, "pocket", "keepsake_mushroom", 1, { color: look });
  if (!landed) return { outcome: "pockets_full" };
  await tx.gatheringKeepsake.create({
    data: { gatheringId, userId, color, ordinal: (last?.ordinal ?? -1) + 1 },
  });
  return { outcome: "given", item: landed[0] };
}
