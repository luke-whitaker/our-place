import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { presenceHub, type PresenceEvent } from "@/lib/presence";
import { parseWorldId } from "@/lib/presence-access";
import { POST } from "./route";

// requireAuth reads cookies via next/headers, which doesn't exist outside a
// real Next request, so each test chooses the caller.
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function move(worldId: string, col = 3, row = 4) {
  return POST(
    jsonRequest("/api/presence", { world_id: worldId, col, row, dir: "SE", moving: true }),
  );
}

async function setIsland(userId: string, islandVisibility: string) {
  await prisma.user.update({ where: { id: userId }, data: { islandVisibility } });
}

describe("POST /api/presence", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("returns 401 when not logged in", async () => {
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await move("capital")).status).toBe(401);
  });

  it("returns 400 for a world id no world uses", async () => {
    actAs(await createTestUser());
    for (const bad of ["somewhere", "island:not-a-uuid", "../capital"]) {
      expect((await move(bad)).status).toBe(400);
    }
  });

  it("places the caller in a public world and tells the others there", async () => {
    const ann = await createTestUser({ displayName: "Ann" });
    const heard: { event: PresenceEvent; data: unknown }[] = [];
    const sub = presenceHub().subscribe({
      userId: "listener",
      worldId: "music-inside",
      send: (event, data) => heard.push({ event, data }),
    });
    actAs(ann);

    const res = await move("music-inside", 7, 8);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(heard.at(-1)).toEqual({
      event: "update",
      data: expect.objectContaining({ user_id: ann.userId, display_name: "Ann", col: 7, row: 8 }),
    });
    if (sub.ok) sub.unsubscribe();
  });

  it("refuses a closed island with the island gate's own words", async () => {
    const owner = await createTestUser({ displayName: "Bea" });
    await setIsland(owner.userId, "nobody");
    actAs(await createTestUser());

    const res = await move(`island:${owner.userId}:inside`);

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Bea's island is closed to visitors.");
  });

  it("lets a friend onto a friends-only island, and nobody else", async () => {
    const owner = await createTestUser();
    await setIsland(owner.userId, "friends");
    const friend = await createTestUser();
    await prisma.friendship.create({
      data: { userId: owner.userId, friendId: friend.userId, status: "accepted" },
    });

    actAs(friend);
    expect((await move(`island:${owner.userId}`)).status).toBe(200);
    actAs(await createTestUser());
    expect((await move(`island:${owner.userId}`)).status).toBe(403);
  });
});

describe("parseWorldId", () => {
  it("knows the Capital, community rooms, islands, and houses", () => {
    const id = "0b9f3c1e-2a4d-4e8f-9c7b-1d2e3f4a5b6c";
    expect(parseWorldId("capital")).toEqual({ kind: "public" });
    expect(parseWorldId("welcome-center-inside")).toEqual({ kind: "public" });
    expect(parseWorldId(`island:${id}`)).toEqual({ kind: "island", ownerId: id });
    expect(parseWorldId(`island:${id}:inside`)).toEqual({ kind: "island", ownerId: id });
    expect(parseWorldId("-inside")).toBeNull();
    expect(parseWorldId(`island:${id}:attic`)).toBeNull();
  });
});
