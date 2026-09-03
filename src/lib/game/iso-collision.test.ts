import { describe, it, expect } from "vitest";
import { buildSolidGrid, isSolidAt, resolveMove, type SolidGrid } from "./iso-collision";
import type { IsoWorld, TerrainKind } from "./world-model";

function grassWorld(cols: number, rows: number): IsoWorld {
  return {
    id: "grass",
    cols,
    rows,
    spawn: { col: 0, row: 0 },
    terrain: Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => "grass" as TerrainKind),
    ),
    objects: [],
    doors: [],
    mushrooms: [],
    links: [],
    regions: [],
  };
}

describe("buildSolidGrid", () => {
  it("marks solid terrain and leaves walkable terrain open", () => {
    const world = grassWorld(4, 4);
    world.terrain[1][1] = "water";
    const grid = buildSolidGrid(world);
    expect(grid[1][1]).toBe(true);
    expect(grid[0][0]).toBe(false);
  });

  it("stamps a single-tile object footprint at its anchor", () => {
    const world = grassWorld(4, 4);
    world.objects.push({ kind: "oak1", col: 2, row: 2 });
    const grid = buildSolidGrid(world);
    expect(grid[2][2]).toBe(true);
    expect(grid[2][3]).toBe(false);
  });

  it("stamps a multi-tile house footprint and clamps out-of-bounds cells", () => {
    const world = grassWorld(6, 6);
    world.objects.push({ kind: "house", col: 3, row: 3 });
    const grid = buildSolidGrid(world);
    // Footprint is the 3×2 block at rows 2–3, cols 2–4.
    expect(grid[3][3]).toBe(true);
    expect(grid[2][2]).toBe(true);
    expect(grid[2][4]).toBe(true);
    expect(grid[4][3]).toBe(false);
  });

  it("does not throw when a footprint spills past the edge", () => {
    const world = grassWorld(3, 3);
    world.objects.push({ kind: "house", col: 0, row: 0 });
    expect(() => buildSolidGrid(world)).not.toThrow();
    expect(buildSolidGrid(world)[0][0]).toBe(true);
  });
});

describe("isSolidAt", () => {
  const grid: SolidGrid = [
    [false, true],
    [false, false],
  ];

  it("treats out-of-bounds as solid", () => {
    expect(isSolidAt(grid, -1, 0)).toBe(true);
    expect(isSolidAt(grid, 0, 2)).toBe(true);
  });

  it("floors fractional coordinates to the containing tile", () => {
    expect(isSolidAt(grid, 1.9, 0.2)).toBe(true);
    expect(isSolidAt(grid, 0.9, 0.9)).toBe(false);
  });
});

describe("resolveMove", () => {
  // grid[row][col]; the tile at col 1, row 0 is solid.
  const grid: SolidGrid = [
    [false, true, false],
    [false, false, false],
    [false, false, false],
  ];

  it("applies a move into open space", () => {
    expect(resolveMove(grid, 0.5, 1.5, 0, -1)).toEqual({ col: 0.5, row: 0.5 });
  });

  it("blocks a move into a solid tile", () => {
    expect(resolveMove(grid, 0.5, 0.5, 1, 0)).toEqual({ col: 0.5, row: 0.5 });
  });

  it("slides along one axis when the other is blocked", () => {
    // Heading down-right into the wall: col is blocked, row still slides down.
    const result = resolveMove(grid, 0.5, 0.5, 1, 1);
    expect(result.col).toBe(0.5);
    expect(result.row).toBe(1.5);
  });
});
