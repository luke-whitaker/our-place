import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { chunkGrid, decodeVisited, encodeVisited, isVisited, chunkOf } from "./map-chunks";
import { DiscoverySync, SAVE_DELAY_MS, type SaveBody } from "./map-discoveries";
import type { WorldDiscoveries } from "@/lib/types";

const GRID = chunkGrid(312, 264);

function setup(fail = false) {
  const sent: { body: SaveBody; keepalive: boolean }[] = [];
  const onSaveError = vi.fn();
  const sync = new DiscoverySync({
    worldId: "capital",
    grid: GRID,
    onSaveError,
    send: async (body, keepalive) => {
      sent.push({ body, keepalive });
      if (fail) throw new Error("offline");
      return {
        world: "capital",
        visited: body.visited ?? encodeVisited(new Uint8Array(GRID.bytes)),
        shrines: body.shrines ?? [],
      };
    },
  });
  return { sync, sent, onSaveError };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("DiscoverySync", () => {
  it("batches walking into one save after the delay", async () => {
    const { sync, sent } = setup();
    for (let col = 100; col < 130; col++) sync.notePosition(col, 100);
    expect(sent).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(sent).toHaveLength(1);
    const visited = decodeVisited(sent[0].body.visited!, GRID)!;
    expect(isVisited(visited, chunkOf(GRID, 129, 100))).toBe(true);
    expect(sent[0].body.shrines).toBeUndefined();
  });

  it("does nothing standing still or within explored ground", async () => {
    const { sync, sent } = setup();
    sync.notePosition(100, 100);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    const versionAfter = sync.version;
    for (let i = 0; i < 100; i++) sync.notePosition(100, 100);
    sync.notePosition(101, 100);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(sent).toHaveLength(1);
    expect(sync.version).toBe(versionAfter);
  });

  it("saves a new shrine at once, and only once", async () => {
    const { sync, sent } = setup();
    sync.noteShrine("frost-shrine");
    sync.noteShrine("frost-shrine");
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ world: "capital", shrines: ["frost-shrine"] });
  });

  it("folds in the server's discoveries", () => {
    const { sync } = setup();
    const visited = new Uint8Array(GRID.bytes);
    visited[0] = 1;
    const server: WorldDiscoveries = {
      world: "capital",
      visited: encodeVisited(visited),
      shrines: ["tide-shrine"],
    };
    sync.merge(server);
    expect(isVisited(sync.visited, 0)).toBe(true);
    expect(sync.shrines.has("tide-shrine")).toBe(true);
  });

  it("keeps what failed to save, says so once, and retries", async () => {
    const { sync, sent, onSaveError } = setup(true);
    sync.notePosition(50, 50);
    sync.noteShrine("mire-shrine");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    await sync.flush(false);
    expect(onSaveError).toHaveBeenCalledTimes(1);
    const last = sent[sent.length - 1].body;
    expect(last.visited).toBeDefined();
    expect(last.shrines).toEqual(["mire-shrine"]);
  });

  it("sends what's left with keepalive on dispose", async () => {
    const { sync, sent } = setup();
    sync.notePosition(200, 200);
    sync.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(sent[0].keepalive).toBe(true);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 2);
    expect(sent).toHaveLength(1);
  });
});
