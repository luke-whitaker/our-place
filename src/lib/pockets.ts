// Shared pocket/mailbox-slot logic: routes that hand a member a new item (an
// NPC gift, tearing a draft out of the Notebook, leaving or taking a letter)
// all need the same "lowest free slot" search and the same race handling, so
// it lives here once.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { v4 as uuidv4 } from "uuid";
import {
  ITEM_CATALOG,
  LOCATION_SLOTS,
  MAX_STACK,
  isItemKind,
  planStackAdd,
  type ItemKind,
  type ItemLocation,
} from "@/lib/items";
import type { PocketItem } from "@/lib/types/items";
import { isFlowerColor } from "@/lib/game/plants";

/** The one shared select every route uses to read an item row, so the wire
 * shape (via toPocketItem) can't drift between routes. */
export const ITEM_SELECT = {
  id: true,
  kind: true,
  slot: true,
  body: true,
  placedAt: true,
  gatheringId: true,
  color: true,
  quantity: true,
  from: { select: { username: true, displayName: true } },
} as const;

/** Just enough of an items row to map onto the wire shape. */
interface ItemRow {
  id: string;
  kind: string;
  slot: number | null;
  body: string | null;
  placedAt: Date | null;
  gatheringId: string | null;
  color: string | null;
  quantity: number;
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

/** Every free slot in `ownerId`'s `location`, lowest first. Like
 * firstFreeSlot, a best-effort read inside the caller's transaction. */
async function freeSlots(
  tx: Prisma.TransactionClient,
  ownerId: string,
  location: ItemLocation,
): Promise<number[]> {
  const occupied = await tx.item.findMany({ where: { ownerId, location }, select: { slot: true } });
  const taken = new Set(occupied.map((item) => item.slot));
  return Array.from({ length: LOCATION_SLOTS[location] }, (_, slot) => slot).filter(
    (slot) => !taken.has(slot),
  );
}

/** Thrown inside a transaction when a stack changed under it, to roll the
 * whole write back; routes answer it with a 409 like a slot race. */
export class StackRaceError extends Error {
  constructor() {
    super("A stack changed just then.");
  }
}

/** True for a slot race (P2002) or a stack race: both mean "try again". */
export function isItemRaceError(error: unknown): boolean {
  return error instanceof StackRaceError || isUniqueConstraintError(error);
}

/**
 * Give `ownerId` `count` new items of `kind` in `location`, inside the
 * caller's transaction. A stackable kind tops up the stacks already there
 * before taking free slots; any other kind takes one free slot (count 1).
 * Returns the rows that now hold them, or null when they don't all fit, in
 * which case nothing was written.
 */
export async function addItems(
  tx: Prisma.TransactionClient,
  ownerId: string,
  location: ItemLocation,
  kind: ItemKind,
  count: number,
  extra: { color?: string | null } = {},
): Promise<Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }>[] | null> {
  if (!ITEM_CATALOG[kind].stackable && count !== 1) {
    throw new Error(`addItems: ${kind} doesn't stack, so it can't come ${count} at a time`);
  }
  const stacks = ITEM_CATALOG[kind].stackable
    ? await tx.item.findMany({
        where: { ownerId, location, kind, quantity: { lt: MAX_STACK } },
        select: { id: true, quantity: true },
        orderBy: { slot: "asc" },
      })
    : [];
  const plan = planStackAdd(stacks, await freeSlots(tx, ownerId, location), count);
  if (!plan) return null;

  const ids: string[] = [];
  for (const { id, add } of plan.topUps) {
    // Guarded on the room still being there, so a concurrent top-up can't
    // push a stack past MAX_STACK (the check constraint would also refuse).
    const grown = await tx.item.updateMany({
      where: { id, ownerId, location, quantity: { lte: MAX_STACK - add } },
      data: { quantity: { increment: add } },
    });
    if (grown.count !== 1) throw new StackRaceError();
    ids.push(id);
  }
  for (const { slot, quantity } of plan.newStacks) {
    const created = await tx.item.create({
      data: { id: uuidv4(), ownerId, location, kind, slot, quantity, color: extra.color ?? null },
      select: { id: true },
    });
    ids.push(created.id);
  }
  return tx.item.findMany({
    where: { id: { in: ids } },
    select: ITEM_SELECT,
    orderBy: { slot: "asc" },
  });
}

/**
 * Take one item off a stack in the caller's transaction: a stack of several
 * shrinks by one, a single item's row goes. Guarded on the item still being
 * `ownerId`'s and in `location`. Returns whether one was taken.
 */
