import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser } from "@/test/route-helpers";
import { presenceHub } from "@/lib/presence";
import { GET } from "./route";

// requireAuth reads cookies via next/headers, which doesn't exist outside a
// real Next request, so each test chooses the caller.
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

function open(worldId: string, signal?: AbortSignal) {
  return GET(
    new Request(`http://localhost/api/presence/stream?world=${encodeURIComponent(worldId)}`, {
      signal,
    }),
  );
}

function arrive(userId: string, worldId: string, name: string) {
  presenceHub().move(
    userId,
    worldId,
    { col: 2, row: 3, dir: "S", moving: false },
    { username: name, display_name: name, avatar: null, hat: null, ghost: false },
  );
}

/** Read the stream until the first `snapshot` event, and return its data. */
async function readSnapshot(res: Response) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  // Bounded: the pad, the retry line, and the snapshot arrive in a few chunks.
  for (let i = 0; i < 10 && !text.includes("event: snapshot\ndata: "); i++) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  const line = text.split("\n").find((l, i, all) => all[i - 1] === "event: snapshot");
  reader.releaseLock();
  return JSON.parse(line!.slice("data: ".length));
}

describe("GET /api/presence/stream", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("returns 401 when not logged in", async () => {
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await open("capital")).status).toBe(401);
  });

  it("returns 400 for a missing or unknown world", async () => {
    actAs(await createTestUser());
    expect((await GET(new Request("http://localhost/api/presence/stream"))).status).toBe(400);
    expect((await open("nowhere")).status).toBe(400);
  });

  it("opens with a snapshot of everyone else in the world, never the caller", async () => {
    const me = await createTestUser();
    arrive(me.userId, "food-inside", "me");
    arrive("someone-else", "food-inside", "other");
    arrive("elsewhere", "capital", "far");
    actAs(me);
    const abort = new AbortController();

    const res = await open("food-inside", abort.signal);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    const snapshot = await readSnapshot(res);
    expect(snapshot.players.map((p: { user_id: string }) => p.user_id)).toEqual(["someone-else"]);
    abort.abort();
  });

  it("refuses a closed island, and opens a friends-only one to a friend", async () => {
    const owner = await createTestUser({ displayName: "Cal" });
    await prisma.user.update({
      where: { id: owner.userId },
      data: { islandVisibility: "nobody" },
    });
    actAs(await createTestUser());
    const closed = await open(`island:${owner.userId}`);
    expect(closed.status).toBe(403);
    expect((await closed.json()).error).toBe("Cal's island is closed to visitors.");

    const host = await createTestUser();
    const friend = await createTestUser();
    await prisma.friendship.create({
      data: { userId: host.userId, friendId: friend.userId, status: "accepted" },
    });
    actAs(friend);
    const abort = new AbortController();
    const res = await open(`island:${host.userId}:inside`, abort.signal);
    expect(res.status).toBe(200);
    abort.abort();
  });

  it("stops listening when the client goes away", async () => {
    actAs(await createTestUser());
    const before = presenceHub().stats().subscribers;
    const abort = new AbortController();
    await open("capital", abort.signal);
    expect(presenceHub().stats().subscribers).toBe(before + 1);

    abort.abort();
    expect(presenceHub().stats().subscribers).toBe(before);
  });
});
