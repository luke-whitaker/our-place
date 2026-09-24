// Shared pocket-slot logic: routes that hand a member a new item (the NPC
// gift, tearing a draft out of the Notebook) all need the same "lowest free
// slot" search and the same race handling, so it lives here once.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { POCKET_SLOTS, isItemKind, type ItemKind } from "@/lib/items";
import type { PocketItem } from "@/lib/types/items";

/** Just enough of an items row to map onto the wire shape. */
interface ItemRow {
  id: string;
  kind: string;
  slot: number | null;
  body: string | null;
}

/**
 * The lowest free pocket slot (0-9) for `ownerId`, or null if all 10 are
 * taken. Runs inside the caller's transaction so the read and the insert
 * that follows it are consistent; the `@@unique([ownerId, slot])` constraint
 * is still what actually prevents two concurrent requests from claiming the
 * same slot — this is a best-effort pick, not a lock.
 */
export async function firstFreeSlot(
  tx: Prisma.TransactionClient,
  ownerId: string,
): Promise<number | null> {
  const occupied = await tx.item.findMany({
    where: { ownerId, slot: { not: null } },
    select: { slot: true },
  });
  const taken = new Set(occupied.map((item) => item.slot));
  for (let slot = 0; slot < POCKET_SLOTS; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/**
 * Maps an items row to the wire shape. Asserts rather than silently
 * coercing on a row that can't have come from a healthy pocket read: an
 * unrecognized kind or a null slot means the caller queried the wrong rows
 * (this app never lists an item outside 0-9 as a "pocket item").
 */
export function toPocketItem(row: ItemRow): PocketItem {
  if (!isItemKind(row.kind)) {
    throw new Error(`Unknown item kind "${row.kind}" on item ${row.id}`);
  }
  if (row.slot === null) {
    throw new Error(`toPocketItem called on item ${row.id}, which has no slot`);
  }
  return { id: row.id, kind: row.kind satisfies ItemKind, slot: row.slot, body: row.body };
}

/**
 * Whether `ownerId` has ever received the Notebook — every Notebook route
 * gates on this, since the Notebook can never be thrown away or otherwise
 * lost once given, so a plain existence check is enough (no slot filter).
 */
export async function hasNotebook(ownerId: string): Promise<boolean> {
  const notebook = await prisma.item.findFirst({
    where: { ownerId, kind: "notebook" satisfies ItemKind },
    select: { id: true },
  });
  return notebook !== null;
}

/**
 * True when `error` is Prisma's unique-constraint violation (P2002). Every
 * route that races on a slot or a notebook page catches this and answers 409
 * instead of the generic 500 the outer try/catch would otherwise produce.
 */
export function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}
