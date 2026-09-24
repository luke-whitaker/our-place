import { describe, it, expect } from "vitest";
import { NPC_DIALOGUE, dialogueLinesFor } from "./npc-dialogue";
import { NPC_GIFTS } from "@/lib/npcs";
import type { NpcId } from "@/lib/npcs";
import type { NpcTalkState } from "@/lib/types";

/** Every state the server can actually answer for a given NPC (see
 * src/app/api/npcs/[npc]/talk/route.ts): an NPC with a gift can answer
 * "gift", "after", or "pockets_full"; one without answers only "chat". */
function statesFor(npcId: NpcId): NpcTalkState[] {
  return NPC_GIFTS[npcId] ? ["gift", "after", "pockets_full"] : ["chat"];
}

describe("NPC_DIALOGUE", () => {
  it("names every NPC and points at its own sheet", () => {
    for (const npcId of Object.keys(NPC_GIFTS) as NpcId[]) {
      const dialogue = NPC_DIALOGUE[npcId];
      expect(dialogue).toBeDefined();
      expect(dialogue.name.length).toBeGreaterThan(0);
      expect(dialogue.sheet).toMatch(/^\/world\/characters\/.+\.png$/);
    }
  });

  it("has at least one line for every state each NPC can actually get", () => {
    for (const npcId of Object.keys(NPC_GIFTS) as NpcId[]) {
      for (const state of statesFor(npcId)) {
        const lines = dialogueLinesFor(npcId, state);
        expect(lines.length, `${npcId}/${state}`).toBeGreaterThan(0);
      }
    }
  });

  it("gives Gnomie's gift lines exactly one system line, for the granted item", () => {
    const lines = dialogueLinesFor("gnomie", "gift");
    expect(lines.filter((l) => l.kind === "system")).toHaveLength(1);
  });

  it("falls back to one sensible line for a state an NPC can't produce", () => {
    // Gnomette has no gift, so she can never actually get "gift" — the
    // catalog still answers something rather than crashing.
    const lines = dialogueLinesFor("gnomette", "gift");
    expect(lines).toHaveLength(1);
    expect(lines[0].kind).toBe("say");
  });

  it("greets a logged-out visitor with spoken lines and no gift", () => {
    // The Capital and the rooms are public; a visitor gets these without a
    // members-only request, so a gift (system) line could never be filled.
    for (const npc of Object.values(NPC_DIALOGUE)) {
      expect(npc.visitor.length).toBeGreaterThan(0);
      expect(npc.visitor.every((line) => line.kind === "say")).toBe(true);
    }
  });

  it("resolves a say-random line to one of its own options", () => {
    const chat = NPC_DIALOGUE.gnomette.lines.chat;
    const randomLine = chat?.find((l) => l.kind === "say-random");
    expect(randomLine?.kind).toBe("say-random");
    if (randomLine?.kind === "say-random") {
      expect(randomLine.options.length).toBeGreaterThan(1);
    }
  });
});
