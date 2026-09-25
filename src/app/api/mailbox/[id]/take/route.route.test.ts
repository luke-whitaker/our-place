import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, createTestItem, createTestLetter } from "@/test/route-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function take(id: string) {
  return POST(new Request(`http://localhost/api/mailbox/${id}/take`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/mailbox/[id]/take", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 404 for someone else's letter", async () => {
    const owner = await createTestUser();
    const letterId = await createTestLetter({ ownerId: owner.userId, slot: 0 });
    authAs(await createTestUser());

    const res = await take(letterId);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Letter not found.");
  });

  it("returns 404 for one of the caller's own pocket items", async () => {
    const user = await createTestUser();
    const itemId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });
    authAs(user);

    const res = await take(itemId);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Letter not found.");
  });

  it("returns 404 for a letter that doesn't exist", async () => {
    authAs(await createTestUser());
    const res = await take(uuidv4());
    expect(res.status).toBe(404);
  });

  it("refuses with 409 when pockets are full, leaving the letter in the mailbox", async () => {
    const user = await createTestUser();
    for (let slot = 0; slot < 10; slot++) {
      await createTestItem({ ownerId: user.userId, kind: "note", slot });
    }
    const sender = await createTestUser();
    const letterId = await createTestLetter({
      ownerId: user.userId,
      slot: 0,
      fromId: sender.userId,
    });
    authAs(user);

    const res = await take(letterId);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Your pockets are full. Make some room, then come back for it.",
    );

    const stillThere = await prisma.item.findUnique({ where: { id: letterId } });
    expect(stillThere).toMatchObject({ location: "mailbox", ownerId: user.userId });
  });

  it("lands in the lowest free pocket slot and keeps who sent it", async () => {
    const user = await createTestUser();
    await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });
    // Slot 1 stays open — that's where the letter should land.
    const sender = await createTestUser({ displayName: "Pat" });
    const letterId = await createTestLetter({
      ownerId: user.userId,
      slot: 5,
      fromId: sender.userId,
      body: "Hello!",
    });
    authAs(user);

    const res = await take(letterId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Taken.");
    expect(body.item).toMatchObject({
      id: letterId,
      kind: "note",
      slot: 1,
      body: "Hello!",
      from: { username: sender.username, display_name: "Pat" },
    });
    expect(body.item.placed_at).not.toBeNull();

    const stored = await prisma.item.findUnique({ where: { id: letterId } });
    expect(stored).toMatchObject({ location: "pocket", slot: 1, fromId: sender.userId });
  });
});
