import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const AVATAR = {
  hairStyle: "long",
  hairColor: "#3b2219",
  skinTone: "#8D5524",
  shirtColor: "#3b82f6",
  pantsColor: "#353540",
  shoesColor: "#4d3f38",
};
const LOOK = {
  hair_style: "short",
  hair_color: "#e6be8a",
  shirt: "#8b5cf6",
  pants: "#1e3a5f",
  shoes: "#ede4da",
};

function wear(body: unknown) {
  return POST(jsonRequest("http://localhost/api/outfits/wear", body));
}

async function avatarOf(userId: string) {
  return prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { avatar: true, ghost: true },
  });
}

describe("POST /api/outfits/wear", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("returns 401 when not logged in", async () => {
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await wear(LOOK)).status).toBe(401);
  });

  it("puts on the look's hair and clothes, keeps skin, and ends Ghost Mode", async () => {
    const me = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { avatar: AVATAR, ghost: true } });
    actAs(me);

    expect((await wear(LOOK)).status).toBe(200);
    expect(await avatarOf(me.userId)).toEqual({
      avatar: {
        hairStyle: "short",
        hairColor: "#e6be8a",
        skinTone: AVATAR.skinTone,
        shirtColor: "#8b5cf6",
        pantsColor: "#1e3a5f",
        shoesColor: "#ede4da",
      },
      ghost: false,
    });
  });

  it("never changes skin, even when the body sends one", async () => {
    const me = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { avatar: AVATAR } });
    actAs(me);

    const res = await wear({ ...LOOK, skinTone: "#FFE0BD", skin_tone: "#FFE0BD" });
    expect(res.status).toBe(200);
    const { avatar } = await avatarOf(me.userId);
    expect(avatar).toEqual(expect.objectContaining({ skinTone: AVATAR.skinTone }));
  });

  it("refuses before a character is built", async () => {
    const me = await createTestUser();
    actAs(me);
    expect((await wear(LOOK)).status).toBe(409);
  });

  it("rejects a hair style other than short or long", async () => {
    const me = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { avatar: AVATAR } });
    actAs(me);
    expect((await wear({ ...LOOK, hair_style: "mohawk" })).status).toBe(400);
    expect((await avatarOf(me.userId)).avatar).toEqual(AVATAR);
  });
});
