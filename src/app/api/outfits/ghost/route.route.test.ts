import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { presenceHub, type PresenceEvent } from "@/lib/presence";
import { POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function ghost(on: unknown) {
  return POST(jsonRequest("http://localhost/api/outfits/ghost", { on }));
}

describe("POST /api/outfits/ghost", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("saves Ghost Mode, and everyone nearby loses sight of you, then sees you again", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    const world = `capital-ghost-${me.userId}`;
    presenceHub().move(
      me.userId,
      world,
      { col: 1, row: 1, dir: "S", moving: false },
      { username: me.username, display_name: "Me", avatar: null, hat: null, ghost: false },
    );
    const heard: PresenceEvent[] = [];
    const sub = presenceHub().subscribe({
      userId: friend.userId,
      worldId: world,
      send: (event) => heard.push(event),
    });
    actAs(me);

    expect((await ghost(true)).status).toBe(200);
    const saved = await prisma.user.findUniqueOrThrow({
      where: { id: me.userId },
      select: { ghost: true },
    });
    expect(saved.ghost).toBe(true);

    // A ghost's emote is accepted but never reaches anyone.
    expect(presenceHub().emote(me.userId, world, "heart")).toBe("ok");
    expect((await ghost(false)).status).toBe(200);

    expect(heard).toEqual(["snapshot", "leave", "update"]);
    if (sub.ok) sub.unsubscribe();
  });

  it("rejects anything but a boolean", async () => {
    const me = await createTestUser();
    actAs(me);
    expect((await ghost("yes")).status).toBe(400);
  });
});
