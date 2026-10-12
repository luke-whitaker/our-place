import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { POCKET_SLOTS } from "@/lib/items";
import { CAPITAL } from "@/lib/game/worlds/world-map";
import { plantProblem } from "@/lib/game/event-mushroom";
import type { AuthPayload, PlantWire } from "@/lib/types";
import { createTestItem, createTestUser, jsonRequest } from "@/test/route-helpers";
import { POST as create } from "../../route";
import { POST as plantMushroom, DELETE as pickUpMushroom } from "../mushroom/route";
import { POST as keepsakeRoute } from "./route";
import { POST as hatRoute, DELETE as takeOffRoute } from "@/app/api/hat/route";
import { POST as plantRoute } from "@/app/api/world/plants/route";
import { DELETE as pickRoute } from "@/app/api/world/plants/[id]/route";
import { POST as leaveRoute } from "@/app/api/users/[username]/mailbox/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

/** Open Capital tiles near spawn where a mushroom may stand, a few apart. */
function openTiles(count: number): { col: number; row: number }[] {
  const found: { col: number; row: number }[] = [];
  const { col: sc, row: sr } = CAPITAL.spawn;
  for (let d = 3; d < 60 && found.length < count; d += 4) {
    for (let dc = -d; dc <= d && found.length < count; dc += 4) {
      const col = Math.floor(sc) + dc;
      const row = Math.floor(sr) + d;
      if (plantProblem(CAPITAL, col, row) === null) found.push({ col, row });
    }
  }
  return found;
}
const TILES = openTiles(3);

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

/** A world gathering, its Event Mushroom moved into the host's pockets. */
async function hostWorld(host: AuthPayload, inviteeIds: string[]): Promise<string> {
  authAs(host);
  const res = await create(
    jsonRequest("http://localhost/api/gatherings", {
      kind: "world",
      title: "Lantern walk",
      starts_at: inHours(24),
      ends_at: inHours(26),
      invitee_ids: inviteeIds,
    }),
  );
  const id = (await res.json()).gathering.id as string;
  await prisma.item.updateMany({
    where: { ownerId: host.userId, gatheringId: id, kind: "event_mushroom" },
    data: { location: "pocket", slot: 0, placedAt: null },
  });
  return id;
}

async function plant(host: AuthPayload, id: string, tile = TILES[0]) {
  authAs(host);
  const res = await plantMushroom(
    jsonRequest(`http://localhost/api/gatherings/${id}/mushroom`, { world: "capital", ...tile }),
    params(id),
  );
  return { status: res.status, data: await res.json() };
}

async function claim(as: AuthPayload, id: string) {
  authAs(as);
  const res = await keepsakeRoute(new Request("http://localhost", { method: "POST" }), params(id));
  return { status: res.status, data: await res.json() };
}

/** Every keepsake a member holds in pockets, as [color, quantity]. */
async function keepsakes(userId: string, location = "pocket") {
  const rows = await prisma.item.findMany({
    where: { ownerId: userId, kind: "keepsake_mushroom", location },
    select: { color: true, quantity: true },
    orderBy: { slot: "asc" },
  });
  return rows.map((r) => [r.color, r.quantity]);
}

beforeEach(() => {
  mockRequireAuth.mockReset();
});

describe("Keepsake Mushrooms", () => {
  it("gives the host one on planting, and never a second on replanting", async () => {
    const host = await createTestUser();
    const id = await hostWorld(host, []);
    const planted = await plant(host, id);
    expect(planted.status).toBe(200);
    expect(planted.data.message).toContain("keepsake");
    expect(await keepsakes(host.userId)).toHaveLength(1);

    authAs(host);
    const lifted = await pickUpMushroom(new Request("http://localhost"), params(id));
    expect(lifted.status).toBe(200);
    expect((await plant(host, id)).data.message).not.toContain("keepsake");
    expect(await keepsakes(host.userId)).toHaveLength(1);
  });

  it("alternates colors from the host's, one per guest", async () => {
    const host = await createTestUser();
    const guests = [await createTestUser(), await createTestUser(), await createTestUser()];
    const id = await hostWorld(
      host,
      guests.map((g) => g.userId),
    );
    await plant(host, id);
    for (const guest of guests) expect((await claim(guest, id)).status).toBe(200);

    const order = await prisma.gatheringKeepsake.findMany({
      where: { gatheringId: id },
      orderBy: { ordinal: "asc" },
      select: { userId: true, color: true },
    });
    expect(order.map((k) => k.userId)).toEqual([host.userId, ...guests.map((g) => g.userId)]);
    const [first, ...rest] = order.map((k) => k.color);
    const other = first === "red" ? "ourplace" : "red";
    expect(rest).toEqual([other, first, other]);
    expect(await keepsakes(guests[0].userId)).toEqual([[`keepsake_${other}`, 1]]);
  });

  it("gives a guest only one, however often they come back", async () => {
    const host = await createTestUser();
    const guest = await createTestUser();
    const id = await hostWorld(host, [guest.userId]);
    await plant(host, id);
    expect((await claim(guest, id)).data.item).toBeDefined();
    const again = await claim(guest, id);
    expect(again.status).toBe(200);
    expect(again.data.item).toBeUndefined();
    expect(await keepsakes(guest.userId)).toHaveLength(1);
  });

  it("refuses anyone who can't open the gathering, and an unplanted mushroom", async () => {
    const host = await createTestUser();
    const guest = await createTestUser();
    const stranger = await createTestUser();
    const id = await hostWorld(host, [guest.userId]);
    expect((await claim(guest, id)).status).toBe(409);
    await plant(host, id);
    expect((await claim(stranger, id)).status).toBe(404);
    expect(await keepsakes(stranger.userId)).toEqual([]);
  });

  it("records nothing when pockets are full, so the guest can come back", async () => {
    const host = await createTestUser();
    const guest = await createTestUser();
    const id = await hostWorld(host, [guest.userId]);
    await plant(host, id);
    for (let slot = 0; slot < POCKET_SLOTS; slot++) {
      await createTestItem({ ownerId: guest.userId, kind: "note", slot, body: "x" });
    }
    expect((await claim(guest, id)).status).toBe(409);
    expect(await prisma.gatheringKeepsake.count({ where: { userId: guest.userId } })).toBe(0);

    await prisma.item.deleteMany({ where: { ownerId: guest.userId, slot: 0 } });
    expect((await claim(guest, id)).status).toBe(200);
  });

  it("stacks per color, one pocket slot each", async () => {
    const guest = await createTestUser();
    const hosts = [await createTestUser(), await createTestUser(), await createTestUser()];
    for (const [i, host] of hosts.entries()) {
      const id = await hostWorld(host, [guest.userId]);
      await plant(host, id, TILES[i]);
      // Pin the next color: each gathering's host took one already.
      await prisma.gatheringKeepsake.updateMany({
        where: { gatheringId: id },
        data: { color: i < 2 ? "ourplace" : "red" },
      });
      await claim(guest, id);
    }
    expect(await keepsakes(guest.userId)).toEqual([
      ["keepsake_red", 2],
      ["keepsake_ourplace", 1],
    ]);
  });
});

