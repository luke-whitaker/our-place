import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import {
  createTestUser,
  createTestItem,
  createTestLetter,
  giveTestNotebook,
  jsonRequest,
} from "@/test/route-helpers";
import { GET, POST } from "./route";
import { GET as pocketsGet } from "@/app/api/pockets/route";

// requireAuth reads cookies via next/headers, which doesn't work outside a
// real Next request, so the caller is chosen per test instead.
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function unauthenticated() {
  mockRequireAuth.mockResolvedValue({
    error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
  });
}

function status(username: string) {
  return GET(new Request(`http://localhost/api/users/${username}/mailbox`), {
    params: Promise.resolve({ username }),
  });
}

function leave(username: string, itemId: string) {
  return POST(jsonRequest(`http://localhost/api/users/${username}/mailbox`, { item_id: itemId }), {
    params: Promise.resolve({ username }),
  });
}

async function setIsland(userId: string, islandVisibility: string) {
  await prisma.user.update({ where: { id: userId }, data: { islandVisibility } });
}

async function befriend(userId: string, friendId: string) {
  await prisma.friendship.create({ data: { userId, friendId, status: "accepted" } });
}

describe("POST /api/users/[username]/mailbox", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 401 when not logged in", async () => {
    unauthenticated();
    const res = await leave("someone", uuidv4());
    expect(res.status).toBe(401);
  });

  it("returns 404 for a member who doesn't exist", async () => {
    authAs(await createTestUser());
    const res = await leave("nobody-here", uuidv4());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("This person doesn't exist.");
  });

  it("refuses to leave a letter in your own mailbox", async () => {
    const owner = await createTestUser();
    authAs(owner);

    const res = await leave(owner.username, uuidv4());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "That's your own mailbox. Visit a friend's island to leave them a letter.",
    );
  });

  it("keeps a friends-only island from a stranger leaving mail", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "friends");
    const sender = await createTestUser();
    const itemId = await createTestItem({ ownerId: sender.userId, kind: "note", slot: 0 });
    authAs(sender);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Ada's island is open to friends only.");
  });

  it("closes the mailbox to everyone when the island visibility is nobody", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "nobody");
    const friend = await createTestUser();
    await befriend(friend.userId, owner.userId);
    const itemId = await createTestItem({ ownerId: friend.userId, kind: "note", slot: 0 });
    authAs(friend);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Ada's island is closed to visitors.");
  });

  it("lets a non-friend leave mail on an island open to anyone", async () => {
    const owner = await createTestUser();
    await setIsland(owner.userId, "anyone");
    const sender = await createTestUser();
    const itemId = await createTestItem({ ownerId: sender.userId, kind: "note", slot: 0 });
    authAs(sender);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(200);
  });

  it("returns 404 for someone else's item", async () => {
    const owner = await createTestUser();
    await setIsland(owner.userId, "anyone");
    const sender = await createTestUser();
    const other = await createTestUser();
    const itemId = await createTestItem({ ownerId: other.userId, kind: "note", slot: 0 });
    authAs(sender);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Item not found.");
  });

  it("returns 404 for an item already sitting in a mailbox", async () => {
    const owner = await createTestUser();
    await setIsland(owner.userId, "anyone");
    const sender = await createTestUser();
    const itemId = await createTestLetter({ ownerId: sender.userId, slot: 0 });
    authAs(sender);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Item not found.");
  });

  it("refuses the Notebook", async () => {
    const owner = await createTestUser();
    await setIsland(owner.userId, "anyone");
    const sender = await createTestUser();
    const itemId = await giveTestNotebook(sender.userId, 0);
    authAs(sender);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Only notes fit in a mailbox.");
  });

  it("refuses a 21st letter and leaves the sender's pockets untouched", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "anyone");
    for (let slot = 0; slot < 20; slot++) {
      await createTestLetter({ ownerId: owner.userId, slot });
    }
    const sender = await createTestUser();
    const itemId = await createTestItem({
      ownerId: sender.userId,
      kind: "note",
      slot: 0,
      body: "Mine.",
    });
    authAs(sender);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Ada's mailbox is full.");

    const stillMine = await prisma.item.findUnique({ where: { id: itemId } });
    expect(stillMine).toMatchObject({ ownerId: sender.userId, location: "pocket", slot: 0 });
  });

  it("moves the item to the recipient's mailbox, recording who sent it and when", async () => {
    const owner = await createTestUser();
    await setIsland(owner.userId, "anyone");
    const sender = await createTestUser({ displayName: "Sam" });
    const itemId = await createTestItem({
      ownerId: sender.userId,
      kind: "note",
      slot: 0,
      body: "Hi!",
    });
    authAs(sender);

    const res = await leave(owner.username, itemId);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Letter left.", has_mail: true });

    const moved = await prisma.item.findUnique({ where: { id: itemId } });
    expect(moved).not.toBeNull();
    expect(moved?.ownerId).toBe(owner.userId);
    expect(moved?.location).toBe("mailbox");
    expect(moved?.fromId).toBe(sender.userId);
    expect(moved?.placedAt).not.toBeNull();
    expect(moved?.slot).toBeGreaterThanOrEqual(0);
    expect(moved?.slot).toBeLessThan(20);

    const pocketsRes = await pocketsGet();
    expect((await pocketsRes.json()).items).toEqual([]);
  });
});

describe("GET /api/users/[username]/mailbox", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("reports no mail for an empty mailbox, then mail once a letter lands", async () => {
    const owner = await createTestUser();
    await setIsland(owner.userId, "anyone");
    const viewer = await createTestUser();
    authAs(viewer);

    const empty = await status(owner.username);
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ has_mail: false });

    await createTestLetter({ ownerId: owner.userId, slot: 0 });

    const full = await status(owner.username);
    expect(await full.json()).toEqual({ has_mail: true });
  });

  it("gates mailbox status the same as the island, but always lets the owner see it", async () => {
    const owner = await createTestUser({ displayName: "Ada" });
    await setIsland(owner.userId, "friends");
    await createTestLetter({ ownerId: owner.userId, slot: 0 });
    const stranger = await createTestUser();
    authAs(stranger);

    const refused = await status(owner.username);
    expect(refused.status).toBe(403);
    expect((await refused.json()).error).toBe("Ada's island is open to friends only.");

    authAs(owner);
    const allowed = await status(owner.username);
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({ has_mail: true });
  });
});
