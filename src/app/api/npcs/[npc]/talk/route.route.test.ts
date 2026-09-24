import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, createTestItem } from "@/test/route-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

async function talk(npc: string) {
  return POST(new Request(`http://localhost/api/npcs/${npc}/talk`, { method: "POST" }), {
    params: Promise.resolve({ npc }),
  });
}

describe("POST /api/npcs/[npc]/talk", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("gives Gnomie's Notebook once, then only chats after", async () => {
    authAs(await createTestUser());

    const first = await talk("gnomie");
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.state).toBe("gift");
    expect(firstBody.item).toMatchObject({ kind: "notebook", slot: 0, body: null });

    const second = await talk("gnomie");
    expect(second.status).toBe(200);
    expect((await second.json()).state).toBe("after");
  });

  it("reports pockets_full without writing a gift row, then still gives it once there's room", async () => {
    const user = await createTestUser();
    authAs(user);
    for (let slot = 0; slot < 10; slot++) {
      await createTestItem({ ownerId: user.userId, kind: "note", slot });
    }

    const full = await talk("gnomie");
    expect(full.status).toBe(200);
    expect((await full.json()).state).toBe("pockets_full");
    expect(await prisma.npcGift.findFirst({ where: { userId: user.userId } })).toBeNull();

    // Free a slot and try again — the earlier refusal must not have spent
    // the one-time gift.
    const occupant = await prisma.item.findFirstOrThrow({
      where: { ownerId: user.userId, slot: 0 },
    });
    await prisma.item.delete({ where: { id: occupant.id } });

    const retry = await talk("gnomie");
    expect(retry.status).toBe(200);
    expect((await retry.json()).state).toBe("gift");
  });

  it("only chats for gnomette, who has no gift yet", async () => {
    authAs(await createTestUser());

    const res = await talk("gnomette");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "chat" });
  });

  it("returns 404 for an npc that doesn't exist", async () => {
    authAs(await createTestUser());

    const res = await talk("nobody");
    expect(res.status).toBe(404);
  });
});
