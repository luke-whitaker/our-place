import { describe, it, expect } from "vitest";
import { CAPITAL, TOWN, POND, MIRROR_POND, OLD_ROAD, WEST_TRAIL, EAST_TRAIL } from "./capital";
import { parseIsoWorld, OBJECT_CATALOG } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";
import { visibleGroundTiles } from "../iso-cull";
import { ISO_VIEW_W, ISO_VIEW_H } from "../iso-engine";
import { HALF_W, HALF_H } from "../iso";

const EXPECTED_SLUGS = [
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

/** Doors before the outskirts grew the map, in the town's own local
 * coordinates — a regression guard that the TOWN offset moved every door by
 * exactly the same amount and nothing else drifted. */
const OLD_LOCAL_DOORS: Record<string, readonly [number, number]> = {
  "welcome-center": [17, 13],
  creative: [28, 13],
  "community-support": [39, 13],
  technology: [50, 13],
  health: [6, 31],
  music: [17, 31],
  food: [28, 31],
  gaming: [39, 31],
  sports: [50, 31],
};

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

  it("offers the way home from every shrine, and has no My Place building", () => {
    expect(CAPITAL.links.map((l) => l.place)).toEqual(["me"]);
    expect(CAPITAL.doors.some((d) => d.id === "my-place")).toBe(false);
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

  it("moves every town door by exactly the TOWN offset", () => {
    for (const [id, [oldCol, oldRow]] of Object.entries(OLD_LOCAL_DOORS)) {
      const door = CAPITAL.doors.find((d) => d.id === id);
      expect(door).toBeDefined();
      expect(door!.col).toBe(oldCol + TOWN.col);
      expect(door!.row).toBe(oldRow + TOWN.row);
    }
  });

  it("gives every region at least one walkable tile reachable from spawn", () => {
    const grid = buildSolidGrid(CAPITAL);
    const seen = reachable(grid, CAPITAL.spawn.col, CAPITAL.spawn.row);
    for (const region of CAPITAL.regions) {
      const { col, row, w, h } = region.bounds;
      let found = false;
      for (let r = row; r < row + h && !found; r++) {
        for (let c = col; c < col + w && !found; c++) {
          if (seen.has(`${c},${r}`)) found = true;
        }
      }
      expect(found).toBe(true);
    }
  });

  it("never places a solid object on a door tile or its approach tile", () => {
    const forbidden = new Set<string>();
    for (const door of CAPITAL.doors) {
      forbidden.add(`${door.col},${door.row}`);
      forbidden.add(`${door.col},${door.row + 1}`); // one tile south: the approach
    }
    for (const obj of CAPITAL.objects) {
      const def = OBJECT_CATALOG[obj.kind];
      if (!def.solid) continue;
      for (const f of def.footprint) {
        expect(forbidden.has(`${obj.col + f.dc},${obj.row + f.dr}`)).toBe(false);
      }
    }
  });

  it("stamps both ponds as water and never turns a trail tile to water", () => {
    expect(CAPITAL.terrain[POND.row][POND.col]).toBe("water");
    expect(CAPITAL.terrain[MIRROR_POND.row][MIRROR_POND.col]).toBe("water");

    for (const [c, r] of [...OLD_ROAD, ...WEST_TRAIL, ...EAST_TRAIL]) {
      expect(CAPITAL.terrain[r][c]).not.toBe("water");
    }

    // Every water tile on the map belongs to one of the two authored ponds.
    for (let r = 0; r < CAPITAL.rows; r++) {
      for (let c = 0; c < CAPITAL.cols; c++) {
        if (CAPITAL.terrain[r][c] !== "water") continue;
        const nearOriginal = Math.abs(c - POND.col) + Math.abs(r - POND.row) <= POND.radius;
        const nearMirror =
          Math.abs(c - MIRROR_POND.col) + Math.abs(r - MIRROR_POND.row) <= MIRROR_POND.radius;
        expect(nearOriginal || nearMirror).toBe(true);
      }
    }
  });

  it("stays under the 3000-tile culling budget at a few camera positions", () => {
    // Mirrors iso-cull.test.ts's corner/centre derivation, against the bigger map.
    const left = -(CAPITAL.rows - 1) * HALF_W;
    const right = (CAPITAL.cols - 1) * HALF_W;
    const top = 0;
    const bottom = (CAPITAL.cols - 1 + (CAPITAL.rows - 1)) * HALF_H;
    const cams: Array<[number, number]> = [
      [left, top],
      [right - ISO_VIEW_W, top],
      [left, bottom - ISO_VIEW_H],
      [right - ISO_VIEW_W, bottom - ISO_VIEW_H],
      [(left + right - ISO_VIEW_W) / 2, (top + bottom - ISO_VIEW_H) / 2],
    ];
    for (const [camX, camY] of cams) {
      const count = [
        ...visibleGroundTiles(camX, camY, ISO_VIEW_W, ISO_VIEW_H, CAPITAL.cols, CAPITAL.rows),
      ].length;
      expect(count).toBeLessThan(3000);
    }
  });
});
