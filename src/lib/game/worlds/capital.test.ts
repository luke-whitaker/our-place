import { describe, it, expect } from "vitest";
import { CAPITAL } from "./capital";
import { parseIsoWorld } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";

const EXPECTED_SLUGS = [
  "my-place",
  "welcome-center",
  "creative",
  "community-support",
  "technology",
  "health",
  "music",
  "food",
  "gaming",
  "sports",
];

/** Tiles reachable on foot from a start tile (4-neighbour flood fill over the
 * walkable grid — a conservative lower bound on what the player can reach). */
function reachable(grid: SolidGrid, startCol: number, startRow: number): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[Math.floor(startCol), Math.floor(startRow)]];
  while (queue.length) {
    const [c, r] = queue.pop()!;
    const key = `${c},${r}`;
    if (seen.has(key)) continue;
    if (isSolidAt(grid, c, r)) continue;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}

describe("CAPITAL", () => {
  it("is a valid world document", () => {
    expect(() => parseIsoWorld(CAPITAL)).not.toThrow();
  });

  it("has one door per community, matching the real slugs", () => {
    expect(CAPITAL.doors.map((d) => d.id).sort()).toEqual([...EXPECTED_SLUGS].sort());
  });

  it("spawns the player on a walkable tile", () => {
    const grid = buildSolidGrid(CAPITAL);
    expect(isSolidAt(grid, CAPITAL.spawn.col, CAPITAL.spawn.row)).toBe(false);
  });

  it("keeps every door tile walkable (not buried in a building footprint)", () => {
    const grid = buildSolidGrid(CAPITAL);
    for (const door of CAPITAL.doors) {
      expect(isSolidAt(grid, door.col, door.row)).toBe(false);
    }
  });

  it("lets the player reach every door and shrine on foot from spawn", () => {
    const grid = buildSolidGrid(CAPITAL);
    const seen = reachable(grid, CAPITAL.spawn.col, CAPITAL.spawn.row);
    for (const door of CAPITAL.doors) {
      expect(seen.has(`${door.col},${door.row}`)).toBe(true);
    }
    for (const shrine of CAPITAL.mushrooms) {
      // Shrines are solid; the player just needs to reach an adjacent tile.
      const adjacent = [
        [shrine.col + 1, shrine.row],
        [shrine.col - 1, shrine.row],
        [shrine.col, shrine.row + 1],
        [shrine.col, shrine.row - 1],
      ];
      expect(adjacent.some(([c, r]) => seen.has(`${c},${r}`))).toBe(true);
    }
  });
});
