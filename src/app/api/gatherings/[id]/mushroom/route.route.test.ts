import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { MAILBOX_SLOTS, POCKET_SLOTS } from "@/lib/items";
import { cancelUnplanted } from "@/lib/gathering-sweep";
import { checkWorldAccess } from "@/lib/presence-access";
import { CAPITAL } from "@/lib/game/worlds/world-map";
import { buildIsland, islandWorldId } from "@/lib/game/worlds/island";
import { findInterior } from "@/lib/game/worlds/interiors";
import { plantProblem } from "@/lib/game/event-mushroom";
import type { IsoWorld } from "@/lib/game/world-model";
import type { AuthPayload, GatheringTravelStop, PlantedMushroomWire } from "@/lib/types";
import { createTestItem, createTestUser, jsonRequest } from "@/test/route-helpers";
import { POST as create } from "../../route";
import { GET as detail } from "../route";
import { POST as cancelRoute } from "../cancel/route";
import { POST as respondRoute } from "../response/route";
import { POST as plantRoute, DELETE as pickUpRoute } from "./route";
import { GET as mushroomsRoute } from "../../mushrooms/route";
import { GET as travelRoute } from "../../travel/route";
import { GET as calendarRoute } from "../../calendar/route";
import { GET as pocketsRoute } from "@/app/api/pockets/route";
import { POST as deskRoute } from "@/app/api/desk/route";
import { DELETE as discardRoute } from "@/app/api/pockets/[id]/route";
import { GET as islandRoute } from "@/app/api/users/[username]/island/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const HOUR = 60 * 60 * 1000;
const inHours = (h: number) => new Date(Date.now() + h * HOUR).toISOString();

/** The first tile in `world` the shared rule lets a mushroom stand on,
 * searching outward from spawn so it's somewhere a member can reach. */
function openTile(world: IsoWorld): { col: number; row: number } {
  const { col: sc, row: sr } = world.spawn;
  for (let d = 3; d < 40; d++) {
    for (let dc = -d; dc <= d; dc++) {
      const col = Math.floor(sc) + dc;
      const row = Math.floor(sr) + d;
      if (plantProblem(world, col, row) === null) return { col, row };
    }
  }
  throw new Error(`No open tile in ${world.id}`);
}

const CAPITAL_TILE = openTile(CAPITAL);

