// The item catalog: what a pocket slot can hold. Shared by the server (which
// validates a stored `kind` against it) and the world client (which reads
// name/icon/discardable to render pockets and the throw-away action).

/** A member's 10 pocket slots, indexed 0-9. */
export const POCKET_SLOTS = 10;

/** A mailbox's 20 slots, indexed 0-19 — twice the pockets, so emptying a
 * full mailbox takes at most two trips. */
export const MAILBOX_SLOTS = 20;

/** A house desk's 100 slots, indexed 0-99, shown as 10 pages of 10. */
export const DESK_SLOTS = 100;

/** How many desk slots one page of the desk panel shows. */
export const DESK_PAGE_SLOTS = 10;

/** A Notebook has 10 pages, indexed 0-9 — the draft cap. */
export const NOTEBOOK_PAGES = 10;

/** The longest a single draft or torn-out Note's body may be. */
export const NOTE_MAX_CHARS = 1000;

export type ItemKind = "notebook" | "note" | "event_mushroom" | "seed" | "flower";

/** Where an item currently sits. Stored as a plain string validated in code,
 * like `kind`, so a new location needs no migration. */
export type ItemLocation = "pocket" | "mailbox" | "desk" | "head";

/** What a member wears on their head: one flower at a time. */
export const HEAD_SLOTS = 1;

/** Slot capacity per location, indexed 0..N-1. */
export const LOCATION_SLOTS: Record<ItemLocation, number> = {
  pocket: POCKET_SLOTS,
  mailbox: MAILBOX_SLOTS,
  desk: DESK_SLOTS,
  head: HEAD_SLOTS,
};

/** `icon` is a root-relative world-art path: render it through `worldAsset()`,
 * or production asks the app's own origin for art that only lives on R2. */
export const ITEM_CATALOG: Record<
  ItemKind,
  {
    name: string;
    icon: string;
    discardable: boolean;
    mailable: boolean;
    deskable: boolean;
    /** Many share one slot, counted by `items.quantity` (at most MAX_STACK). */
    stackable: boolean;
  }
> = {
  notebook: {
    name: "Notebook",
    icon: "/world/items/notebook.png",
    discardable: false,
    mailable: false,
    deskable: true,
    stackable: false,
  },
  note: {
    name: "Note",
    icon: "/world/items/note.png",
    discardable: true,
    mailable: true,
    deskable: true,
    stackable: false,
  },
  // A world gathering's mushroom (its `gathering_id` says which). It arrives in
  // the host's mailbox and is planted from pockets. It can't go in the desk,
  // be mailed, or be thrown away, so it is always somewhere the host can take
  // it from; cancelling the gathering removes it.
  event_mushroom: {
    name: "Event Mushroom",
    icon: "/world/items/event_mushroom.png",
    discardable: false,
    mailable: false,
    deskable: false,
    stackable: false,
  },
  // Gnomette gives the first five; after that, a plant grown from a seed gives
  // one back the first time its flower is picked (src/lib/plants.ts).
  seed: {
    name: "Seed",
    icon: "/world/items/seed.png",
    discardable: true,
    mailable: true,
    deskable: true,
    stackable: true,
  },
  // A flower carries its color on the item (`items.color`); its icon is the
  // one for that color (itemIcon below), this one only a fallback.
  flower: {
    name: "Flower",
    icon: "/world/items/flower_red.png",
    discardable: true,
    mailable: true,
    deskable: true,
    stackable: false,
  },
};

/** The most of one stackable kind a single slot holds. Matches the
 * `items_quantity_range` check constraint. */
export const MAX_STACK = 99;

/** What to call an item: "Pink flower" for a flower, "5 seeds" for a stack,
 * else its kind's name. */
export function itemName(item: {
  kind: ItemKind;
  color?: string | null;
  quantity?: number;
}): string {
  if (item.kind === "flower" && item.color) {
    return `${item.color[0].toUpperCase()}${item.color.slice(1)} flower`;
  }
  const name = ITEM_CATALOG[item.kind].name;
  const quantity = item.quantity ?? 1;
  return quantity > 1 ? `${quantity} ${name.toLowerCase()}s` : name;
}

/** Where `count` more of a stackable kind would go: topped up into the
 * existing stacks first (in the order given), then into new stacks in free
 * slots. Null when they don't all fit, so the caller adds nothing. */
export function planStackAdd(
  stacks: readonly { id: string; quantity: number }[],
  freeSlots: readonly number[],
  count: number,
): {
  topUps: { id: string; add: number }[];
  newStacks: { slot: number; quantity: number }[];
} | null {
  if (!Number.isInteger(count) || count < 1) return null;
  let left = count;
  const topUps: { id: string; add: number }[] = [];
  for (const stack of stacks) {
    if (left === 0) break;
    const add = Math.min(MAX_STACK - stack.quantity, left);
    if (add > 0) {
      topUps.push({ id: stack.id, add });
      left -= add;
    }
  }
  const newStacks: { slot: number; quantity: number }[] = [];
  for (const slot of freeSlots) {
    if (left === 0) break;
    const quantity = Math.min(MAX_STACK, left);
    newStacks.push({ slot, quantity });
    left -= quantity;
  }
  return left === 0 ? { topUps, newStacks } : null;
}

/** The icon to show for one item: a flower's own color, else its kind's. */
export function itemIcon(item: { kind: ItemKind; color?: string | null }): string {
  if (item.kind === "flower" && item.color) return `/world/items/flower_${item.color}.png`;
  return ITEM_CATALOG[item.kind].icon;
}

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === "string" && value in ITEM_CATALOG;
}
