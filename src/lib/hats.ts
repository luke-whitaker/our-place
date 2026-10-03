// Flower hats: a member wears one flower at a time, in the one-slot `head`
// location. Wearing moves the flower out of pockets (nothing is copied), and
// the worn color reaches everyone else through live presence.

import prisma from "@/lib/db";
import { ITEM_SELECT, firstFreeSlot } from "@/lib/pockets";
import { isFlowerColor, type FlowerColor } from "@/lib/game/plants";
import type { Prisma } from "@/generated/prisma/client";

type ItemPayload = Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }>;

/** The flower on a member's head, or null. */
export async function wornHat(userId: string): Promise<ItemPayload | null> {
  return prisma.item.findFirst({
    where: { ownerId: userId, location: "head" },
    select: ITEM_SELECT,
  });
}

/** The color others should see on a member's head, or null. */
export async function hatColor(userId: string): Promise<FlowerColor | null> {
  const hat = await prisma.item.findFirst({
    where: { ownerId: userId, location: "head" },
    select: { color: true },
  });
  return hat && isFlowerColor(hat.color) ? hat.color : null;
}

export type WearOutcome =
  { outcome: "worn"; hat: ItemPayload } | { outcome: "not_found" } | { outcome: "not_flower" };

/**
 * Put a flower from pockets on the member's head. A flower already worn swaps
 * into the pocket slot the new one leaves, so wearing never needs a free slot.
 * The old flower first steps out of every slot (slot null), so the unique
 * owner + location + slot index never sees two items in one place.
 */
export async function wearFlower(userId: string, itemId: string): Promise<WearOutcome> {
  return prisma.$transaction(async (tx): Promise<WearOutcome> => {
    const item = await tx.item.findFirst({
      where: { id: itemId, ownerId: userId, location: "pocket" },
      select: { kind: true, slot: true },
    });
    if (!item || item.slot === null) return { outcome: "not_found" };
    if (item.kind !== "flower") return { outcome: "not_flower" };

    const previous = await tx.item.findFirst({
      where: { ownerId: userId, location: "head" },
      select: { id: true },
    });
    if (previous) {
      await tx.item.update({
        where: { id: previous.id },
        data: { location: "pocket", slot: null },
      });
    }
    const moved = await tx.item.updateMany({
      where: { id: itemId, ownerId: userId, location: "pocket", slot: item.slot },
      data: { location: "head", slot: 0 },
    });
    if (moved.count !== 1) throw new Error("The flower left pockets mid-wear.");
    if (previous) {
      await tx.item.update({ where: { id: previous.id }, data: { slot: item.slot } });
    }
    const hat = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: ITEM_SELECT });
    return { outcome: "worn", hat };
  });
}

export type TakeOffOutcome = "taken_off" | "nothing_worn" | "pockets_full";

/** Take the worn flower off, back into the first free pocket slot. */
export async function takeOffHat(userId: string): Promise<TakeOffOutcome> {
  return prisma.$transaction(async (tx): Promise<TakeOffOutcome> => {
    const hat = await tx.item.findFirst({
      where: { ownerId: userId, location: "head" },
      select: { id: true },
    });
    if (!hat) return "nothing_worn";
    const slot = await firstFreeSlot(tx, userId, "pocket");
    if (slot === null) return "pockets_full";
    const moved = await tx.item.updateMany({
      where: { id: hat.id, ownerId: userId, location: "head" },
      data: { location: "pocket", slot },
    });
    return moved.count === 1 ? "taken_off" : "nothing_worn";
  });
}
