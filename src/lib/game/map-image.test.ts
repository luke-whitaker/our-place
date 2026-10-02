import { describe, it, expect } from "vitest";
import { chunkGrid, emptyVisited, markAround } from "./map-chunks";
import {
  buildMapPixels,
  classifyTiles,
  composeMap,
  fogColor,
  mapSize,
  tileColor,
  tileToMapPx,
} from "./map-image";
import { CAPITAL } from "./worlds/world-map";
import type { IsoWorld } from "./world-model";
import type { TerrainKind } from "./world-model";

/** A tiny world: grass with a road row, a pond corner, a void corner, a tree
 * and a two-by-two-tile well. */
function tinyWorld(): IsoWorld {
  const terrain: TerrainKind[][] = Array.from({ length: 6 }, (_, row) =>
    Array.from({ length: 8 }, (_, col): TerrainKind => {
      if (row === 0 && col === 0) return "void";
      if (row === 5 && col === 7) return "water";
      if (row === 2) return "path";
      return "grass";
    }),
  );
  return {
    id: "tiny",
    cols: 8,
    rows: 6,
    terrain,
    objects: [
      { kind: "oak1", col: 6, row: 4 },
      { kind: "well", col: 3, row: 4 },
      { kind: "lamp1", col: 1, row: 4 },
    ],
    doors: [],
    mushrooms: [],
    links: [],
    regions: [],
    spawn: { col: 4, row: 3 },
  } as unknown as IsoWorld;
}

describe("classifyTiles", () => {
  it("reads terrain, trees, and building footprints, and skips small props", () => {
    const world = tinyWorld();
    const tiles = classifyTiles(world);
    const at = (col: number, row: number) => tiles[row * world.cols + col];
    expect(at(0, 0)).toBe("none");
    expect(at(7, 5)).toBe("water");
    expect(at(0, 2)).toBe("path");
    expect(at(6, 4)).toBe("tree");
    // The well is 2x2 north-west of its anchor.
    expect([at(2, 3), at(3, 3), at(2, 4), at(3, 4)]).toEqual([
      "building",
      "building",
      "building",
      "building",
    ]);
    expect(at(1, 4)).toBe("grass");
  });

  it("finds water, sand, trees, and buildings in the grown Capital", () => {
    const kinds = new Set(classifyTiles(CAPITAL));
    for (const kind of ["water", "sand", "path", "grass", "tree", "building"]) {
      expect(kinds.has(kind as never)).toBe(true);
    }
  });
});

describe("colors", () => {
  it("tells biomes apart and keeps fog grey", () => {
    expect(tileColor("grass", "snow")).not.toEqual(tileColor("grass", "forest"));
    expect(tileColor("water", "snow")).toEqual(tileColor("water", "forest"));
    const [r, g, b] = fogColor(tileColor("grass", "forest"));
    expect(r).toBe(g);
    expect(b - r).toBeLessThan(10);
  });
});

describe("buildMapPixels", () => {
  it("is (cols + rows) wide and half that tall", () => {
    expect(mapSize(CAPITAL)).toEqual({ width: 576, height: 288 });
  });

  it("covers every ground tile with no gaps and leaves void empty", () => {
    const world = tinyWorld();
    const grid = chunkGrid(world.cols, world.rows);
    const pixels = buildMapPixels(world, grid);
    // The pixel under each tile's centre belongs to ground.
    for (let row = 0; row < world.rows; row++) {
      for (let col = 0; col < world.cols; col++) {
        const { x, y } = tileToMapPx(world, col, row);
        const p = Math.floor(y) * pixels.width + Math.floor(x);
        if (col === 0 && row === 0) continue;
        expect(pixels.chunkAt[p]).toBeGreaterThanOrEqual(0);
      }
    }
    // Map rows between the first and last have no holes inside the diamond.
    const midRow = Math.floor(pixels.height / 2);
    const filled = Array.from(
      { length: pixels.width },
      (_, x) => pixels.chunkAt[midRow * pixels.width + x] >= 0,
    );
    const first = filled.indexOf(true);
    const last = filled.lastIndexOf(true);
    expect(filled.slice(first, last + 1).every(Boolean)).toBe(true);
  });

  it("puts north up: a tile further north-east sits higher on the map", () => {
    const north = tileToMapPx(CAPITAL, 278, 16);
    const south = tileToMapPx(CAPITAL, 296, 217);
    expect(north.y).toBeLessThan(south.y);
  });
});

describe("composeMap", () => {
  it("shows explored chunks in color and the rest fogged", () => {
    const world = tinyWorld();
    const grid = chunkGrid(world.cols, world.rows);
    const pixels = buildMapPixels(world, grid);
    const out = new Uint8ClampedArray(pixels.base.length);
    composeMap(pixels, emptyVisited(grid), out);
    expect(out).toEqual(pixels.fog);
    const visited = emptyVisited(grid);
    markAround(grid, visited, 3, 3);
    composeMap(pixels, visited, out);
    expect(out).toEqual(pixels.base);
  });
});
