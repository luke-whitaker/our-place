// Pockets and Notebook domain types — the API's snake_case wire shapes.

import type { ItemKind } from "@/lib/items";

/** One item in a member's pockets or mailbox. Mailbox letters use the same
 * wire shape as pocket items; `slot` then indexes the mailbox's 20. */
export interface PocketItem {
  id: string;
  kind: ItemKind;
  slot: number;
  body: string | null;
  /** Who put it in a mailbox; null for a note you tore out yourself. */
  from: { username: string; display_name: string } | null;
  /** When it landed in a mailbox (ISO 8601); null if it never has. */
  placed_at: string | null;
}

/** GET /api/users/[username]/mailbox: whether a mailbox holds any mail. */
export interface MailboxStatus {
  has_mail: boolean;
}

/** GET /api/mailbox: the caller's own mailbox contents. */
export interface MailboxContents {
  letters: PocketItem[];
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
