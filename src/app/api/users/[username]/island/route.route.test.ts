import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser } from "@/test/route-helpers";
import { GET } from "./route";

// requireAuth reads cookies via next/headers, which doesn't work outside a
// real Next request, so the viewer is chosen per test instead.
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function viewAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

async function visit(username: string) {
  const request = new NextRequest(new URL(`http://localhost/api/users/${username}/island`));
  const res = await GET(request, { params: Promise.resolve({ username }) });
  return { status: res.status, body: await res.json() };
}

async function setIsland(userId: string, islandVisibility: string, biome = "autumn") {
  await prisma.user.update({ where: { id: userId }, data: { islandVisibility, biome } });
}

async function befriend(userId: string, friendId: string) {
  await prisma.friendship.create({ data: { userId, friendId, status: "accepted" } });
}

describe("GET /api/users/[username]/island", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 404 for a member who doesn't exist", async () => {
    viewAs(await createTestUser());
    const { status, body } = await visit("nobody-here");
    expect(status).toBe(404);
    expect(body.error).toBe("This person doesn't exist.");
  });

  it("describes an open island to anyone, with the owner's biome", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "anyone", "snow");
    viewAs(await createTestUser());

    const { status, body } = await visit(owner.username.toUpperCase());
    expect(status).toBe(200);
    expect(body).toEqual({
      owner: { id: owner.userId, username: owner.username, display_name: "Ada" },
      biome: "snow",
    });
  });

  it("keeps a friends-only island from strangers but not from accepted friends", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "friends");
    const stranger = await createTestUser();
    const friend = await createTestUser();
    await befriend(friend.userId, owner.userId);

    viewAs(stranger);
    const refused = await visit(owner.username);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe("Ada's island is open to friends only.");

    viewAs(friend);
    expect((await visit(owner.username)).status).toBe(200);
  });

  it("closes an island to everyone but its owner when visibility is nobody", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "nobody");
    const friend = await createTestUser();
    await befriend(owner.userId, friend.userId);

    viewAs(friend);
    const refused = await visit(owner.username);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toBe("Ada's island is closed to visitors.");

    viewAs(owner);
    expect((await visit(owner.username)).status).toBe(200);
  });

  it("does not count a pending request as friendship", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "friends");
    const hopeful = await createTestUser();
    await prisma.friendship.create({
      data: { userId: hopeful.userId, friendId: owner.userId, status: "pending" },
    });

    viewAs(hopeful);
    expect((await visit(owner.username)).status).toBe(403);
  });
});
