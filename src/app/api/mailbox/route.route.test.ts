import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, createTestItem } from "@/test/route-helpers";
import { GET } from "./route";
import { GET as pocketsGet } from "@/app/api/pockets/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

describe("GET /api/mailbox", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("lists only the caller's letters, newest first, with who sent them", async () => {
    const owner = await createTestUser();
    const sender = await createTestUser({ displayName: "Sender One" });
    const other = await createTestUser();

    const older = await createTestItem({
      ownerId: owner.userId,
      kind: "note",
      location: "mailbox",
      slot: 0,
      body: "First.",
      fromId: sender.userId,
      placedAt: new Date("2026-09-01T00:00:00Z"),
    });
    const newer = await createTestItem({
      ownerId: owner.userId,
      kind: "note",
      location: "mailbox",
      slot: 1,
      body: "Second.",
      fromId: sender.userId,
      placedAt: new Date("2026-09-02T00:00:00Z"),
    });
    await createTestItem({
      ownerId: other.userId,
      kind: "note",
      location: "mailbox",
      slot: 0,
      body: "Not mine.",
      placedAt: new Date(),
    });
    authAs(owner);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.letters).toHaveLength(2);
    expect(body.letters.map((l: { id: string }) => l.id)).toEqual([newer, older]);
    expect(body.letters[0]).toMatchObject({
      body: "Second.",
      from: { username: sender.username, display_name: "Sender One" },
    });
    expect(body.letters[0].placed_at).toBe("2026-09-02T00:00:00.000Z");
  });

  it("returns an empty list for a member with nothing in their mailbox", async () => {
    authAs(await createTestUser());

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).letters).toEqual([]);
  });

  it("never lists a mailbox letter through GET /api/pockets", async () => {
    const owner = await createTestUser();
    await createTestItem({
      ownerId: owner.userId,
      kind: "note",
      location: "mailbox",
      slot: 0,
      placedAt: new Date(),
    });
    authAs(owner);

    const res = await pocketsGet();
    expect((await res.json()).items).toEqual([]);
  });
});
