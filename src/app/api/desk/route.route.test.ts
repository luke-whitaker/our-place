import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import {
  createTestUser,
  createTestItem,
  giveTestNotebook,
  jsonRequest,
} from "@/test/route-helpers";
import { GET, POST } from "./route";
import { DELETE } from "../pockets/[id]/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function store(body: unknown) {
  return POST(jsonRequest("http://localhost/api/desk", body));
}

describe("GET /api/desk", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("lists only the caller's own desk items, in slot order", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const second = await createTestItem({
      ownerId: user.userId,
      kind: "note",
      location: "desk",
      slot: 42,
    });
    const first = await createTestItem({
      ownerId: user.userId,
      kind: "note",
      location: "desk",
      slot: 3,
    });
    await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 }); // in pockets
    await createTestItem({ ownerId: other.userId, kind: "note", location: "desk", slot: 0 });
    authAs(user);

    const res = await GET();
    expect(res.status).toBe(200);
    const { items } = await res.json();
    expect(items.map((i: { id: string }) => i.id)).toEqual([first, second]);
    expect(items.map((i: { slot: number }) => i.slot)).toEqual([3, 42]);
  });
});

describe("POST /api/desk", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("puts a pocket item in the lowest free desk slot", async () => {
    const user = await createTestUser();
    await createTestItem({ ownerId: user.userId, kind: "note", location: "desk", slot: 0 });
    const noteId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 4 });
    authAs(user);

    const res = await store({ item_id: noteId });
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ id: noteId, slot: 1 });

    const row = await prisma.item.findUnique({ where: { id: noteId } });
    expect(row).toMatchObject({ location: "desk", slot: 1, ownerId: user.userId });
  });

  it("puts an item in the chosen slot", async () => {
    const user = await createTestUser();
    const noteId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });
    authAs(user);

    const res = await store({ item_id: noteId, slot: 57 });
    expect(res.status).toBe(200);
    expect(await prisma.item.findUnique({ where: { id: noteId } })).toMatchObject({
      location: "desk",
      slot: 57,
    });
  });

  it("holds the Notebook too: anything that fits in pockets fits in the desk", async () => {
    const user = await createTestUser();
    const notebookId = await giveTestNotebook(user.userId);
    authAs(user);

    const res = await store({ item_id: notebookId });
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ kind: "notebook", slot: 0 });
  });

  it("refuses a taken slot with 409 and leaves the item in pockets", async () => {
    const user = await createTestUser();
    await createTestItem({ ownerId: user.userId, kind: "note", location: "desk", slot: 7 });
    const noteId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });
    authAs(user);

    const res = await store({ item_id: noteId, slot: 7 });
    expect(res.status).toBe(409);
    expect(await prisma.item.findUnique({ where: { id: noteId } })).toMatchObject({
      location: "pocket",
      slot: 0,
    });
  });

  it("refuses with 409 when all 100 slots are full", async () => {
    const user = await createTestUser();
    await prisma.item.createMany({
      data: Array.from({ length: 100 }, (_, slot) => ({
        id: uuidv4(),
        ownerId: user.userId,
        kind: "note",
        location: "desk",
        slot,
      })),
    });
    const noteId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });
    authAs(user);

    const res = await store({ item_id: noteId });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Your desk is full.");
  });

  it("rejects a slot past the desk's 100 with 400", async () => {
    const user = await createTestUser();
    const noteId = await createTestItem({ ownerId: user.userId, kind: "note", slot: 0 });
    authAs(user);

    const res = await store({ item_id: noteId, slot: 100 });
    expect(res.status).toBe(400);
  });

  it("returns 404 for someone else's item, and it stays theirs", async () => {
    const owner = await createTestUser();
    const noteId = await createTestItem({ ownerId: owner.userId, kind: "note", slot: 0 });
    authAs(await createTestUser());

    const res = await store({ item_id: noteId });
    expect(res.status).toBe(404);
    expect(await prisma.item.findUnique({ where: { id: noteId } })).toMatchObject({
      ownerId: owner.userId,
      location: "pocket",
    });
  });

  it("returns 404 for an item still in the caller's mailbox", async () => {
    const user = await createTestUser();
    const letterId = await createTestItem({
      ownerId: user.userId,
      kind: "note",
      location: "mailbox",
      slot: 0,
    });
    authAs(user);

    const res = await store({ item_id: letterId });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/pockets/[id] from the desk", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  function discard(id: string) {
    return DELETE(new Request(`http://localhost/api/pockets/${id}`, { method: "DELETE" }), {
      params: Promise.resolve({ id }),
    });
  }

  it("throws away a note kept in the desk", async () => {
    const user = await createTestUser();
    const noteId = await createTestItem({
      ownerId: user.userId,
      kind: "note",
      location: "desk",
      slot: 12,
    });
    authAs(user);

    expect((await discard(noteId)).status).toBe(200);
    expect(await prisma.item.findUnique({ where: { id: noteId } })).toBeNull();
  });

  it("never throws away the Notebook, even from the desk", async () => {
    const user = await createTestUser();
    const notebookId = await createTestItem({
      ownerId: user.userId,
      kind: "notebook",
      location: "desk",
      slot: 0,
    });
    authAs(user);

    expect((await discard(notebookId)).status).toBe(403);
    expect(await prisma.item.findUnique({ where: { id: notebookId } })).not.toBeNull();
  });
});
