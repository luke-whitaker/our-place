// The NPC roster and their one-time gifts. Dialogue text belongs to the
// world client, not here — this is only what the server needs to gate and
// grant a gift.

import type { ItemKind } from "@/lib/items";

export type NpcId = "gnomie" | "gnomette";

export function isNpcId(value: unknown): value is NpcId {
  return value === "gnomie" || value === "gnomette";
}

/** The one-time gift each NPC hands over on first talk, keyed by a stable
 * gift id (stored in npc_gifts so it's only ever given once). Null means the
 * NPC only chats for now — Gnomette's gift arrives in a later step. */
export const NPC_GIFTS: Record<NpcId, { giftId: string; kind: ItemKind } | null> = {
  gnomie: { giftId: "gnomie-notebook", kind: "notebook" },
  gnomette: null,
};
