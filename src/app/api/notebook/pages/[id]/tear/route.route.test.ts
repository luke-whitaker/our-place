import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import {
  createTestUser,
  createTestItem,
  giveTestNotebook,
  createTestNotebookPage,
} from "@/test/route-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function tearOut(pageId: string) {
  return POST(
    new Request(`http://localhost/api/notebook/pages/${pageId}/tear`, { method: "POST" }),
    {
      params: Promise.resolve({ id: pageId }),
    },
  );
}

describe("POST /api/notebook/pages/[id]/tear", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 403 for a member who has no notebook yet", async () => {
    authAs(await createTestUser());

    const res = await tearOut(uuidv4());
    expect(res.status).toBe(403);
  });

  it("moves the draft's text into a Note in the lowest free slot and deletes the draft", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId, 0);
    await createTestItem({ ownerId: user.userId, kind: "note", slot: 1 });
    // Slot 2 stays open — that's where the torn-out Note should land.
    const pageId = await createTestNotebookPage({
      ownerId: user.userId,
      page: 0,
      body: "Tear me out.",
    });
    authAs(user);

    const res = await tearOut(pageId);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Torn out.");
    expect(body.item).toMatchObject({ kind: "note", slot: 2, body: "Tear me out." });

    expect(await prisma.notebookPage.findUnique({ where: { id: pageId } })).toBeNull();
    const stored = await prisma.item.findUnique({ where: { id: body.item.id } });
    expect(stored).toMatchObject({ kind: "note", slot: 2, body: "Tear me out." });
  });

  it("refuses with 409 and leaves the draft in place when pockets are full", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId, 0);
    for (let slot = 1; slot < 10; slot++) {
      await createTestItem({ ownerId: user.userId, kind: "note", slot });
    }
    const pageId = await createTestNotebookPage({
      ownerId: user.userId,
      page: 0,
      body: "Stuck in the notebook.",
    });
    authAs(user);

    const res = await tearOut(pageId);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Your pockets are full. Throw something away to make room for the note.",
    );
    expect(await prisma.notebookPage.findUnique({ where: { id: pageId } })).not.toBeNull();
  });

  it("returns 404 for a draft that belongs to someone else", async () => {
    const owner = await createTestUser();
    await giveTestNotebook(owner.userId, 0);
    const pageId = await createTestNotebookPage({ ownerId: owner.userId, page: 0 });

    const stranger = await createTestUser();
    await giveTestNotebook(stranger.userId, 0);
    authAs(stranger);

    const res = await tearOut(pageId);
    expect(res.status).toBe(404);
  });

  it("returns 404 for a draft that doesn't exist", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId, 0);
    authAs(user);

    const res = await tearOut(uuidv4());
    expect(res.status).toBe(404);
  });
});
