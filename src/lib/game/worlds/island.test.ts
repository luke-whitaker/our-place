import { describe, it, expect } from "vitest";
import { buildIsland, islandWorldId, ISLAND_DOOR_ID, ISLAND_SHRINE_ID } from "./island";
import { parseIsoWorld } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";
import { TINT_PRESETS } from "../terrain-tint";

const OWNER = { id: "8f2c1a2e-1b7d-4a8e-9c3f-000000000001", username: "luke", displayName: "Luke" };

function reachable(grid: SolidGrid, startCol: number, startRow: number): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[startCol, startRow]];
  while (queue.length) {
    const [c, r] = queue.pop()!;
    const key = `${c},${r}`;
    if (seen.has(key) || isSolidAt(grid, c, r)) continue;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}

describe("buildIsland", () => {
  const home = buildIsland({ owner: OWNER, biome: "autumn", isOwn: true });

  it("is a valid world document carrying the owner's biome and id", () => {
    expect(() => parseIsoWorld(home)).not.toThrow();
    expect(home.id).toBe(islandWorldId(OWNER.id));
    expect(home.tint).toBe("autumn");
  });

  it("is deterministic per owner and different between owners", () => {
    const again = buildIsland({ owner: OWNER, biome: "autumn", isOwn: true });
    expect(again).toEqual(home);
    const other = buildIsland({
      owner: { ...OWNER, id: "8f2c1a2e-1b7d-4a8e-9c3f-000000000002" },
      biome: "autumn",
      isOwn: true,
    });
    expect(other.objects).not.toEqual(home.objects);
  });

  it("has one cottage door, one shrine, and the way back to the Capital gate", () => {
    expect(home.doors.map((d) => d.id)).toEqual([ISLAND_DOOR_ID]);
    expect(home.mushrooms.map((m) => m.id)).toEqual([ISLAND_SHRINE_ID]);
    expect(home.links).toEqual([
      { id: "capital", label: "The Capital", place: "capital", spawnAt: "capital-gate" },
    ]);
    expect(home.objects.filter((o) => o.kind === "mushroom")).toHaveLength(1);
    expect(home.regions[0].label).toBe("Home");
  });

  it("names a visitor's view after the owner and offers them Home", () => {
    const visit = buildIsland({ owner: OWNER, biome: "snow", isOwn: false });
    expect(visit.doors[0].label).toBe("Luke's Place");
    expect(visit.regions[0].label).toBe("Luke's Island");
    expect(visit.links.map((l) => l.place)).toEqual(["capital", "me"]);
  });

  it("floats: every border tile is void and the void is solid", () => {
    const grid = buildSolidGrid(home);
    for (let i = 0; i < home.cols; i++) {
      expect(home.terrain[0][i]).toBe("void");
      expect(home.terrain[home.rows - 1][i]).toBe("void");
      expect(home.terrain[i][0]).toBe("void");
      expect(home.terrain[i][home.cols - 1]).toBe("void");
      expect(isSolidAt(grid, 0, i)).toBe(true);
    }
  });

  it("keeps the door and shrine reachable from spawn for many owners and every biome", () => {
    for (let n = 0; n < 60; n++) {
      const biome = TINT_PRESETS[n % TINT_PRESETS.length];
      const world = buildIsland({
        owner: { ...OWNER, id: `owner-${n}-${Math.imul(n, 2654435761) >>> 0}` },
        biome,
        isOwn: true,
      });
      const grid = buildSolidGrid(world);
      expect(isSolidAt(grid, world.spawn.col, world.spawn.row)).toBe(false);
      const seen = reachable(grid, world.spawn.col, world.spawn.row);
      const door = world.doors[0];
      expect(seen.has(`${door.col},${door.row}`)).toBe(true);
      const shrine = world.mushrooms[0];
      expect(seen.has(`${shrine.col},${shrine.row - 1}`)).toBe(true);
      expect(world.objects.length).toBeGreaterThan(4);
    }
  });
});
