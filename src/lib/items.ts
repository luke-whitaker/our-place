// The item catalog: what a pocket slot can hold. Shared by the server (which
// validates a stored `kind` against it) and the world client (which reads
// name/icon/discardable to render pockets and the throw-away action).

/** A member's 10 pocket slots, indexed 0-9. */
export const POCKET_SLOTS = 10;

/** A Notebook has 10 pages, indexed 0-9 — the draft cap. */
export const NOTEBOOK_PAGES = 10;

/** The longest a single draft or torn-out Note's body may be. */
export const NOTE_MAX_CHARS = 1000;

export type ItemKind = "notebook" | "note";

export const ITEM_CATALOG: Record<ItemKind, { name: string; icon: string; discardable: boolean }> =
  {
    notebook: { name: "Notebook", icon: "/world/items/notebook.png", discardable: false },
    note: { name: "Note", icon: "/world/items/note.png", discardable: true },
  };

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === "string" && value in ITEM_CATALOG;
}