async function hostWorld(as: AuthPayload, inviteeIds: string[] = []) {
  authAs(as);
  const res = await create(
    jsonRequest("http://localhost/api/gatherings", {
      kind: "world",
      title: "Lantern walk",
      starts_at: inHours(24),
      ends_at: inHours(26),
      invitee_ids: inviteeIds,
    }),
  );
  const data = await res.json();
  return { status: res.status, data, id: data.gathering?.id as string };
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function plant(as: AuthPayload, id: string, world: string, tile = CAPITAL_TILE) {
  authAs(as);
  const res = await plantRoute(
    jsonRequest(`http://localhost/api/gatherings/${id}/mushroom`, { world, ...tile }),
    params(id),
  );
  return { status: res.status, data: await res.json() };
}

async function pickUp(as: AuthPayload, id: string) {
  authAs(as);
  const res = await pickUpRoute(
    new Request(`http://localhost/api/gatherings/${id}/mushroom`, { method: "DELETE" }),
    params(id),
  );
  return { status: res.status, data: await res.json() };
}

/** Move the host's mushroom from their mailbox into their pockets, as taking
 * it from the mailbox would. */
async function pocketMushroom(hostId: string, id: string) {
  await prisma.item.updateMany({
    where: { ownerId: hostId, gatheringId: id, kind: "event_mushroom" },
    data: { location: "pocket", slot: 0, placedAt: null },
  });
}

async function hostAndPlant(as: AuthPayload, inviteeIds: string[] = []) {
  const { id } = await hostWorld(as, inviteeIds);
  await pocketMushroom(as.userId, id);
  expect((await plant(as, id, "capital")).status).toBe(200);
  return id;
}

async function standing(as: AuthPayload, world: string): Promise<PlantedMushroomWire[]> {
  authAs(as);
  const res = await mushroomsRoute(
    new NextRequest(
      new URL(`http://localhost/api/gatherings/mushrooms?world=${encodeURIComponent(world)}`),
    ),
  );
  const data = await res.json();
  return res.status === 200 ? data.mushrooms : [];
}

async function stops(as: AuthPayload): Promise<GatheringTravelStop[]> {
  authAs(as);
  return (await (await travelRoute()).json()).stops;
}

async function mushroomItems(ownerId: string) {
  return prisma.item.findMany({
    where: { ownerId, kind: "event_mushroom" },
    select: { location: true, slot: true },
  });
}

async function fill(ownerId: string, location: "mailbox" | "pocket", slots: number) {
  for (let slot = 0; slot < slots; slot++) {
    await createTestItem({ ownerId, kind: "note", location, slot, body: "x" });
  }
}

/** Make a gathering start (or end) now, as the clock would. */
async function startNow(id: string, endsInHours = 2) {
  await prisma.gathering.update({
    where: { id },
    data: { startsAt: new Date(Date.now() - 60_000), endsAt: new Date(inHours(endsInHours)) },
  });
}

beforeEach(() => {
  mockRequireAuth.mockReset();
});

describe("creating a gathering in the world", () => {
  it("puts the Event Mushroom in the host's mailbox", async () => {
    const me = await createTestUser();
    const made = await hostWorld(me);
    expect(made.status).toBe(201);
    expect(await mushroomItems(me.userId)).toEqual([{ location: "mailbox", slot: 0 }]);
  });

  it("falls back to pockets when the mailbox is full", async () => {
    const me = await createTestUser();
    await fill(me.userId, "mailbox", MAILBOX_SLOTS);
    expect((await hostWorld(me)).status).toBe(201);
    expect(await mushroomItems(me.userId)).toEqual([{ location: "pocket", slot: 0 }]);
  });

  it("refuses, and makes nothing, when both are full", async () => {
    const me = await createTestUser();
    await fill(me.userId, "mailbox", MAILBOX_SLOTS);
    await fill(me.userId, "pocket", POCKET_SLOTS);
    const made = await hostWorld(me);
    expect(made.status).toBe(409);
    expect(made.data.error).toMatch(/Make room in your mailbox or pockets/);
    expect(await prisma.gathering.count({ where: { hostId: me.userId } })).toBe(0);
  });
});

describe("planting", () => {
  it("lets only the host plant, from pockets, in a world they may use, on open ground", async () => {
    const me = await createTestUser();
    const guest = await createTestUser();
    const stranger = await createTestUser();
    const { id } = await hostWorld(me, [guest.userId]);

    expect((await plant(me, id, "capital")).status).toBe(409); // still in the mailbox
    await pocketMushroom(me.userId, id);
    expect((await plant(guest, id, "capital")).status).toBe(403);
    expect((await plant(stranger, id, "capital")).status).toBe(404);
    expect((await plant(me, id, islandWorldId(guest.userId))).status).toBe(403);
    expect((await plant(me, id, "welcome-center-inside")).status).toBe(403);
    const shrine = CAPITAL.mushrooms[0];
    expect((await plant(me, id, "capital", { col: shrine.col, row: shrine.row })).status).toBe(400);

    const planted = await plant(me, id, "capital");
    expect(planted.status).toBe(200);
    expect(await mushroomItems(me.userId)).toEqual([]);
    const row = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ mushroomWorld: "capital", ...toCols(CAPITAL_TILE) });
    expect(row.plantedAt).not.toBeNull();
    expect((await plant(me, id, "capital")).status).toBe(409); // already planted
  });

  it("plants inside the building of the gathering's community, and no other", async () => {
    const me = await createTestUser();
    const food = await prisma.community.create({
      data: {
        name: "Food",
        slug: "food",
        description: "",
        category: "General",
        creatorId: me.userId,
      },
      select: { id: true },
    });
    await prisma.communityMember.create({ data: { userId: me.userId, communityId: food.id } });
    authAs(me);
    const res = await create(
      jsonRequest("http://localhost/api/gatherings", {
        kind: "world",
        title: "Soup swap",
        starts_at: inHours(24),
        ends_at: inHours(26),
        community_id: food.id,
      }),
    );
    const id = (await res.json()).gathering.id as string;
    await pocketMushroom(me.userId, id);
    const room = findInterior("food-inside");
    if (!room) throw new Error("The food building has a room");
    expect((await plant(me, id, "music-inside", openTile(room))).status).toBe(403);
    expect((await plant(me, id, "food-inside", openTile(room))).status).toBe(200);
  });

  it("plants on the host's own island", async () => {
    const me = await createTestUser();
    const { id } = await hostWorld(me);
    await pocketMushroom(me.userId, id);
    const island = buildIsland({
      owner: { id: me.userId, username: me.username, displayName: "Host" },
      biome: "forest",
      mailboxColor: "slate",
      isOwn: true,
    });
    const tile = openTile(island);
    expect((await plant(me, id, islandWorldId(me.userId), tile)).status).toBe(200);
  });

  it("never stacks two mushrooms on one tile", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    await hostAndPlant(a);
    const { id } = await hostWorld(b);
    await pocketMushroom(b.userId, id);
    expect((await plant(b, id, "capital")).status).toBe(400);
  });

  it("locks the mushroom at the start", async () => {
    const me = await createTestUser();
    const id = await hostAndPlant(me);
    await startNow(id);
    expect((await pickUp(me, id)).status).toBe(409);
  });
});

