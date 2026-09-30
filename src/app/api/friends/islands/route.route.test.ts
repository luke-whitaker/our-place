import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload, FriendIsland } from "@/lib/types";
import { createTestUser } from "@/test/route-helpers";
import { GET } from "./route";

// requireAuth reads cookies via next/headers, which doesn't work outside a
// real Next request, so the caller is chosen per test instead.
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

async function listAs(user: AuthPayload): Promise<FriendIsland[]> {
  mockRequireAuth.mockResolvedValue({ user });
  const res = await GET();
  expect(res.status).toBe(200);
  return (await res.json()).islands;
}

async function member(displayName: string, islandVisibility = "friends") {
  const user = await createTestUser({ displayName });
  await prisma.user.update({ where: { id: user.userId }, data: { islandVisibility } });
  return user;
}

async function befriend(from: AuthPayload, to: AuthPayload, status = "accepted") {
  await prisma.friendship.create({ data: { userId: from.userId, friendId: to.userId, status } });
}

describe("GET /api/friends/islands", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("lists friends from either side of the friendship, by name", async () => {
    const me = await member("Me");
    const zoe = await member("Zoe");
    const ada = await member("Ada");
    await befriend(me, zoe); // I asked
    await befriend(ada, me); // they asked

    const islands = await listAs(me);
    expect(islands).toEqual([
      { username: ada.username, display_name: "Ada" },
      { username: zoe.username, display_name: "Zoe" },
    ]);
  });

  it("includes open and friends-only islands but never a closed one", async () => {
    const me = await member("Me");
    const open = await member("Open", "anyone");
    const friendsOnly = await member("Friends only", "friends");
    const closed = await member("Closed", "nobody");
    for (const friend of [open, friendsOnly, closed]) await befriend(me, friend);

    const names = (await listAs(me)).map((i) => i.display_name);
    expect(names).toEqual(["Friends only", "Open"]);
  });

  it("leaves out pending requests and people who aren't friends", async () => {
    const me = await member("Me");
    const asked = await member("Asked");
    const askedMe = await member("Asked me");
    await member("Stranger", "anyone");
    await befriend(me, asked, "pending");
    await befriend(askedMe, me, "pending");

    expect(await listAs(me)).toEqual([]);
  });

  it("refuses a logged-out caller", async () => {
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
