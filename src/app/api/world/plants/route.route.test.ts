import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { POCKET_SLOTS } from "@/lib/items";
import { presenceHub, type PresenceEvent } from "@/lib/presence";
import { ownIslandWorld } from "@/lib/event-mushroom-planting";
import { CAPITAL } from "@/lib/game/worlds/world-map";
import { islandWorldId } from "@/lib/game/worlds/island";
import {
  BLOOM_MAX_MS,
  BLOOM_MIN_MS,
  CAPITAL_PLANT_CAP,
  ISLAND_PLANT_CAP,
  plotProblem,
} from "@/lib/game/plants";
import { buildSolidGrid } from "@/lib/game/iso-collision";
import type { IsoWorld } from "@/lib/game/world-model";
import type { AuthPayload, PlantWire, PocketItem } from "@/lib/types";
import { createTestItem, createTestUser, jsonRequest } from "@/test/route-helpers";
import { GET as listRoute, POST as plantRoute } from "./route";
import { DELETE as pickRoute } from "./[id]/route";
import { GET as hatGet, POST as wearRoute, DELETE as takeOffRoute } from "@/app/api/hat/route";
import { POST as leaveRoute } from "@/app/api/users/[username]/mailbox/route";
import { POST as takeRoute } from "@/app/api/mailbox/[id]/take/route";
import { DELETE as discardRoute } from "@/app/api/pockets/[id]/route";
import { POST as moveRoute } from "@/app/api/presence/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

/** Open tiles in `world` the shared rule allows, searching outward from spawn
 * so they're somewhere a member can reach. */
function openTiles(world: IsoWorld, count: number): { col: number; row: number }[] {
  const found: { col: number; row: number }[] = [];
  const { col: sc, row: sr } = world.spawn;
  for (let d = 3; d < 60 && found.length < count; d++) {
    for (let dc = -d; dc <= d && found.length < count; dc++) {
      const col = Math.floor(sc) + dc;
      const row = Math.floor(sr) + d;
      if (plotProblem(world, col, row) === null) found.push({ col, row });
    }
  }
  if (found.length < count) throw new Error(`Not enough open tiles in ${world.id}`);
  return found;
}

const [CAPITAL_TILE, CAPITAL_TILE_2] = openTiles(CAPITAL, 2);

function list(world: string) {
  return listRoute(new NextRequest(`http://localhost/api/world/plants?world=${world}`));
}

async function plant(itemId: string, world: string, tile: { col: number; row: number }) {
  return plantRoute(
    jsonRequest("http://localhost/api/world/plants", { item_id: itemId, world, ...tile }),
  );
}

