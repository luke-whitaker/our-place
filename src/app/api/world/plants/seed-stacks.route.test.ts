import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { MAX_STACK, POCKET_SLOTS } from "@/lib/items";
import { CAPITAL } from "@/lib/game/worlds/world-map";
import { plotProblem } from "@/lib/game/plants";
import type { AuthPayload, PlantWire, PocketItem } from "@/lib/types";
import { createTestItem, createTestUser, jsonRequest } from "@/test/route-helpers";
import { POST as plantRoute } from "./route";
import { DELETE as pickRoute } from "./[id]/route";
import { POST as leaveRoute } from "@/app/api/users/[username]/mailbox/route";
import { POST as takeRoute } from "@/app/api/mailbox/[id]/take/route";
import { DELETE as discardRoute } from "@/app/api/pockets/[id]/route";
import { POST as deskStoreRoute } from "@/app/api/desk/route";
import { POST as deskTakeRoute } from "@/app/api/desk/[id]/take/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

/** Open Capital tiles near spawn the planting rule allows. */
function openTiles(count: number): { col: number; row: number }[] {
  const found: { col: number; row: number }[] = [];
  const { col: sc, row: sr } = CAPITAL.spawn;
  for (let d = 3; d < 60 && found.length < count; d++) {
    for (let dc = -d; dc <= d && found.length < count; dc++) {
      const col = Math.floor(sc) + dc;
      const row = Math.floor(sr) + d;
      if (plotProblem(CAPITAL, col, row) === null) found.push({ col, row });
    }
  }
  return found;
}
const TILES = openTiles(3);

function plant(itemId: string, tile: { col: number; row: number }) {
  return plantRoute(
    jsonRequest("http://localhost/api/world/plants", {
      item_id: itemId,
      world: "capital",
      ...tile,
    }),
  );
}

function pick(id: string) {
  return pickRoute(new Request(`http://localhost/api/world/plants/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

function leave(username: string, itemId: string) {
  return leaveRoute(
    jsonRequest(`http://localhost/api/users/${username}/mailbox`, { item_id: itemId }),
    { params: Promise.resolve({ username }) },
  );
}

function take(id: string) {
  return takeRoute(new Request("http://localhost", { method: "POST" }), {
    params: Promise.resolve({ id }),
  });
}

function discard(id: string) {
  return discardRoute(new Request("http://localhost", { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

/** Every item a member holds in one location, as [kind, quantity, slot]. */
async function held(userId: string, location = "pocket") {
  const rows = await prisma.item.findMany({
    where: { ownerId: userId, location },
    select: { kind: true, quantity: true, slot: true },
    orderBy: { slot: "asc" },
  });
  return rows.map((r) => [r.kind, r.quantity, r.slot]);
}

function seeds(userId: string, quantity: number, slot = 0, location = "pocket") {
  return createTestItem({ ownerId: userId, kind: "seed", slot, quantity, location });
}

async function fillPockets(userId: string, from: number) {
  for (let slot = from; slot < POCKET_SLOTS; slot++) {
    await createTestItem({ ownerId: userId, kind: "note", slot, body: "x" });
  }
}

describe("planting from a seed stack", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("takes one seed per planting and removes the stack at zero", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const stack = await seeds(ann.userId, 2);

    expect((await plant(stack, TILES[0])).status).toBe(200);
    expect(await held(ann.userId)).toEqual([["seed", 1, 0]]);

    expect((await plant(stack, TILES[1])).status).toBe(200);
    expect(await held(ann.userId)).toEqual([]);

    expect((await plant(stack, TILES[2])).status).toBe(404);
    expect(await prisma.worldPlant.count()).toBe(2);
  });
});

describe("picking up into a seed stack", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  async function plantedFrom(user: AuthPayload, stackId: string) {
    authAs(user);
    const res = await plant(stackId, TILES[0]);
    return ((await res.json()) as { plant: PlantWire }).plant.id;
  }

  it("puts a dug-up seed back on the stack it came from", async () => {
    const ann = await createTestUser();
    const id = await plantedFrom(ann, await seeds(ann.userId, 3));
    expect(await held(ann.userId)).toEqual([["seed", 2, 0]]);

    expect((await pick(id)).status).toBe(200);
    expect(await held(ann.userId)).toEqual([["seed", 3, 0]]);
  });

  it("merges a bloom's seed into the stack, so a flower needs only one free slot", async () => {
    const ann = await createTestUser();
    const id = await plantedFrom(ann, await seeds(ann.userId, 4));
    await prisma.worldPlant.update({
      where: { id },
      data: { bloomsAt: new Date(0), color: "blue" },
    });
    await fillPockets(ann.userId, 2);

    const res = await pick(id);

    expect(res.status).toBe(200);
    const { items } = (await res.json()) as { items: PocketItem[] };
    expect(items.map((i) => [i.kind, i.quantity])).toEqual([
      ["flower", 1],
      ["seed", 4],
    ]);
    expect((await held(ann.userId)).slice(0, 2)).toEqual([
      ["seed", 4, 0],
      ["flower", 1, 1],
    ]);
  });
});

describe("seeds by mail", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  async function openOwner() {
    const owner = await createTestUser();
    await prisma.user.update({ where: { id: owner.userId }, data: { islandVisibility: "anyone" } });
    return owner;
  }

  it("leaves one seed from a stack, and the friend's take joins their own stack", async () => {
    const owner = await openOwner();
    await seeds(owner.userId, 2);
    const sender = await createTestUser();
    const stack = await seeds(sender.userId, 5);
    authAs(sender);

    expect((await leave(owner.username, stack)).status).toBe(200);
    expect(await held(sender.userId)).toEqual([["seed", 4, 0]]);
    const gift = await prisma.item.findFirstOrThrow({
      where: { ownerId: owner.userId, location: "mailbox" },
    });
    expect(gift).toMatchObject({ kind: "seed", quantity: 1, fromId: sender.userId });

    authAs(owner);
    const res = await take(gift.id);
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ kind: "seed", quantity: 3, slot: 0 });
    expect(await held(owner.userId)).toEqual([["seed", 3, 0]]);
    expect(await held(owner.userId, "mailbox")).toEqual([]);
  });

  it("gives the last seed of a stack, leaving nothing behind", async () => {
    const owner = await openOwner();
    const sender = await createTestUser();
    const stack = await seeds(sender.userId, 1);
    authAs(sender);

    expect((await leave(owner.username, stack)).status).toBe(200);
    expect(await held(sender.userId)).toEqual([]);
    expect(await held(owner.userId, "mailbox")).toEqual([["seed", 1, 0]]);
  });
});

