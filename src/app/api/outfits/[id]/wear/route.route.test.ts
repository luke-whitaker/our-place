import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser } from "@/test/route-helpers";
import { presenceHub, type PresenceEvent } from "@/lib/presence";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const PINK_ROW = {
  hairStyle: "long",
  hairColor: "#e6be8a",
  shirt: "#ec4899",
  pants: "#1e3a5f",
  shoes: "#ede4da",
};
const AVATAR = {
  hairStyle: "short" as const,
  hairColor: "#922724",
  skinTone: "#8D5524",
  shirtColor: "#3b82f6",
  pantsColor: "#353540",
  shoesColor: "#4d3f38",
};

function wear(id: string) {
  return POST(new Request(`http://localhost/api/outfits/${id}/wear`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

async function outfitOf(ownerId: string) {
  const row = await prisma.outfit.create({
    data: { ownerId, slot: 0, ...PINK_ROW },
    select: { id: true },
  });
  return row.id;
}

describe("POST /api/outfits/[id]/wear", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("dresses the avatar in the outfit's hair and clothes, keeps skin, and ends Ghost Mode", async () => {
    const me = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { avatar: AVATAR, ghost: true } });
    const id = await outfitOf(me.userId);
    actAs(me);

    const res = await wear(id);
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: me.userId },
      select: { avatar: true, ghost: true },
    });
    expect(user.avatar).toEqual({
      hairStyle: "long",
      hairColor: PINK_ROW.hairColor,
      skinTone: AVATAR.skinTone,
      shirtColor: PINK_ROW.shirt,
      pantsColor: PINK_ROW.pants,
      shoesColor: PINK_ROW.shoes,
    });
    expect(user.ghost).toBe(false);
  });

  it("shows the new outfit to everyone nearby at once", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { avatar: AVATAR } });
    const id = await outfitOf(me.userId);
    const world = `capital-wear-${me.userId}`;
    presenceHub().move(
      me.userId,
      world,
      { col: 1, row: 1, dir: "S", moving: false },
      { username: me.username, display_name: "Me", avatar: AVATAR, ghost: false },
    );
    const heard: { event: PresenceEvent; data: unknown }[] = [];
    const sub = presenceHub().subscribe({
      userId: friend.userId,
      worldId: world,
      send: (event, data) => heard.push({ event, data }),
    });
    actAs(me);

    await wear(id);

    expect(heard.map((h) => h.event)).toEqual(["snapshot", "update"]);
    expect(heard[1].data).toEqual(
      expect.objectContaining({
        user_id: me.userId,
        avatar: expect.objectContaining({ shirtColor: PINK_ROW.shirt, skinTone: AVATAR.skinTone }),
      }),
    );
    if (sub.ok) sub.unsubscribe();
  });

  it("can't wear someone else's outfit", async () => {
    const me = await createTestUser();
    const other = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { avatar: AVATAR } });
    const id = await outfitOf(other.userId);
    actAs(me);

    expect((await wear(id)).status).toBe(404);
  });

  it("asks for a character first", async () => {
    const me = await createTestUser();
    const id = await outfitOf(me.userId);
    actAs(me);

    expect((await wear(id)).status).toBe(409);
  });
});
