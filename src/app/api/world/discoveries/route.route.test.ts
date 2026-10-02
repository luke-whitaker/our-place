import { describe, it, expect, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { chunkGrid, decodeVisited, encodeVisited, isVisited } from "@/lib/game/map-chunks";
import type { AuthPayload, WorldDiscoveries } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { GET, POST } from "./route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
const mockRequireAuth = vi.mocked(requireAuth);

const GRID = chunkGrid(312, 264);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

/** A Capital bitmap with exactly these chunks set. */
function bitmapWith(...chunks: number[]): string {
  const bytes = new Uint8Array(GRID.bytes);
  for (const c of chunks) bytes[c >> 3] |= 1 << (c & 7);
  return encodeVisited(bytes);
}

async function read(world = "capital") {
  const res = await GET(
    new NextRequest(`http://localhost/api/world/discoveries?world=${encodeURIComponent(world)}`),
  );
  return { status: res.status, body: await res.json() };
}

async function save(body: unknown) {
  const res = await POST(jsonRequest("http://localhost/api/world/discoveries", body));
  return { status: res.status, body: await res.json() };
}

function chunksIn(body: WorldDiscoveries): number[] {
  const visited = decodeVisited(body.visited, GRID)!;
  return Array.from({ length: GRID.cw * GRID.ch }, (_, i) => i).filter((i) =>
    isVisited(visited, i),
  );
}

describe("/api/world/discoveries", () => {
  it("starts empty for a member who hasn't explored", async () => {
    authAs(await createTestUser());
    const { status, body } = await read();
    expect(status).toBe(200);
    expect(body.shrines).toEqual([]);
    expect(chunksIn(body)).toEqual([]);
  });

  it("merges visited chunks with OR and shrines as a set, in any order", async () => {
    authAs(await createTestUser());
    expect((await save({ world: "capital", visited: bitmapWith(3, 40) })).status).toBe(200);
    await save({ world: "capital", visited: bitmapWith(40, 900), shrines: ["frost-shrine"] });
    await save({ world: "capital", shrines: ["capital-gate", "frost-shrine"] });
    const { body } = await read();
    expect(chunksIn(body)).toEqual([3, 40, 900]);
    expect([...body.shrines].sort()).toEqual(["capital-gate", "frost-shrine"]);
  });

  it("never takes anything away", async () => {
    authAs(await createTestUser());
    await save({ world: "capital", visited: bitmapWith(7), shrines: ["tide-shrine"] });
    const { body } = await save({ world: "capital", visited: bitmapWith(), shrines: [] });
    expect(chunksIn(body)).toEqual([7]);
    expect(body.shrines).toEqual(["tide-shrine"]);
  });

  it("keeps each member's map to themselves", async () => {
    const me = await createTestUser();
    const other = await createTestUser();
    authAs(other);
    await save({ world: "capital", visited: bitmapWith(12), shrines: ["mire-shrine"] });
    authAs(me);
    const { body } = await read();
    expect(chunksIn(body)).toEqual([]);
    expect(body.shrines).toEqual([]);
    const rows = await prisma.worldDiscovery.count({ where: { userId: me.userId } });
    expect(rows).toBe(0);
  });

  it("survives two devices saving at once", async () => {
    authAs(await createTestUser());
    await Promise.all([
      save({ world: "capital", visited: bitmapWith(1) }),
      save({ world: "capital", visited: bitmapWith(2) }),
      save({ world: "capital", visited: bitmapWith(3), shrines: ["pond-shrine"] }),
    ]);
    const { body } = await read();
    expect(chunksIn(body)).toEqual([1, 2, 3]);
    expect(body.shrines).toEqual(["pond-shrine"]);
  });

  it("refuses a shrine the world doesn't have", async () => {
    authAs(await createTestUser());
    const { status, body } = await save({ world: "capital", shrines: ["secret-shrine"] });
    expect(status).toBe(400);
    expect(body.error).toBe('There\'s no shrine called "secret-shrine".');
  });

  it("refuses a bitmap of the wrong length or not base64", async () => {
    authAs(await createTestUser());
    const short = encodeVisited(new Uint8Array(GRID.bytes - 1));
    expect((await save({ world: "capital", visited: short })).status).toBe(400);
    expect((await save({ world: "capital", visited: "not base64!" })).status).toBe(400);
  });

  it("refuses a world without a map", async () => {
    const me = await createTestUser();
    authAs(me);
    expect((await read(`island:${me.userId}`)).status).toBe(400);
    expect((await save({ world: "welcome-center-inside", shrines: [] })).status).toBe(400);
    expect((await read("constructor")).status).toBe(400);
  });

  it("answers 401 to someone signed out", async () => {
    mockRequireAuth.mockImplementation(async () => ({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    }));
    expect((await read()).status).toBe(401);
    expect((await save({ world: "capital" })).status).toBe(401);
  });
});