describe("a keepsake works like a flower", () => {
  async function stackOf(owner: AuthPayload, color: string, quantity: number) {
    return createTestItem({
      ownerId: owner.userId,
      kind: "keepsake_mushroom",
      color,
      quantity,
      slot: 0,
    });
  }

  it("wears one off a stack, and goes back onto it", async () => {
    const me = await createTestUser();
    const stack = await stackOf(me, "keepsake_red", 3);
    authAs(me);
    const worn = await hatRoute(jsonRequest("http://localhost/api/hat", { item_id: stack }));
    expect(worn.status).toBe(200);
    expect((await worn.json()).hat).toMatchObject({ color: "keepsake_red", quantity: 1 });
    expect(await keepsakes(me.userId)).toEqual([["keepsake_red", 2]]);
    expect(await keepsakes(me.userId, "head")).toEqual([["keepsake_red", 1]]);

    expect((await takeOffRoute()).status).toBe(200);
    expect(await keepsakes(me.userId)).toEqual([["keepsake_red", 3]]);
    expect(await keepsakes(me.userId, "head")).toEqual([]);
  });

  it("swaps a worn flower back into pockets when a keepsake goes on", async () => {
    const me = await createTestUser();
    const stack = await stackOf(me, "keepsake_ourplace", 2);
    await createTestItem({
      ownerId: me.userId,
      kind: "flower",
      color: "pink",
      location: "head",
      slot: 0,
    });
    authAs(me);
    expect(
      (await hatRoute(jsonRequest("http://localhost/api/hat", { item_id: stack }))).status,
    ).toBe(200);
    const flower = await prisma.item.findFirst({
      where: { ownerId: me.userId, kind: "flower" },
      select: { location: true },
    });
    expect(flower?.location).toBe("pocket");
  });

  it("places in the world already grown, and picks back up onto its stack", async () => {
    const me = await createTestUser();
    const stack = await stackOf(me, "keepsake_red", 2);
    authAs(me);
    const placed = await plantRoute(
      jsonRequest("http://localhost/api/world/plants", {
        item_id: stack,
        world: "capital",
        ...TILES[0],
      }),
    );
    expect(placed.status).toBe(200);
    const plant = (await placed.json()).plant as PlantWire;
    expect(plant.color).toBe("keepsake_red");
    expect(await keepsakes(me.userId)).toEqual([["keepsake_red", 1]]);

    const picked = await pickRoute(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: plant.id }),
    });
    expect(picked.status).toBe(200);
    expect(await keepsakes(me.userId)).toEqual([["keepsake_red", 2]]);
  });

  it("mails one at a time, keeping its color", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    const stack = await stackOf(me, "keepsake_ourplace", 2);
    await prisma.user.update({
      where: { id: friend.userId },
      data: { islandVisibility: "anyone" },
    });
    authAs(me);
    const left = await leaveRoute(
      jsonRequest(`http://localhost/api/users/${friend.username}/mailbox`, { item_id: stack }),
      { params: Promise.resolve({ username: friend.username }) },
    );
    expect(left.status).toBe(200);
    expect(await keepsakes(me.userId)).toEqual([["keepsake_ourplace", 1]]);
    expect(await keepsakes(friend.userId, "mailbox")).toEqual([["keepsake_ourplace", 1]]);
  });
});
