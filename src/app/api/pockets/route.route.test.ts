import { describe, it, expect, vi, beforeEach } from "vitest";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, createTestItem } from "@/test/route-helpers";
import { GET } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

describe("GET /api/pockets", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("lists only the caller's items, in slot order", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await createTestItem({ ownerId: user.userId, kind: "note", slot: 3, body: "Third." });
    await createTestItem({ ownerId: user.userId, kind: "notebook", slot: 0 });
    await createTestItem({ ownerId: other.userId, kind: "note", slot: 0, body: "Not mine." });
    authAs(user);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(2);
    expect(body.items.map((i: { slot: number }) => i.slot)).toEqual([0, 3]);
    expect(body.items[0]).toMatchObject({ kind: "notebook", slot: 0, body: null });
    expect(body.items[1]).toMatchObject({ kind: "note", slot: 3, body: "Third." });
  });

  it("returns an empty list for a member with nothing in their pockets", async () => {
    authAs(await createTestUser());

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).items).toEqual([]);
  });
});
