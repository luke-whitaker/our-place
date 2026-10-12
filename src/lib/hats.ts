// Hats: a member wears one flower or Keepsake Mushroom at a time, in the
// one-slot `head` location. Wearing moves it out of pockets (nothing is
// copied), and its look reaches everyone else through live presence.

import prisma from "@/lib/db";
import { ITEM_CATALOG, isItemKind } from "@/lib/items";
import { ITEM_SELECT, StackRaceError, addItems, firstFreeSlot, takeOne } from "@/lib/pockets";
import { isPlantLook, type PlantLook } from "@/lib/game/plants";
import type { Prisma } from "@/generated/prisma/client";

type ItemPayload = Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }>;

/** The flower or keepsake on a member's head, or null. */
export async function wornHat(userId: string): Promise<ItemPayload | null> {
  return prisma.item.findFirst({
    where: { ownerId: userId, location: "head" },
    select: ITEM_SELECT,
  });
}

/** The look others should see on a member's head, or null. */
export async function hatColor(userId: string): Promise<PlantLook | null> {
  const hat = await prisma.item.findFirst({
    where: { ownerId: userId, location: "head" },
    select: { color: true },
  });
  return hat && isPlantLook(hat.color) ? hat.color : null;
}

export type WearOutcome =
  | { outcome: "worn"; hat: ItemPayload }
  | { outcome: "not_found" }
  | { outcome: "not_wearable" }
  | { outcome: "pockets_full" };

/** Thrown to roll a wear back when the old hat has nowhere to go. */
class NoRoomForOldHat extends Error {}

/**
 * Put a flower or Keepsake Mushroom from pockets on the member's head. A
 * single item moves (nothing is copied); from a stack, one comes off it as
 * its own row. Whatever was worn goes back into pockets: a flower into the
 * slot the new one left (or the lowest free), a keepsake onto its color's
 * stack. Only when it can't fit does the wear refuse, and nothing changes.
 * The old hat first steps out of every slot (slot null), so the unique
 * owner + location + slot index never sees two items in one place.
 */
export async function wearItem(userId: string, itemId: string): Promise<WearOutcome> {
  try {
    return await prisma.$transaction(async (tx): Promise<WearOutcome> => {
      const item = await tx.item.findFirst({
        where: { id: itemId, ownerId: userId, location: "pocket" },
        select: { kind: true, slot: true, quantity: true, color: true },
      });
      if (!item || item.slot === null) return { outcome: "not_found" };
      if (!isItemKind(item.kind) || !ITEM_CATALOG[item.kind].wearable) {
        return { outcome: "not_wearable" };
      }

      const previous = await tx.item.findFirst({
        where: { ownerId: userId, location: "head" },
        select: { id: true, kind: true, color: true },
      });
      if (previous) {
        await tx.item.update({
          where: { id: previous.id },
          data: { location: "pocket", slot: null },
        });
      }
      const hatId = await putOnHead(tx, userId, itemId, {
        kind: item.kind,
        slot: item.slot,
        quantity: item.quantity,
        color: item.color,
      });
      if (previous)
        await pocketOldHat(tx, userId, previous, item.quantity === 1 ? item.slot : null);
      const hat = await tx.item.findUniqueOrThrow({ where: { id: hatId }, select: ITEM_SELECT });
      return { outcome: "worn", hat };
    });
  } catch (error) {
    if (error instanceof NoRoomForOldHat) return { outcome: "pockets_full" };
    throw error;
  }
}

/** Move a single item onto the head, or take one off a stack as a new row
 * there. Returns the worn row's id. */
async function putOnHead(
  tx: Prisma.TransactionClient,
  userId: string,
  itemId: string,
  item: { kind: string; slot: number; quantity: number; color: string | null },
): Promise<string> {
  if (item.quantity > 1) {
    if (!(await takeOne(tx, userId, itemId, "pocket"))) throw new StackRaceError();
    const worn = await tx.item.create({
      data: { ownerId: userId, kind: item.kind, color: item.color, location: "head", slot: 0 },
      select: { id: true },
    });
    return worn.id;
  }
  const moved = await tx.item.updateMany({
    where: { id: itemId, ownerId: userId, location: "pocket", slot: item.slot, quantity: 1 },
    data: { location: "head", slot: 0 },
  });
  if (moved.count !== 1) throw new StackRaceError();
  return itemId;
}

/** The hat just taken off, back in pockets: a stackable one joins its stack
 * (its row goes), anything else lands in `slot` or the lowest free one. */
async function pocketOldHat(
  tx: Prisma.TransactionClient,
  userId: string,
  hat: { id: string; kind: string; color: string | null },
  slot: number | null,
): Promise<void> {
  if (isItemKind(hat.kind) && ITEM_CATALOG[hat.kind].stackable) {
    await tx.item.delete({ where: { id: hat.id } });
    const landed = await addItems(tx, userId, "pocket", hat.kind, 1, { color: hat.color });
    if (!landed) throw new NoRoomForOldHat();
    return;
  }
  const target = slot ?? (await firstFreeSlot(tx, userId, "pocket"));
  if (target === null) throw new NoRoomForOldHat();
  await tx.item.update({ where: { id: hat.id }, data: { location: "pocket", slot: target } });
}

export type TakeOffOutcome = "taken_off" | "nothing_worn" | "pockets_full";

/** Take the worn hat off, back into pockets (a keepsake onto its stack). */
export async function takeOffHat(userId: string): Promise<TakeOffOutcome> {
  try {
    return await prisma.$transaction(async (tx): Promise<TakeOffOutcome> => {
      const hat = await tx.item.findFirst({
        where: { ownerId: userId, location: "head" },
        select: { id: true, kind: true, color: true },
      });
      if (!hat) return "nothing_worn";
      await tx.item.update({ where: { id: hat.id }, data: { location: "pocket", slot: null } });
      await pocketOldHat(tx, userId, hat, null);
      return "taken_off";
    });
  } catch (error) {
    if (error instanceof NoRoomForOldHat) return "pockets_full";
    throw error;
  }
}