describe("picking up", () => {
  it("puts it back in pockets before the start, ready to plant again", async () => {
    const me = await createTestUser();
    const id = await hostAndPlant(me);
    const lifted = await pickUp(me, id);
    expect(lifted.status).toBe(200);
    expect(await mushroomItems(me.userId)).toEqual([{ location: "pocket", slot: 0 }]);
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).plantedAt).toBeNull();
    expect((await plant(me, id, "capital")).status).toBe(200);
  });

  it("needs a free pocket", async () => {
    const me = await createTestUser();
    const id = await hostAndPlant(me);
    await fill(me.userId, "pocket", POCKET_SLOTS);
    expect((await pickUp(me, id)).status).toBe(409);
  });
});

describe("what stands in the world", () => {
  it("shows a planted mushroom to everyone there, saying who may open it", async () => {
    const me = await createTestUser();
    const guest = await createTestUser();
    const passerBy = await createTestUser();
    const id = await hostAndPlant(me, [guest.userId]);

    const seenByGuest = await standing(guest, "capital");
    expect(seenByGuest).toContainEqual(
      expect.objectContaining({ gathering_id: id, invited: true }),
    );
    const seenByPasserBy = await standing(passerBy, "capital");
    const mine = seenByPasserBy.find((m) => m.gathering_id === id);
    expect(mine).toEqual({ gathering_id: id, ...CAPITAL_TILE, host: me.username, invited: false });
  });

  it("stops showing it after the end or once cancelled", async () => {
    const me = await createTestUser();
    const ended = await hostAndPlant(me);
    await prisma.gathering.update({
      where: { id: ended },
      data: { startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) },
    });
    expect((await standing(me, "capital")).some((m) => m.gathering_id === ended)).toBe(false);

    const other = await createTestUser();
    const id = await hostAndPlant(other);
    authAs(other);
    await cancelRoute(new Request(`http://localhost/api/gatherings/${id}/cancel`), params(id));
    expect((await standing(other, "capital")).some((m) => m.gathering_id === id)).toBe(false);
  });

  it("keeps a closed island's mushrooms from strangers", async () => {
    const me = await createTestUser();
    await prisma.user.update({ where: { id: me.userId }, data: { islandVisibility: "nobody" } });
    authAs(await createTestUser());
    const res = await mushroomsRoute(
      new NextRequest(
        new URL(`http://localhost/api/gatherings/mushrooms?world=${islandWorldId(me.userId)}`),
      ),
    );
    expect(res.status).toBe(403);
  });

  it("gives the card's details to guests only", async () => {
    const me = await createTestUser();
    const guest = await createTestUser();
    const id = await hostAndPlant(me, [guest.userId]);
    authAs(guest);
    const seen = await detail(new Request("http://localhost"), params(id));
    const body = await seen.json();
    expect(body.gathering.mushroom).toEqual({ planted: true });
    expect(body.gathering.portal).toBe(`/world?place=capital&at=gathering-${id}`);
    authAs(await createTestUser());
    expect((await detail(new Request("http://localhost"), params(id))).status).toBe(404);
  });
});

