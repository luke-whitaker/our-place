// The item catalog: what a pocket slot can hold. Shared by the server (which
// validates a stored `kind` against it) and the world client (which reads
// name/icon/discardable to render pockets and the throw-away action).

/** A member's 10 pocket slots, indexed 0-9. */
export const POCKET_SLOTS = 10;

/** A mailbox's 20 slots, indexed 0-19 — twice the pockets, so emptying a
 * full mailbox takes at most two trips. */
export const MAILBOX_SLOTS = 20;

/** A Notebook has 10 pages, indexed 0-9 — the draft cap. */
export const NOTEBOOK_PAGES = 10;

/** The longest a single draft or torn-out Note's body may be. */
export const NOTE_MAX_CHARS = 1000;

export type ItemKind = "notebook" | "note";

/** Where an item currently sits. A house desk joins later, so this stays a
 * string validated in code, like `kind`. */
export type ItemLocation = "pocket" | "mailbox";

/** Slot capacity per location, indexed 0..N-1. */
export const LOCATION_SLOTS: Record<ItemLocation, number> = {
  pocket: POCKET_SLOTS,
  mailbox: MAILBOX_SLOTS,
};

export const ITEM_CATALOG: Record<
  ItemKind,
  { name: string; icon: string; discardable: boolean; mailable: boolean }
> = {
  notebook: {
    name: "Notebook",
    icon: "/world/items/notebook.png",
    discardable: false,
    mailable: false,
  },
  note: { name: "Note", icon: "/world/items/note.png", discardable: true, mailable: true },
};

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === "string" && value in ITEM_CATALOG;
}
