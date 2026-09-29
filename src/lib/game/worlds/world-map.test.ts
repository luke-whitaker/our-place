import { describe, it, expect } from "vitest";
import { CAPITAL, NEW_SHRINES } from "./world-map";
import { CAPITAL_CORE } from "./capital";
import {
  CORE_OFFSET,
  ISLAND,
  LAKE,
  LAKE_OPENINGS,
  OPENING_OUTER,
  SWAMP,
  SWAMP_OPENINGS,
} from "./wilds/layout";
import { SWAMP_SHRINE } from "./wilds/swamp";
import { ellipseDist, pointOnEllipse, type Ellipse } from "./wilds/map-builder";
import { parseIsoWorld } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";
import { visibleGroundTiles } from "../iso-cull";
import { ISO_VIEW_W, ISO_VIEW_H } from "../iso-engine";
import { HALF_W, HALF_H } from "../iso";
import { biomeAt } from "../biomes";

/** Tiles reachable on foot from a tile (4-neighbour flood fill). The player
 * slides on one axis at a time, so this matches what they can really reach. */
function reachable(grid: SolidGrid, start: { col: number; row: number }): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[Math.floor(start.col), Math.floor(start.row)]];
  while (queue.length) {
    const [c, r] = queue.pop()!;
    const key = `${c},${r}`;
    if (seen.has(key) || isSolidAt(grid, c, r)) continue;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}

const nextTo = (seen: Set<string>, col: number, row: number) =>
  [
    [col + 1, row],
    [col - 1, row],
    [col, row + 1],
    [col, row - 1],
  ].some(([c, r]) => seen.has(`${c},${r}`));

/** The collision grid with a walled ellipse's openings filled in, as if its
 * wall ran all the way round. */
function sealed(e: Ellipse): SolidGrid {
  const grid = buildSolidGrid(CAPITAL);
  const band = 3 / Math.min(e.rx, e.ry);
  grid.forEach((row, r) =>
    row.forEach((_, c) => {
      const d = ellipseDist(e, c, r);
      if (d >= 1 && d < 1 + band) grid[r][c] = true;
    }),
  );
  return grid;
}

