// Pockets and Notebook domain types — the API's snake_case wire shapes.

import type { ItemKind } from "@/lib/items";

/** One item in a member's pockets, as listed by GET /api/pockets. */
export interface PocketItem {
  id: string;
  kind: ItemKind;
  slot: number;
  body: string | null;
}

/** One draft page in a member's Notebook. */
export interface NotebookPageDraft {
  id: string;
  page: number;
  body: string;
  updated_at: string;
}

/** Which dialogue branch POST /api/npcs/[npc]/talk landed on. */
export type NpcTalkState = "gift" | "after" | "pockets_full" | "chat";

export interface NpcTalkResult {
  state: NpcTalkState;
  item?: PocketItem;
}
