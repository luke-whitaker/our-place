// What each NPC says. Pure content, kept apart from npcs.ts (which is server
// code: gating and granting the gift) and from the engine (which only needs
// an id, a tile, and a facing — see WorldNpc in types.ts). WorldDialogue.tsx
// turns this into the lines it shows; the gift's icon and name come from
// ITEM_CATALOG at render time via the PocketItem the talk API returns, so the
// system line never hard-codes a second copy of what the notebook is called.

import type { NpcId } from "@/lib/npcs";
import type { NpcTalkState } from "@/lib/types";

/** One line of dialogue: a spoken line, one spoken at random from a small
 * pool (so a repeat visit doesn't read identically every time), or the
 * "system" line reporting the gift — filled in by the caller from the actual
 * granted item, not authored here. */
export type DialogueLine =
  | { kind: "say"; text: string }
  | { kind: "say-random"; options: readonly string[] }
  | { kind: "system" };

export interface NpcDialogue {
  name: string;
  /** World-asset path to this NPC's standing-frame sheet. */
  sheet: string;
  /** Lines per talk state this NPC can actually produce; a state absent here
   * falls back to dialogueLinesFor's single generic line. */
  lines: Partial<Record<NpcTalkState, readonly DialogueLine[]>>;
  /** What the NPC says to someone who isn't logged in. The Capital and the
   * community rooms are public, but talking reaches a members-only API, so a
   * visitor gets these lines without a request (which would bounce them to
   * the login page mid-world). */
  visitor: readonly DialogueLine[];
}

const FALLBACK_LINE = (name: string): DialogueLine => ({
  kind: "say",
  text: `${name} doesn't seem to have anything to say about that.`,
});

export const NPC_DIALOGUE: Record<NpcId, NpcDialogue> = {
  gnomie: {
    name: "Gnomie",
    sheet: "/world/characters/gnomie.png",
    lines: {
      gift: [
        { kind: "say", text: "Oh! A new face. Welcome, welcome. I'm Gnomie." },
        { kind: "say", text: "I keep notebooks for folks who've just arrived. This one's yours." },
        { kind: "system" },
        {
          kind: "say",
          text: "Its pages never run out. Write to someone you know, and before long you'll be able to leave the page in their mailbox.",
        },
        { kind: "say", text: "Nothing beats hearing from a friend." },
      ],
      after: [
        {
          kind: "say",
          text: "How's that notebook treating you? Somebody out there would love a letter.",
        },
      ],
      pockets_full: [
        { kind: "say", text: "Oh! A new face. Welcome, welcome. I'm Gnomie." },
        {
          kind: "say",
          text: "Oops! Looks like your pockets are too full. Maybe go back to your island, lighten your load, and come back so I can give you my gift.",
        },
      ],
    },
    visitor: [
      { kind: "say", text: "Oh! A visitor. Welcome, welcome. I'm Gnomie." },
      {
        kind: "say",
        text: "I keep a little something for every member. Come back once you've logged in.",
      },
    ],
  },
  gnomette: {
    name: "Gnomette",
    sheet: "/world/characters/gnomette.png",
    lines: {
      chat: [
        { kind: "say", text: "Oh! You found me. I'm Gnomette." },
        {
          kind: "say-random",
          options: [
            "I come here to listen to the pond. On quiet days it hums.",
            "Did you know the ripples here are never the same twice? I've checked.",
            "The frogs owe me a song. They're taking their time.",
          ],
        },
        {
          kind: "say",
          text: "I'm keeping something small and very patient for you. It isn't ready yet. Come back and see me soon.",
        },
      ],
    },
    visitor: [
      { kind: "say", text: "Oh! You found me. I'm Gnomette." },
      { kind: "say", text: "My pond stories are for members. Log in and come find me again." },
    ],
  },
};

/** The lines to show for one NPC's talk result. Never empty: a state the
 * catalog above has nothing for (defensive — the server only ever answers
 * with states an NPC can actually produce) still gets one sensible line. */
export function dialogueLinesFor(npcId: NpcId, state: NpcTalkState): readonly DialogueLine[] {
  const dialogue = NPC_DIALOGUE[npcId];
  return dialogue.lines[state] ?? [FALLBACK_LINE(dialogue.name)];
}