describe("the network's Gatherings list", () => {
  it("lists a gathering only while its mushroom stands, and only for its guests", async () => {
    const me = await createTestUser();
    const guest = await createTestUser();
    const passerBy = await createTestUser();
    const { id } = await hostWorld(me, [guest.userId]);

    expect((await stops(guest)).some((s) => s.gathering_id === id)).toBe(false); // unplanted
    await pocketMushroom(me.userId, id);
    await plant(me, id, "capital");
    const listed = (await stops(guest)).find((s) => s.gathering_id === id);
    expect(listed).toMatchObject({ place: "capital", spawn_at: `gathering-${id}` });
    expect((await stops(me)).some((s) => s.gathering_id === id)).toBe(true);
    expect((await stops(passerBy)).some((s) => s.gathering_id === id)).toBe(false);

    await prisma.gathering.update({
      where: { id },
      data: { startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) },
    });
    expect((await stops(guest)).some((s) => s.gathering_id === id)).toBe(false); // ended

    const second = await hostAndPlant(me, [guest.userId]);
    authAs(me);
    await cancelRoute(new Request("http://localhost"), params(second));
    expect((await stops(guest)).some((s) => s.gathering_id === second)).toBe(false); // cancelled
  });
});

describe("cancelling an unplanted gathering at its start", () => {
  it("cancels it, removes the mushroom, and tells the host and everyone going, once", async () => {
    const me = await createTestUser();
    const going = await createTestUser();
    const pending = await createTestUser();
    const { id } = await hostWorld(me, [going.userId, pending.userId]);
    authAs(going);
    await respondRoute(
      jsonRequest(`http://localhost/api/gatherings/${id}/response`, { response: "accepted" }),
      params(id),
    );
    await startNow(id);

    expect(await cancelUnplanted()).toBeGreaterThanOrEqual(1);
    const row = await prisma.gathering.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("cancelled");
    expect(await mushroomItems(me.userId)).toEqual([]);
    const told = await prisma.notification.findMany({
      where: { gatheringId: id, kind: "gathering_unplanted" },
      select: { recipientId: true },
    });
    expect(told.map((n) => n.recipientId).sort()).toEqual([me.userId, going.userId].sort());

    expect(await cancelUnplanted()).toBe(0);
    expect(
      await prisma.notification.count({ where: { gatheringId: id, kind: "gathering_unplanted" } }),
    ).toBe(2);
  });

  it("settles as the calendar is read, without waiting for the sweep", async () => {
    const me = await createTestUser();
    const { id } = await hostWorld(me);
    await startNow(id);
    authAs(me);
    const res = await calendarRoute(
      new NextRequest(
        new URL(
          `http://localhost/api/gatherings/calendar?from=${encodeURIComponent(inHours(-48))}&to=${encodeURIComponent(inHours(48))}`,
        ),
      ),
    );
    expect(res.status).toBe(200);
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).status).toBe("cancelled");
  });

  it("leaves a planted gathering alone", async () => {
    const me = await createTestUser();
    const id = await hostAndPlant(me);
    await startNow(id);
    await cancelUnplanted();
    expect((await prisma.gathering.findUniqueOrThrow({ where: { id } })).status).toBe("scheduled");
  });
});