describe("the grown Capital world", () => {
  const grid = buildSolidGrid(CAPITAL);
  const seen = reachable(grid, CAPITAL.spawn);

  it("is a valid world document that keeps the id every link uses", () => {
    expect(() => parseIsoWorld(CAPITAL)).not.toThrow();
    expect(CAPITAL.id).toBe("capital");
  });

  it("moves the old Capital's doors, shrines, NPCs, and spawn by exactly the core offset", () => {
    const moved = <T extends { col: number; row: number }>(p: T) => ({
      col: p.col + CORE_OFFSET.col,
      row: p.row + CORE_OFFSET.row,
    });
    for (const door of CAPITAL_CORE.doors) {
      expect(CAPITAL.doors.find((d) => d.id === door.id)).toMatchObject(moved(door));
    }
    for (const shrine of CAPITAL_CORE.mushrooms) {
      expect(CAPITAL.mushrooms.find((m) => m.id === shrine.id)).toMatchObject(moved(shrine));
    }
    expect(CAPITAL.npcs).toEqual((CAPITAL_CORE.npcs ?? []).map((n) => ({ ...n, ...moved(n) })));
    expect(CAPITAL.spawn).toEqual(moved(CAPITAL_CORE.spawn));
  });

  it("adds exactly three new shrines, all in the Capital network", () => {
    expect(NEW_SHRINES.map((m) => m.id)).toEqual(["frost-shrine", "mire-shrine", "tide-shrine"]);
    expect(CAPITAL.mushrooms).toHaveLength(CAPITAL_CORE.mushrooms.length + 3);
    for (const shrine of NEW_SHRINES) expect(shrine.nodeId).toBe("capital");
  });

  it("lets the player reach every door, shrine, and opening on foot from spawn", () => {
    for (const door of CAPITAL.doors) expect(seen.has(`${door.col},${door.row}`)).toBe(true);
    for (const shrine of CAPITAL.mushrooms) {
      expect(nextTo(seen, shrine.col, shrine.row), shrine.id).toBe(true);
    }
    const gates = [
      ...SWAMP_OPENINGS.map((a) => pointOnEllipse(SWAMP, a, OPENING_OUTER)),
      ...SWAMP_OPENINGS.map((a) => pointOnEllipse(SWAMP, a, 0.85)),
      ...LAKE_OPENINGS.map((a) => pointOnEllipse(LAKE, a, OPENING_OUTER)),
      ...LAKE_OPENINGS.map((a) => pointOnEllipse(LAKE, a, 0.85)),
    ];
    for (const [c, r] of gates) expect(seen.has(`${c},${r}`), `gate ${c},${r}`).toBe(true);
  });

  it("walls the swamp so its shrine is reachable only through the openings", () => {
    const shut = reachable(sealed(SWAMP), CAPITAL.spawn);
    expect(nextTo(shut, SWAMP_SHRINE.col, SWAMP_SHRINE.row)).toBe(false);
  });

  it("walls the lake so its shore is reachable only through the openings", () => {
    const shore = pointOnEllipse(LAKE, Math.PI, 0.85);
    expect(seen.has(`${shore[0]},${shore[1]}`)).toBe(true);
    const shut = reachable(sealed(LAKE), CAPITAL.spawn);
    expect(shut.has(`${shore[0]},${shore[1]}`)).toBe(false);
  });

  it("keeps the offshore island out of reach", () => {
    expect(nextTo(seen, ISLAND.col, ISLAND.row)).toBe(false);
    for (let r = ISLAND.row - 4; r <= ISLAND.row + 4; r++) {
      for (let c = ISLAND.col - 4; c <= ISLAND.col + 4; c++) {
        expect(seen.has(`${c},${r}`)).toBe(false);
      }
    }
    // At least eight rows of open water between the beach and the island,
    // looking straight out from the shore beside it.
    for (let c = ISLAND.col - 3; c <= ISLAND.col + 3; c++) {
      let r = ISLAND.row;
      while (CAPITAL.terrain[r - 1][c] !== "water") r--; // up to the island's shore
      let water = 0;
      for (; CAPITAL.terrain[r - 1][c] === "water"; r--) water++;
      expect(water, `column ${c}`).toBeGreaterThanOrEqual(8);
    }
    // The island's shrine is scenery, never a warp.
    expect(CAPITAL.mushrooms.some((m) => m.col === ISLAND.col && m.row === ISLAND.row)).toBe(false);
  });

  it("leaves almost no walkable ground cut off from spawn, besides the island", () => {
    let walkable = 0;
    let cutOff = 0;
    grid.forEach((row, r) =>
      row.forEach((solid, c) => {
        if (solid) return;
        walkable++;
        const onIsland = Math.hypot(c - ISLAND.col, r - ISLAND.row) < 6;
        if (!seen.has(`${c},${r}`) && !onIsland) cutOff++;
      }),
    );
    // Open woodland: people may wander anywhere the walls and water allow.
    expect(cutOff / walkable).toBeLessThan(0.005);
  });

  it("gives every region at least one tile reachable from spawn", () => {
    for (const region of CAPITAL.regions) {
      const { col, row, w, h } = region.bounds;
      let found = false;
      for (let r = row; r < row + h && !found; r++) {
        for (let c = col; c < col + w && !found; c++) found = seen.has(`${c},${r}`);
      }
      expect(found, region.id).toBe(true);
    }
  });

  it("paints each region in its own biome and keeps the old Capital forest", () => {
    expect(biomeAt(CAPITAL, 150, 5)).toBe("snow");
    expect(biomeAt(CAPITAL, SWAMP.col, SWAMP.row)).toBe("swamp");
    expect(biomeAt(CAPITAL, 20, 205)).toBe("autumn");
    expect(biomeAt(CAPITAL, LAKE.col, LAKE.row)).toBe("forest");
    for (let r = CORE_OFFSET.row; r < CORE_OFFSET.row + CAPITAL_CORE.rows; r += 7) {
      for (let c = CORE_OFFSET.col; c < CORE_OFFSET.col + CAPITAL_CORE.cols; c += 7) {
        expect(biomeAt(CAPITAL, c, r)).toBe("forest");
      }
    }
  });

  it("stays under the 3000-tile culling budget at a few camera positions", () => {
    const left = -(CAPITAL.rows - 1) * HALF_W;
    const right = (CAPITAL.cols - 1) * HALF_W;
    const bottom = (CAPITAL.cols - 1 + (CAPITAL.rows - 1)) * HALF_H;
    const cams: Array<[number, number]> = [
      [left, 0],
      [right - ISO_VIEW_W, 0],
      [left, bottom - ISO_VIEW_H],
      [(left + right - ISO_VIEW_W) / 2, (bottom - ISO_VIEW_H) / 2],
    ];
    for (const [camX, camY] of cams) {
      const count = [
        ...visibleGroundTiles(camX, camY, ISO_VIEW_W, ISO_VIEW_H, CAPITAL.cols, CAPITAL.rows),
      ].length;
      expect(count).toBeLessThan(3000);
    }
  });
});