export async function takeOne(
  tx: Prisma.TransactionClient,
  ownerId: string,
  itemId: string,
  location: ItemLocation,
): Promise<boolean> {
  const shrunk = await tx.item.updateMany({
    where: { id: itemId, ownerId, location, quantity: { gt: 1 } },
    data: { quantity: { decrement: 1 } },
  });
  if (shrunk.count === 1) return true;
  const gone = await tx.item.deleteMany({
    where: { id: itemId, ownerId, location, quantity: 1 },
  });
  return gone.count === 1;
}

export type MoveOutcome =
  | { outcome: "moved"; item: Prisma.ItemGetPayload<{ select: typeof ITEM_SELECT }> }
  | { outcome: "full" }
  | { outcome: "slot_taken" }
  | { outcome: "gone" };

/**
 * Move one of `ownerId`'s own items from one of their locations to another
 * (mailbox or desk into pockets, pockets into the desk). Lands in `slot` when
 * given, else the lowest free one. The item itself moves, so nothing is ever
 * copied, and `from`/`placed_at` ride along untouched.
 *
 * The write is guarded on the item still sitting in `from`, so a concurrent
 * double move can't move it twice. Two moves racing for the same destination
 * slot trip `@@unique([ownerId, location, slot])`: that P2002 propagates, and
 * callers answer it with a 409 (see isUniqueConstraintError).
 */
export async function moveOwnItem(
  ownerId: string,
  itemId: string,
  from: ItemLocation,
  to: ItemLocation,
  slot?: number,
): Promise<MoveOutcome> {
  return prisma.$transaction(async (tx): Promise<MoveOutcome> => {
    const source = await tx.item.findFirst({
      where: { id: itemId, ownerId, location: from },
      select: { kind: true, quantity: true },
    });
    if (!source) return { outcome: "gone" };
    if (isItemKind(source.kind) && ITEM_CATALOG[source.kind].stackable) {
      return moveStack(tx, ownerId, itemId, { from, to, slot }, source.kind, source.quantity);
    }

    let target: number | null;
    if (slot === undefined) {
      target = await firstFreeSlot(tx, ownerId, to);
      if (target === null) return { outcome: "full" };
    } else {
      const occupant = await tx.item.findFirst({
        where: { ownerId, location: to, slot },
        select: { id: true },
      });
      if (occupant) return { outcome: "slot_taken" };
      target = slot;
    }

    const moved = await tx.item.updateMany({
      where: { id: itemId, ownerId, location: from },
      data: { location: to, slot: target },
    });
    if (moved.count !== 1) return { outcome: "gone" };

    const item = await tx.item.findUniqueOrThrow({ where: { id: itemId }, select: ITEM_SELECT });
    return { outcome: "moved", item };
  });
}

/**
 * moveOwnItem for a whole stack: it merges into the stacks already at the
 * destination, and only takes a slot (the chosen one, else the lowest free)
 * for what doesn't fit. The source row is moved (when some is left over) or
 * deleted (when it merged entirely), guarded on its quantity being unchanged.
 */
async function moveStack(
  tx: Prisma.TransactionClient,
  ownerId: string,
  itemId: string,
  { from, to, slot }: { from: ItemLocation; to: ItemLocation; slot?: number },
  kind: ItemKind,
  quantity: number,
): Promise<MoveOutcome> {
  const stacks = await tx.item.findMany({
    where: { ownerId, location: to, kind, quantity: { lt: MAX_STACK } },
    select: { id: true, quantity: true },
    orderBy: { slot: "asc" },
  });
  const free = await freeSlots(tx, ownerId, to);
  const room = slot === undefined ? free : free.filter((s) => s === slot);
  const plan = planStackAdd(stacks, room, quantity);
  if (!plan) return { outcome: slot === undefined ? "full" : "slot_taken" };
  // A stack holds at most MAX_STACK, so whatever doesn't merge fits one slot.
  if (plan.newStacks.length > 1) throw new Error("moveStack: a stack can't need two new slots");

  for (const { id, add } of plan.topUps) {
    const grown = await tx.item.updateMany({
      where: { id, ownerId, location: to, quantity: { lte: MAX_STACK - add } },
      data: { quantity: { increment: add } },
    });
    if (grown.count !== 1) throw new StackRaceError();
  }
  const rest = plan.newStacks[0];
  const left = rest
    ? await tx.item.updateMany({
        where: { id: itemId, ownerId, location: from, quantity },
        data: { location: to, slot: rest.slot, quantity: rest.quantity },
      })
    : await tx.item.deleteMany({ where: { id: itemId, ownerId, location: from, quantity } });
  if (left.count !== 1) throw new StackRaceError();

  const landedId = rest ? itemId : plan.topUps[0].id;
  const item = await tx.item.findUniqueOrThrow({ where: { id: landedId }, select: ITEM_SELECT });
  return { outcome: "moved", item };
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
    gathering_id: row.gatheringId,
    color: isFlowerColor(row.color) ? row.color : null,
    quantity: row.quantity,
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
