import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { presenceHub, type PresenceEvent } from "@/lib/presence";
import { POST } from "./route";

// requireAuth reads cookies via next/headers, which doesn't exist outside a
// real Next request, so each test chooses the caller.
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function emote(worldId: string, which = "heart") {
  return POST(jsonRequest("/api/presence/emote", { world_id: worldId, emote: which }));
}

function arrive(userId: string, worldId: string) {
  presenceHub().move(
    userId,
    worldId,
    { col: 1, row: 1, dir: "S", moving: false },
    { username: "u", display_name: "U", avatar: null, ghost: false },
  );
}

describe("POST /api/presence/emote", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("returns 401 when not logged in", async () => {
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await emote("capital")).status).toBe(401);
  });

  it("returns 400 for a bad world id or an emote that doesn't exist", async () => {
    actAs(await createTestUser());
    expect((await emote("the-moon")).status).toBe(400);
    expect((await emote("capital", "wave")).status).toBe(400);
  });

  it("shows the emote to others in the world", async () => {
    const ann = await createTestUser();
    arrive(ann.userId, "capital");
    const heard: { event: PresenceEvent; data: unknown }[] = [];
    const sub = presenceHub().subscribe({
      userId: "listener",
      worldId: "capital",
      send: (event, data) => heard.push({ event, data }),
    });
    actAs(ann);

    expect((await emote("capital", "sparkle")).status).toBe(200);
    expect(heard.at(-1)?.data).toEqual(
      expect.objectContaining({ user_id: ann.userId, emote: "sparkle" }),
    );
    if (sub.ok) sub.unsubscribe();
  });

  it("returns 409 for a member who hasn't stepped into that world", async () => {
    actAs(await createTestUser());
    expect((await emote("capital")).status).toBe(409);
  });

  it("refuses a closed island, and lets a friend emote on a friends-only one", async () => {
    const owner = await createTestUser();
    await prisma.user.update({
      where: { id: owner.userId },
      data: { islandVisibility: "nobody" },
    });
    actAs(await createTestUser());
    expect((await emote(`island:${owner.userId}`)).status).toBe(403);

    const host = await createTestUser();
    await prisma.user.update({
      where: { id: host.userId },
      data: { islandVisibility: "friends" },
    });
    const friend = await createTestUser();
    await prisma.friendship.create({
      data: { userId: friend.userId, friendId: host.userId, status: "accepted" },
    });
    arrive(friend.userId, `island:${host.userId}`);
    actAs(friend);
    expect((await emote(`island:${host.userId}`)).status).toBe(200);
  });
});