describe("throwing away and the desk", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("throws seeds away one at a time", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const stack = await seeds(ann.userId, 2);

    expect((await discard(stack)).status).toBe(200);
    expect(await held(ann.userId)).toEqual([["seed", 1, 0]]);
    expect((await discard(stack)).status).toBe(200);
    expect(await held(ann.userId)).toEqual([]);
  });

  it("moves a whole stack into the desk, merging with the desk's, and back", async () => {
    const ann = await createTestUser();
    authAs(ann);
    const desk = await seeds(ann.userId, 3, 4, "desk");
    const pocketStack = await seeds(ann.userId, 5);

    const stored = await deskStoreRoute(
      jsonRequest("http://localhost/api/desk", { item_id: pocketStack, slot: 0 }),
    );
    expect(stored.status).toBe(200);
    expect((await stored.json()).item).toMatchObject({ id: desk, quantity: 8, slot: 4 });
    expect(await held(ann.userId)).toEqual([]);

    const back = await deskTakeRoute(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: desk }),
    });
    expect(back.status).toBe(200);
    expect(await held(ann.userId)).toEqual([["seed", 8, 0]]);
    expect(await held(ann.userId, "desk")).toEqual([]);
  });
});

describe("stack bounds", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("never grows a stack past MAX_STACK: a full stack's seed takes a new slot", async () => {
    const ann = await createTestUser();
    authAs(ann);
    await seeds(ann.userId, MAX_STACK, 0);
    const one = await seeds(ann.userId, 1, 1);
    const res = await plant(one, TILES[0]);
    const { plant: wire } = (await res.json()) as { plant: PlantWire };

    expect((await pick(wire.id)).status).toBe(200);
    expect(await held(ann.userId)).toEqual([
      ["seed", MAX_STACK, 0],
      ["seed", 1, 1],
    ]);
  });

  it("refuses a quantity below 1 or above MAX_STACK in the database itself", async () => {
    const ann = await createTestUser();
    await expect(seeds(ann.userId, 0)).rejects.toThrow();
    await expect(seeds(ann.userId, MAX_STACK + 1, 1)).rejects.toThrow();
  });
});
