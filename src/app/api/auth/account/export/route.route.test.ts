import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestItem, createTestPost, createTestUser } from "@/test/route-helpers";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

async function exportMe() {
  const res = await GET();
  return { status: res.status, headers: res.headers, text: await res.text() };
}

describe("GET /api/auth/account/export", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("refuses when signed out", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await exportMe()).status).toBe(401);
  });

  it("is a JSON file of the member's own data, naming others by name only", async () => {
    const me = await createTestUser();
    const friend = await createTestUser({ email: "friend-secret@example.test" });
    await createTestPost({ authorId: me.userId });
    await prisma.friendship.create({
      data: { userId: me.userId, friendId: friend.userId, status: "accepted" },
    });
    await createTestItem({
      ownerId: me.userId,
      kind: "note",
      location: "mailbox",
      slot: 0,
      body: "Hello from a friend",
      fromId: friend.userId,
    });
    await prisma.worldPlant.create({
      data: {
        ownerId: me.userId,
        worldId: "capital",
        col: 2,
        row: 3,
        color: "blue",
        bloomsAt: new Date(Date.now() + 3_600_000),
      },
    });

    authAs(me);
    const { status, headers, text } = await exportMe();
    expect(status).toBe(200);
    expect(headers.get("content-disposition")).toMatch(/^attachment; filename="our-place-/);
    const data = JSON.parse(text);
    expect(data.profile.username).toBe(me.username);
    expect(data.profile.email).toMatch(/@example\.test$/);
    expect(data.posts).toHaveLength(1);
    expect(data.friends).toEqual([
      expect.objectContaining({ username: friend.username, status: "accepted" }),
    ]);
    expect(data.items[0]).toMatchObject({
      text: "Hello from a friend",
      from: { username: friend.username },
    });
    // A seed's color stays a surprise until it blooms.
    expect(data.plants).toEqual([expect.objectContaining({ state: "seed", color: null })]);
    // Nothing private about anyone else.
    expect(text).not.toContain("friend-secret@example.test");
    expect(data.truncated).toEqual([]);
  });

  it("limits how often a member can download", async () => {
    const me = await createTestUser();
    authAs(me);
    for (let i = 0; i < 5; i++) expect((await exportMe()).status).toBe(200);
    expect((await exportMe()).status).toBe(429);
  });
});
