import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { MAX_OUTFITS, type AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const PINK = { shirt: "#ec4899", pants: "#353540", shoes: "#ede4da" };
const AVATAR = {
  hairStyle: "long",
  hairColor: "#3b2219",
  skinTone: "#C68642",
  shirtColor: "#3b82f6",
  pantsColor: "#353540",
  shoesColor: "#4d3f38",
};

function save(body: unknown) {
  return POST(jsonRequest("http://localhost/api/outfits", body));
}

describe("GET /api/outfits", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("returns 401 when not logged in", async () => {
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await GET()).status).toBe(401);
  });

  it("lists only the caller's outfits in slot order, with what they wear and Ghost Mode", async () => {
    const me = await createTestUser();
    const other = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { avatar: AVATAR, ghost: true } });
    await prisma.outfit.create({ data: { ownerId: me.userId, slot: 3, name: "Late", ...PINK } });
    await prisma.outfit.create({ data: { ownerId: me.userId, slot: 0, name: "", ...PINK } });
    await prisma.outfit.create({ data: { ownerId: other.userId, slot: 1, ...PINK } });
    actAs(me);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.outfits.map((o: { slot: number }) => o.slot)).toEqual([0, 3]);
    expect(body.outfits[1]).toEqual(expect.objectContaining({ name: "Late", ...PINK }));
    expect(body.wearing).toEqual({ shirt: "#3b82f6", pants: "#353540", shoes: "#4d3f38" });
    expect(body.ghost).toBe(true);
  });

  it("says nothing is being worn before a character is built", async () => {
    const me = await createTestUser();
    actAs(me);
    const body = await (await GET()).json();
    expect(body).toEqual({ outfits: [], wearing: null, ghost: false });
  });
});

describe("POST /api/outfits", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("saves into the first empty slot, with an optional name", async () => {
    const me = await createTestUser();
    await prisma.outfit.create({ data: { ownerId: me.userId, slot: 0, ...PINK } });
    actAs(me);

    const res = await save({ name: "  Picnic  ", ...PINK });
    expect(res.status).toBe(201);
    const { outfit } = await res.json();
    expect(outfit).toEqual(expect.objectContaining({ slot: 1, name: "Picnic", ...PINK }));
  });

  it(`refuses a ${MAX_OUTFITS + 1}th outfit`, async () => {
    const me = await createTestUser();
    for (let slot = 0; slot < MAX_OUTFITS; slot++) {
      await prisma.outfit.create({ data: { ownerId: me.userId, slot, ...PINK } });
    }
    actAs(me);

    const res = await save(PINK);
    expect(res.status).toBe(409);
    expect(await prisma.outfit.count({ where: { ownerId: me.userId } })).toBe(MAX_OUTFITS);
  });

  it("rejects a color that isn't a hex color, and a name that's too long", async () => {
    const me = await createTestUser();
    actAs(me);
    expect((await save({ ...PINK, shirt: "pink" })).status).toBe(400);
    expect((await save({ ...PINK, name: "x".repeat(25) })).status).toBe(400);
    expect(await prisma.outfit.count({ where: { ownerId: me.userId } })).toBe(0);
  });
});
