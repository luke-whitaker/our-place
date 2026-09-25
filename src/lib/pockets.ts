// Shared pocket/mailbox-slot logic: routes that hand a member a new item (an
// NPC gift, tearing a draft out of the Notebook, leaving or taking a letter)
// all need the same "lowest free slot" search and the same race handling, so
// it lives here once.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { LOCATION_SLOTS, isItemKind, type ItemKind, type ItemLocation } from "@/lib/items";
import type { PocketItem } from "@/lib/types/items";

/** The one shared select every route uses to read an item row, so the wire
 * shape (via toPocketItem) can't drift between routes. */
export const ITEM_SELECT = {
  id: true,
  kind: true,
  slot: true,
  body: true,
  placedAt: true,
  from: { select: { username: true, displayName: true } },
} as const;

/** Just enough of an items row to map onto the wire shape. */
interface ItemRow {
  id: string;
  kind: string;
  slot: number | null;
  body: string | null;
  placedAt: Date | null;
  from: { username: string; displayName: string } | null;
}

/**
 * The lowest free slot for `ownerId` within `location`, or null if it's
 * full. Runs inside the caller's transaction so the read and the insert
 * that follows it are consistent; the `@@unique([ownerId, location, slot])`
 * constraint is still what actually prevents two concurrent requests from
 * claiming the same slot — this is a best-effort pick, not a lock.
 */
export async function firstFreeSlot(
  tx: Prisma.TransactionClient,
  ownerId: string,
  location: ItemLocation,
): Promise<number | null> {
  const occupied = await tx.item.findMany({
    where: { ownerId, location },
    select: { slot: true },
  });
  const taken = new Set(occupied.map((item) => item.slot));
  for (let slot = 0; slot < LOCATION_SLOTS[location]; slot++) {
    if (!taken.has(slot)) return slot;
  }
  return null;
}

/**
 * Maps an items row to the wire shape. Asserts rather than silently
 * coercing on a row that can't have come from a healthy read: an
 * unrecognized kind or a null slot means the caller queried the wrong rows
 * (this app never lists an item outside its location's slot range as a
 * pocket item or letter).
 */
export function toPocketItem(row: ItemRow): PocketItem {
  if (!isItemKind(row.kind)) {
    throw new Error(`Unknown item kind "${row.kind}" on item ${row.id}`);
  }
  if (row.slot === null) {
    throw new Error(`toPocketItem called on item ${row.id}, which has no slot`);
  }
  return {
    id: row.id,
    kind: row.kind satisfies ItemKind,
    slot: row.slot,
    body: row.body,
    from: row.from ? { username: row.from.username, display_name: row.from.displayName } : null,
    placed_at: row.placedAt ? row.placedAt.toISOString() : null,
  };
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
