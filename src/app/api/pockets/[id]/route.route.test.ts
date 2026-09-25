import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, createTestItem, createTestLetter } from "@/test/route-helpers";
import { DELETE } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

async function discard(itemId: string) {
  return DELETE(new Request(`http://localhost/api/pockets/${itemId}`), {
    params: Promise.resolve({ id: itemId }),
  });
}

describe("DELETE /api/pockets/[id]", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("throws away a Note", async () => {
    const user = await createTestUser();
    authAs(user);
    const itemId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });

    const res = await discard(itemId);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Thrown away.");
    expect(await prisma.item.findUnique({ where: { id: itemId } })).toBeNull();
  });

  it("refuses to throw away the Notebook", async () => {
    const user = await createTestUser();
    authAs(user);
    const itemId = await createTestItem({ ownerId: user.userId, kind: "notebook", slot: 0 });

    const res = await discard(itemId);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("The Notebook can't be thrown away.");
    expect(await prisma.item.findUnique({ where: { id: itemId } })).not.toBeNull();
  });

  it("returns 404 for someone else's item", async () => {
    const owner = await createTestUser();
    const itemId = await createTestItem({ ownerId: owner.userId, kind: "note", slot: 0 });
    authAs(await createTestUser());

    const res = await discard(itemId);
    expect(res.status).toBe(404);
  });

  it("returns 404 for an item that doesn't exist", async () => {
    authAs(await createTestUser());
    const res = await discard(uuidv4());
    expect(res.status).toBe(404);
  });

  it("throws away a letter still sitting in the caller's own mailbox", async () => {
    const user = await createTestUser();
    authAs(user);
    const letterId = await createTestLetter({ ownerId: user.userId, slot: 0 });

    const res = await discard(letterId);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Thrown away.");
    expect(await prisma.item.findUnique({ where: { id: letterId } })).toBeNull();
  });

  it("returns 404 for a mailbox letter that belongs to someone else", async () => {
    const owner = await createTestUser();
    const letterId = await createTestLetter({ ownerId: owner.userId, slot: 0 });
    authAs(await createTestUser());

    const res = await discard(letterId);
    expect(res.status).toBe(404);
    expect(await prisma.item.findUnique({ where: { id: letterId } })).not.toBeNull();
  });
});
