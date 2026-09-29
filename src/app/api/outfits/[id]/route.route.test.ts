import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { PATCH, DELETE } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const PINK_ROW = {
  hairStyle: "long",
  hairColor: "#3b2219",
  shirt: "#ec4899",
  pants: "#353540",
  shoes: "#ede4da",
};

async function outfitOf(ownerId: string) {
  const row = await prisma.outfit.create({
    data: { ownerId, slot: 0, name: "Old", ...PINK_ROW },
    select: { id: true },
  });
  return row.id;
}

function edit(id: string, body: unknown) {
  return PATCH(jsonRequest(`http://localhost/api/outfits/${id}`, body, "PATCH"), {
    params: Promise.resolve({ id }),
  });
}

function remove(id: string) {
  return DELETE(new Request(`http://localhost/api/outfits/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("PATCH /api/outfits/[id]", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("renames and recolors the caller's own outfit", async () => {
    const me = await createTestUser();
    const id = await outfitOf(me.userId);
    actAs(me);

    const res = await edit(id, { name: "New", shoes: "#1e3a5f" });
    expect(res.status).toBe(200);
    const { outfit } = await res.json();
    expect(outfit).toEqual(
      expect.objectContaining({ name: "New", shirt: PINK_ROW.shirt, shoes: "#1e3a5f" }),
    );
  });

  it("saves a new name sent with the whole look, the way the armoire's editor sends it", async () => {
    const me = await createTestUser();
    const id = await outfitOf(me.userId);
    actAs(me);

    const res = await edit(id, {
      name: "Renamed",
      hair_style: "short",
      hair_color: "#e6be8a",
      shirt: "#8b5cf6",
      pants: "#1e3a5f",
      shoes: "#353540",
    });
    expect(res.status).toBe(200);
    const row = await prisma.outfit.findUniqueOrThrow({ where: { id } });
    expect(row).toEqual(
      expect.objectContaining({ name: "Renamed", hairStyle: "short", hairColor: "#e6be8a" }),
    );
  });

  it("can't touch someone else's outfit", async () => {
    const me = await createTestUser();
    const other = await createTestUser();
    const id = await outfitOf(other.userId);
    actAs(me);

    expect((await edit(id, { name: "Mine now" })).status).toBe(404);
    const row = await prisma.outfit.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe("Old");
  });

  it("refuses an empty change", async () => {
    const me = await createTestUser();
    const id = await outfitOf(me.userId);
    actAs(me);
    expect((await edit(id, {})).status).toBe(400);
  });
});

describe("DELETE /api/outfits/[id]", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("removes the caller's own outfit", async () => {
    const me = await createTestUser();
    const id = await outfitOf(me.userId);
    actAs(me);

    expect((await remove(id)).status).toBe(200);
    expect(await prisma.outfit.count({ where: { id } })).toBe(0);
  });

  it("can't remove someone else's outfit", async () => {
    const me = await createTestUser();
    const other = await createTestUser();
    const id = await outfitOf(other.userId);
    actAs(me);

    expect((await remove(id)).status).toBe(404);
    expect(await prisma.outfit.count({ where: { id } })).toBe(1);
  });
});