describe("the host's island and a gathering's guests", () => {
  async function islandGathering() {
    const host = await createTestUser({ displayName: "Ada" });
    await prisma.user.update({
      where: { id: host.userId },
      data: { islandVisibility: "nobody" },
    });
    const guest = await createTestUser();
    const { id } = await hostWorld(host, [guest.userId]);
    await pocketMushroom(host.userId, id);
    const island = buildIsland({
      owner: { id: host.userId, username: host.username, displayName: "Ada" },
      biome: "forest",
      mailboxColor: "slate",
      isOwn: true,
    });
    expect((await plant(host, id, islandWorldId(host.userId), openTile(island))).status).toBe(200);
    return { host, guest, id };
  }

  async function visit(as: AuthPayload, username: string, gathering?: string) {
    authAs(as);
    const query = gathering ? `?gathering=${gathering}` : "";
    const res = await islandRoute(
      new NextRequest(new URL(`http://localhost/api/users/${username}/island${query}`)),
      { params: Promise.resolve({ username }) },
    );
    return { status: res.status, body: await res.json() };
  }

  it("lets a guest onto a closed island through the gathering's portal, and only then", async () => {
    const { host, guest, id } = await islandGathering();
    expect((await visit(guest, host.username)).status).toBe(403);
    const through = await visit(guest, host.username, id);
    expect(through.status).toBe(200);
    expect(through.body.via_gathering).toBe(true);
    expect((await checkWorldAccess(guest.userId, islandWorldId(host.userId))).ok).toBe(true);
    expect((await checkWorldAccess(guest.userId, `${islandWorldId(host.userId)}:inside`)).ok).toBe(
      false,
    );
  });

  it("keeps everyone else out, and the guest too once it's over", async () => {
    const { host, guest, id } = await islandGathering();
    const stranger = await createTestUser();
    expect((await visit(stranger, host.username, id)).status).toBe(403);
    await prisma.gathering.update({
      where: { id },
      data: { startsAt: new Date(Date.now() - 3 * HOUR), endsAt: new Date(Date.now() - HOUR) },
    });
    expect((await visit(guest, host.username, id)).status).toBe(403);
  });
});

describe("the mushroom as an item", () => {
  it("can't be thrown away while its gathering is on, and can once it's off", async () => {
    const me = await createTestUser();
    const { id } = await hostWorld(me);
    const item = await prisma.item.findFirstOrThrow({
      where: { ownerId: me.userId, gatheringId: id },
      select: { id: true },
    });
    const discard = async () => {
      authAs(me);
      const res = await discardRoute(new Request("http://localhost"), params(item.id));
      return res.status;
    };
    expect(await discard()).toBe(403);
    // Cancelling removes it; a gathering ended some other way (its community
    // deleted, say) leaves it behind, and then it may go.
    await prisma.gathering.update({ where: { id }, data: { status: "cancelled" } });
    expect(await discard()).toBe(200);
  });

  it("shows its gathering in pockets and stays out of the desk", async () => {
    const me = await createTestUser();
    const { id } = await hostWorld(me);
    await pocketMushroom(me.userId, id);
    authAs(me);
    const pockets = await (await pocketsRoute()).json();
    const item = pockets.items.find((i: { kind: string }) => i.kind === "event_mushroom");
    expect(item.mushroom).toMatchObject({
      title: "Lantern walk",
      worlds: ["capital", islandWorldId(me.userId)],
    });
    const stored = await deskRoute(jsonRequest("http://localhost/api/desk", { item_id: item.id }));
    expect(stored.status).toBe(403);
  });
});

function toCols(tile: { col: number; row: number }) {
  return { mushroomCol: tile.col, mushroomRow: tile.row };
}
