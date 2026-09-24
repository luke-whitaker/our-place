import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import {
  createTestUser,
  giveTestNotebook,
  createTestNotebookPage,
  jsonRequest,
} from "@/test/route-helpers";
import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function write(body: string) {
  return POST(jsonRequest("http://localhost/api/notebook/pages", { body }));
}

describe("GET /api/notebook/pages", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 403 for a member who has no notebook yet", async () => {
    authAs(await createTestUser());

    const res = await GET();
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("You don't have a notebook yet.");
  });

  it("lists only the caller's drafts, in page order", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await giveTestNotebook(user.userId);
    await giveTestNotebook(other.userId);
    await createTestNotebookPage({ ownerId: user.userId, page: 2, body: "Second." });
    await createTestNotebookPage({ ownerId: user.userId, page: 0, body: "First." });
    await createTestNotebookPage({ ownerId: other.userId, page: 0, body: "Not mine." });
    authAs(user);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pages.map((p: { page: number; body: string }) => [p.page, p.body])).toEqual([
      [0, "First."],
      [2, "Second."],
    ]);
  });
});

describe("POST /api/notebook/pages", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("returns 403 for a member who has no notebook yet", async () => {
    authAs(await createTestUser());

    const res = await write("A new draft.");
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("You don't have a notebook yet.");
  });

  it("saves a draft into the lowest free page", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    await createTestNotebookPage({ ownerId: user.userId, page: 0 });
    authAs(user);

    const res = await write("My second draft.");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe("Saved.");
    expect(body.page).toMatchObject({ page: 1, body: "My second draft." });
  });

  it("rejects a draft over 1,000 characters", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    authAs(user);

    const res = await write("x".repeat(1001));
    expect(res.status).toBe(400);
  });

  it("rejects a draft that's only whitespace", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    authAs(user);

    const res = await write("   \n\t  ");
    expect(res.status).toBe(400);
  });

  it("accepts a draft at exactly 1,000 characters", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    authAs(user);

    const res = await write("x".repeat(1000));
    expect(res.status).toBe(201);
  });

  it("refuses an 11th draft with 409 once all 10 pages are full", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    for (let page = 0; page < 10; page++) {
      await createTestNotebookPage({ ownerId: user.userId, page });
    }
    authAs(user);

    const res = await write("One too many.");
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe(
      "Your notebook has 10 drafts. Tear one out or crumple one up to make room.",
    );
  });

  it("reuses a page freed by crumpling up a draft", async () => {
    const user = await createTestUser();
    await giveTestNotebook(user.userId);
    for (let page = 0; page < 10; page++) {
      await createTestNotebookPage({ ownerId: user.userId, page });
    }
    const toCrumple = await prisma.notebookPage.findFirstOrThrow({
      where: { ownerId: user.userId, page: 4 },
    });
    await prisma.notebookPage.delete({ where: { id: toCrumple.id } });
    authAs(user);

    const res = await write("Reused page.");
    expect(res.status).toBe(201);
    expect((await res.json()).page).toMatchObject({ page: 4, body: "Reused page." });
  });
});
