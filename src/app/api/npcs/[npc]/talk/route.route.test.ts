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

  it("gives Gnomette's five seeds once, as one stack, then only chats after", async () => {
    const user = await createTestUser();
    authAs(user);

    const first = await talk("gnomette");
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.state).toBe("gift");
    expect(body.count).toBe(5);
    expect(body.item).toMatchObject({ kind: "seed", color: null, quantity: 5 });

    const second = await talk("gnomette");
    expect(await second.json()).toEqual({ state: "after" });
    const seeds = await prisma.item.findMany({
      where: { ownerId: user.userId, kind: "seed" },
      select: { quantity: true },
    });
    expect(seeds).toEqual([{ quantity: 5 }]);
  });

  it("adds Gnomette's seeds to a stack already in full pockets", async () => {
    const user = await createTestUser();
    authAs(user);
    await createTestItem({ ownerId: user.userId, kind: "seed", slot: 0, quantity: 2 });
    for (let slot = 1; slot < 10; slot++) {
      await createTestItem({ ownerId: user.userId, kind: "note", slot });
    }

    const res = await talk("gnomette");

    expect((await res.json()).item).toMatchObject({ kind: "seed", slot: 0, quantity: 7 });
  });

  it("keeps Gnomette's seeds when full pockets hold no seed stack with room", async () => {
    const user = await createTestUser();
    authAs(user);
    await createTestItem({ ownerId: user.userId, kind: "seed", slot: 0, quantity: 97 });
    for (let slot = 1; slot < 10; slot++) {
      await createTestItem({ ownerId: user.userId, kind: "note", slot });
    }

    expect((await (await talk("gnomette")).json()).state).toBe("pockets_full");
    const stack = await prisma.item.findFirstOrThrow({
      where: { ownerId: user.userId, kind: "seed" },
    });
    expect(stack.quantity).toBe(97);
    expect(await prisma.npcGift.findFirst({ where: { userId: user.userId } })).toBeNull();
  });

  it("returns 404 for an npc that doesn't exist", async () => {
    authAs(await createTestUser());

    const res = await talk("nobody");
    expect(res.status).toBe(404);
  });
});
