import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import {
  createTestUser,
  giveTestNotebook,
  createTestNotebookPage,
  jsonRequest,
} from "@/test/route-helpers";
import { PATCH, DELETE } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function edit(pageId: string, body: string) {
  return PATCH(jsonRequest(`http://localhost/api/notebook/pages/${pageId}`, { body }, "PATCH"), {
    params: Promise.resolve({ id: pageId }),
  });
}

function crumple(pageId: string) {
  return DELETE(
    new Request(`http://localhost/api/notebook/pages/${pageId}`, { method: "DELETE" }),
    {
      params: Promise.resolve({ id: pageId }),
    },
  );
}

describe("PATCH /api/notebook/pages/[id]", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 403 for a member who has no notebook yet", async () => {
    authAs(await createTestUser());

    const res = await edit(uuidv4(), "Updated.");
    expect(res.status).toBe(403);
  });

  it("saves an edit to the caller's own draft", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    const pageId = await createTestNotebookPage({ ownerId: user.userId, page: 0, body: "Old." });
    authAs(user);

    const res = await edit(pageId, "New text.");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("Saved.");
    expect(body.page).toMatchObject({ id: pageId, page: 0, body: "New text." });
  });

  it("rejects a whitespace-only edit", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    const pageId = await createTestNotebookPage({ ownerId: user.userId, page: 0 });
    authAs(user);

    const res = await edit(pageId, "   ");
    expect(res.status).toBe(400);
  });

  it("returns 404 for a draft that belongs to someone else", async () => {
    const owner = await createTestUser();
    await giveTestNotebook(owner.userId);
    const pageId = await createTestNotebookPage({ ownerId: owner.userId, page: 0 });

    const stranger = await createTestUser();
    await giveTestNotebook(stranger.userId);
    authAs(stranger);

    const res = await edit(pageId, "Hijacked.");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a draft that doesn't exist", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    authAs(user);

    const res = await edit(uuidv4(), "Doesn't matter.");
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/notebook/pages/[id]", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 403 for a member who has no notebook yet", async () => {
    authAs(await createTestUser());

    const res = await crumple(uuidv4());
    expect(res.status).toBe(403);
  });

  it("crumples up the caller's own draft", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    const pageId = await createTestNotebookPage({ ownerId: user.userId, page: 0 });
    authAs(user);

    const res = await crumple(pageId);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Crumpled up.");
    expect(await prisma.notebookPage.findUnique({ where: { id: pageId } })).toBeNull();
  });

  it("returns 404 for a draft that belongs to someone else", async () => {
    const owner = await createTestUser();
    await giveTestNotebook(owner.userId);
    const pageId = await createTestNotebookPage({ ownerId: owner.userId, page: 0 });

    const stranger = await createTestUser();
    await giveTestNotebook(stranger.userId);
    authAs(stranger);

    const res = await crumple(pageId);
    expect(res.status).toBe(404);
    expect(await prisma.notebookPage.findUnique({ where: { id: pageId } })).not.toBeNull();
  });

  it("returns 404 for a draft that doesn't exist", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    authAs(user);

    const res = await crumple(uuidv4());
    expect(res.status).toBe(404);
  });
});