function pick(id: string) {
  return pickRoute(new Request(`http://localhost/api/world/plants/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

async function seedFor(userId: string, slot = 0) {
  return createTestItem({ ownerId: userId, kind: "seed", slot });
}

async function flowerFor(userId: string, color = "blue", slot = 0) {
  return createTestItem({ ownerId: userId, kind: "flower", color, slot });
}

/** Plant rows straight into the table, for caps and bloom times. */
async function standingPlants(ownerId: string, worldId: string, count: number) {
  await prisma.worldPlant.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      ownerId,
      worldId,
      col: i,
      row: 0,
      color: "red",
      bloomsAt: null,
    })),
  });
}

async function pockets(userId: string) {
  return prisma.item.findMany({
    where: { ownerId: userId, location: "pocket" },
    select: { kind: true, color: true, slot: true },
    orderBy: { slot: "asc" },
  });
}

async function fillPockets(userId: string, from = 0) {
  for (let slot = from; slot < POCKET_SLOTS; slot++) {
    await createTestItem({ ownerId: userId, kind: "note", slot, body: "x" });
  }
}

describe("GET and POST /api/world/plants", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("returns 401 when not logged in", async () => {
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await list("capital")).status).toBe(401);
  });

  it("plants a seed from pockets in the Capital, blooming in 12 to 24 hours", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const seed = await seedFor(ann.userId);
    const before = Date.now();

    const res = await plant(seed, "capital", CAPITAL_TILE);

    expect(res.status).toBe(200);
    const { plant: wire } = (await res.json()) as { plant: PlantWire };
    expect(wire).toMatchObject({ ...CAPITAL_TILE, mine: true, color: null });
    expect(await pockets(ann.userId)).toEqual([]);
    const row = await prisma.worldPlant.findUniqueOrThrow({ where: { id: wire.id } });
    expect(row.yieldsSeed).toBe(true);
    const delay = row.bloomsAt!.getTime() - before;
    expect(delay).toBeGreaterThanOrEqual(BLOOM_MIN_MS - 1000);
    expect(delay).toBeLessThanOrEqual(BLOOM_MAX_MS + 1000);
  });

  it("shows everyone the seed, but never its color before it blooms", async () => {
    const ann = await createTestUser({ displayName: "Ann" });
    authAs(ann);
    const { plant: wire } = (await (
      await plant(await seedFor(ann.userId), "capital", CAPITAL_TILE)
    ).json()) as {
      plant: PlantWire;
    };

    authAs(await createTestUser());
    const seen = (await (await list("capital")).json()).plants as PlantWire[];
    expect(seen).toEqual([
      {
        id: wire.id,
        ...CAPITAL_TILE,
        owner: { username: ann.username, display_name: "Ann" },
        mine: false,
        color: null,
      },
    ]);

    await prisma.worldPlant.update({
      where: { id: wire.id },
      data: { bloomsAt: new Date(Date.now() - 1000), color: "pink" },
    });
    const bloomed = (await (await list("capital")).json()).plants as PlantWire[];
    expect(bloomed[0].color).toBe("pink");
  });

  it("places a flower that's already in bloom and never yields a seed", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const res = await plant(await flowerFor(ann.userId, "yellow"), "capital", CAPITAL_TILE);
    const { plant: wire } = (await res.json()) as { plant: PlantWire };
    expect(wire.color).toBe("yellow");

    const picked = await pick(wire.id);
    expect(picked.status).toBe(200);
    const { items } = (await picked.json()) as { items: PocketItem[] };
    expect(items.map((i) => [i.kind, i.color])).toEqual([["flower", "yellow"]]);
  });

  it("plants on the member's own island but never on someone else's or indoors", async () => {
    const ann = await createTestUser();
    const ben = await createTestUser();
    const island = await ownIslandWorld(ann.userId);
    const [tile] = openTiles(island, 1);
    authAs(ann);

    expect(
      (await plant(await seedFor(ann.userId, 0), islandWorldId(ann.userId), tile)).status,
    ).toBe(200);
    expect(
      (await plant(await seedFor(ann.userId, 1), islandWorldId(ben.userId), tile)).status,
    ).toBe(403);
    expect(
      (await plant(await seedFor(ann.userId, 2), "music-inside", { col: 4, row: 4 })).status,
    ).toBe(403);
  });

  it("refuses solid ground and a tile something already grows on", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const grid = buildSolidGrid(CAPITAL);
    const solidRow = grid.findIndex((r) => r.some(Boolean));
    const solid = { col: grid[solidRow].indexOf(true), row: solidRow };

    expect((await plant(await seedFor(ann.userId, 0), "capital", solid)).status).toBe(400);
    expect((await plant(await seedFor(ann.userId, 1), "capital", CAPITAL_TILE)).status).toBe(200);
    const again = await plant(await seedFor(ann.userId, 2), "capital", CAPITAL_TILE);
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe("Something's already growing there.");
  });

  it("refuses anything that isn't a seed or a flower", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const note = await createTestItem({ ownerId: ann.userId, kind: "note", slot: 0, body: "hi" });
    expect((await plant(note, "capital", CAPITAL_TILE)).status).toBe(400);
  });

  it("allows 10 things growing in the Capital per member, then refuses", async () => {
    const ann = await createTestUser();
    authAs(ann);
    await standingPlants(ann.userId, "capital", CAPITAL_PLANT_CAP);

    const res = await plant(await seedFor(ann.userId), "capital", CAPITAL_TILE_2);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/10 things growing in the Capital/);
    expect(await pockets(ann.userId)).toHaveLength(1);
  });

  it("bounds a member's own island too", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const islandId = islandWorldId(ann.userId);
    await standingPlants(ann.userId, islandId, ISLAND_PLANT_CAP);
    // The bulk rows all sit on row 0, and open tiles start rows below spawn.
    const [tile] = openTiles(await ownIslandWorld(ann.userId), 1);

    expect((await plant(await seedFor(ann.userId), islandId, tile)).status).toBe(409);
  });
});

describe("DELETE /api/world/plants/[id]", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  async function plantedSeed(user: AuthPayload) {
    authAs(user);
    const res = await plant(await seedFor(user.userId), "capital", CAPITAL_TILE);
    return ((await res.json()) as { plant: PlantWire }).plant.id;
  }

  it("gives the seed back when dug up before it blooms", async () => {
    const ann = await createTestUser();
    const id = await plantedSeed(ann);

    const res = await pick(id);

    expect(res.status).toBe(200);
    expect((await pockets(ann.userId)).map((i) => i.kind)).toEqual(["seed"]);
    expect(await prisma.worldPlant.count()).toBe(0);
  });

  it("gives a flower of its color and a seed when a bloom is picked", async () => {
    const ann = await createTestUser();
    const id = await plantedSeed(ann);
    await prisma.worldPlant.update({
      where: { id },
      data: { bloomsAt: new Date(Date.now() - 1000), color: "purple" },
    });

    const res = await pick(id);

    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("You picked the flower, and found a seed.");
    expect((await pockets(ann.userId)).map((i) => [i.kind, i.color])).toEqual([
      ["flower", "purple"],
      ["seed", null],
    ]);
  });

  it("only gives that seed once: a replanted flower yields none", async () => {
    const ann = await createTestUser();
    const id = await plantedSeed(ann);
    await prisma.worldPlant.update({ where: { id }, data: { bloomsAt: new Date(0) } });
    await pick(id);
    const flower = await prisma.item.findFirstOrThrow({
      where: { ownerId: ann.userId, kind: "flower" },
    });

    const replanted = await plant(flower.id, "capital", CAPITAL_TILE);
    const again = await pick(((await replanted.json()) as { plant: PlantWire }).plant.id);

    expect((await again.json()).items.map((i: PocketItem) => i.kind)).toEqual(["flower"]);
    expect(await prisma.item.count({ where: { ownerId: ann.userId, kind: "seed" } })).toBe(1);
  });

  it("needs room for both the flower and its seed", async () => {
    const ann = await createTestUser();
    const id = await plantedSeed(ann);
    await prisma.worldPlant.update({ where: { id }, data: { bloomsAt: new Date(0) } });
    await fillPockets(ann.userId, 1);

    const res = await pick(id);

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/two things/);
    expect(await prisma.worldPlant.count()).toBe(1);
  });

  it("lets only the planter pick it up", async () => {
    const id = await plantedSeed(await createTestUser());
    authAs(await createTestUser());

    expect((await pick(id)).status).toBe(403);
    expect(await prisma.worldPlant.count()).toBe(1);
  });
});

describe("gifts by mail", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  function leave(username: string, itemId: string) {
    return leaveRoute(
      jsonRequest(`http://localhost/api/users/${username}/mailbox`, { item_id: itemId }),
      { params: Promise.resolve({ username }) },
    );
  }

  it("moves a flower into a friend's mailbox, color and all, and they take it", async () => {
    const owner = await createTestUser();
    await prisma.user.update({ where: { id: owner.userId }, data: { islandVisibility: "anyone" } });
    const sender = await createTestUser();
    const flower = await flowerFor(sender.userId, "pink");
    authAs(sender);

    const res = await leave(owner.username, flower);
    expect(res.status).toBe(200);
    expect((await res.json()).message).toBe("Gift left.");

    authAs(owner);
    const taken = await takeRoute(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: flower }),
    });
    expect(taken.status).toBe(200);
    expect(await pockets(owner.userId)).toEqual([{ kind: "flower", color: "pink", slot: 0 }]);
  });

  it("mails a seed, but never an Event Mushroom", async () => {
    const owner = await createTestUser();
    await prisma.user.update({ where: { id: owner.userId }, data: { islandVisibility: "anyone" } });
    const sender = await createTestUser();
    authAs(sender);

    expect((await leave(owner.username, await seedFor(sender.userId, 0))).status).toBe(200);
    const mushroom = await createTestItem({
      ownerId: sender.userId,
      kind: "event_mushroom",
      slot: 1,
    });
    expect((await leave(owner.username, mushroom)).status).toBe(400);
  });
});

