import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
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

function take(id: string) {
  return POST(new Request(`http://localhost/api/desk/${id}/take`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

describe("POST /api/desk/[id]/take", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("moves a desk item into the lowest free pocket slot, keeping who sent it", async () => {
    const user = await createTestUser();
    const sender = await createTestUser();
    await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });
    const letterId = await createTestItem({
      ownerId: user.userId,
      kind: "note",
      location: "desk",
      slot: 35,
      fromId: sender.userId,
      placedAt: new Date(),
    });
    authAs(user);

    const res = await take(letterId);
    expect(res.status).toBe(200);
    const { item } = await res.json();
    expect(item).toMatchObject({ id: letterId, slot: 1 });
    expect(item.from.username).toBe(sender.username);
    expect(await prisma.item.findUnique({ where: { id: letterId } })).toMatchObject({
      location: "pocket",
      slot: 1,
    });
  });

  it("refuses with 409 when pockets are full, leaving the item in the desk", async () => {
    const user = await createTestUser();
    for (let slot = 0; slot < 10; slot++) {
      await createTestItem({ ownerId: user.userId, kind: "note", slot });
    }
    const noteId = await createTestItem({
      ownerId: user.userId,
      kind: "note",
      location: "desk",
      slot: 0,
    });
    authAs(user);

    const res = await take(noteId);
    expect(res.status).toBe(409);
    expect(await prisma.item.findUnique({ where: { id: noteId } })).toMatchObject({
      location: "desk",
      slot: 0,
    });
  });

  it("returns 404 for another member's desk item: visitors can't open a desk", async () => {
    const owner = await createTestUser();
    const noteId = await createTestItem({
      ownerId: owner.userId,
      kind: "note",
      location: "desk",
      slot: 0,
    });
    authAs(await createTestUser());

    const res = await take(noteId);
    expect(res.status).toBe(404);
    expect(await prisma.item.findUnique({ where: { id: noteId } })).toMatchObject({
      ownerId: owner.userId,
      location: "desk",
    });
  });

  it("returns 404 for an item that's in pockets, not the desk", async () => {
    const user = await createTestUser();
    const noteId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 3 });
    authAs(user);

    expect((await take(noteId)).status).toBe(404);
  });

  it("returns 404 for an item that doesn't exist", async () => {
    authAs(await createTestUser());
    expect((await take(uuidv4())).status).toBe(404);
  });
});