describe("/api/hat", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  function wear(itemId: string) {
    return wearRoute(jsonRequest("http://localhost/api/hat", { item_id: itemId }));
  }

  it("wears a flower, swaps it for another, and takes it off", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const red = await flowerFor(ann.userId, "red", 0);
    const blue = await flowerFor(ann.userId, "blue", 3);

    expect((await wear(red)).status).toBe(200);
    expect((await (await hatGet()).json()).hat.color).toBe("red");
    expect((await pockets(ann.userId)).map((i) => i.color)).toEqual(["blue"]);

    expect((await wear(blue)).status).toBe(200);
    expect((await (await hatGet()).json()).hat.color).toBe("blue");
    // The red one landed in the slot the blue one left.
    expect(await pockets(ann.userId)).toEqual([{ kind: "flower", color: "red", slot: 3 }]);

    expect((await takeOffRoute()).status).toBe(200);
    expect((await (await hatGet()).json()).hat).toBeNull();
    expect(await pockets(ann.userId)).toHaveLength(2);
  });

  it("refuses to take it off into full pockets, and to wear anything but a flower", async () => {
    const ann = await createTestUser();
    authAs(ann);
    await wear(await flowerFor(ann.userId, "red", 0));
    const seed = await seedFor(ann.userId, 0);
    expect((await wear(seed)).status).toBe(400);
    await fillPockets(ann.userId, 1);

    const res = await takeOffRoute();
    expect(res.status).toBe(409);
    expect((await (await hatGet()).json()).hat.color).toBe("red");
  });

  it("won't throw away the flower you're wearing", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const red = await flowerFor(ann.userId, "red", 0);
    await wear(red);

    const res = await discardRoute(new Request("http://localhost", { method: "DELETE" }), {
      params: Promise.resolve({ id: red }),
    });
    expect(res.status).toBe(409);
  });

  it("shows the hat to others in the world, and changes it live, but never a ghost's", async () => {
    const ann = await createTestUser();
    const ghost = await createTestUser();
    await prisma.user.update({ where: { id: ghost.userId }, data: { ghost: true } });
    const heard: { event: PresenceEvent; data: unknown }[] = [];
    const sub = presenceHub().subscribe({
      userId: "listener",
      worldId: "health-inside",
      send: (event, data) => heard.push({ event, data }),
    });

    authAs(ann);
    await wear(await flowerFor(ann.userId, "yellow", 0));
    const move = (world: string) =>
      moveRoute(
        jsonRequest("/api/presence", { world_id: world, col: 3, row: 4, dir: "S", moving: false }),
      );
    expect((await move("health-inside")).status).toBe(200);
    const update = heard.find(
      (h) => h.event === "update" && (h.data as { user_id: string }).user_id === ann.userId,
    );
    expect((update?.data as { hat: string }).hat).toBe("yellow");

    await wear(await flowerFor(ann.userId, "purple", 0));
    const updates = heard.filter(
      (h) => h.event === "update" && (h.data as { user_id: string }).user_id === ann.userId,
    );
    expect((updates.at(-1)?.data as { hat: string }).hat).toBe("purple");

    authAs(ghost);
    await wear(await flowerFor(ghost.userId, "red", 0));
    await move("health-inside");
    expect(heard.some((h) => (h.data as { user_id?: string }).user_id === ghost.userId)).toBe(
      false,
    );

    if (sub.ok) sub.unsubscribe();
  });
});
