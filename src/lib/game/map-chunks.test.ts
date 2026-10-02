import { describe, it, expect } from "vitest";
import {
  CHUNK_TILES,
  chunkGrid,
  chunkOf,
  decodeVisited,
  emptyVisited,
  encodeVisited,
  isVisited,
  markAround,
  orVisited,
} from "./map-chunks";

const GRID = chunkGrid(312, 264);

function visitedChunks(visited: Uint8Array): number[] {
  return Array.from({ length: GRID.cw * GRID.ch }, (_, i) => i).filter((i) =>
    isVisited(visited, i),
  );
}

describe("chunkGrid", () => {
  it("sizes the grown Capital at 39x33 chunks in 161 bytes", () => {
    expect(GRID).toEqual({ cw: 39, ch: 33, bytes: 161 });
  });

  it("rounds a partial chunk up", () => {
    expect(chunkGrid(9, 1)).toEqual({ cw: 2, ch: 1, bytes: 1 });
  });
});

describe("chunkOf", () => {
  it("is row-major by 8x8 chunk", () => {
    expect(chunkOf(GRID, 0, 0)).toBe(0);
    expect(chunkOf(GRID, 7, 7)).toBe(0);
    expect(chunkOf(GRID, 8, 0)).toBe(1);
    expect(chunkOf(GRID, 0, 8)).toBe(39);
    expect(chunkOf(GRID, 311, 263)).toBe(39 * 33 - 1);
  });

  it("answers -1 off the map", () => {
    expect(chunkOf(GRID, -1, 0)).toBe(-1);
    expect(chunkOf(GRID, 312, 0)).toBe(-1);
    expect(chunkOf(GRID, 0, 264)).toBe(-1);
  });
});

describe("markAround", () => {
  it("marks the chunks within the radius and reports the change once", () => {
    const visited = emptyVisited(GRID);
    // In the middle of chunk (10, 10): a radius of 3 stays inside it.
    expect(markAround(GRID, visited, 84, 84, 3)).toBe(true);
    expect(visitedChunks(visited)).toEqual([10 * 39 + 10]);
    expect(markAround(GRID, visited, 84, 84, 3)).toBe(false);
  });

  it("reaches neighbouring chunks only where the circle does", () => {
    const visited = emptyVisited(GRID);
    // At the corner tile of chunk (10, 10): one tile reaches the chunks west
    // and north, but the diagonal one's nearest tile is √2 away.
    markAround(GRID, visited, 80, 80, 1);
    expect(visitedChunks(visited)).toEqual([9 * 39 + 10, 10 * 39 + 9, 10 * 39 + 10]);
    markAround(GRID, visited, 80, 80, 2);
    expect(visitedChunks(visited)).toEqual([9 * 39 + 9, 9 * 39 + 10, 10 * 39 + 9, 10 * 39 + 10]);
  });

  it("leaves out a chunk that only the square around the circle would touch", () => {
    const visited = emptyVisited(GRID);
    // Radius 10 from (84, 84): chunk (8, 8) spans tiles 64-71, nearest point
    // (71, 71), 13 tiles off on each axis, so outside the circle.
    markAround(GRID, visited, 84, 84, 10);
    expect(isVisited(visited, 8 * 39 + 8)).toBe(false);
    expect(isVisited(visited, 10 * 39 + 9)).toBe(true);
  });

  it("clamps at the map's edges", () => {
    const visited = emptyVisited(GRID);
    markAround(GRID, visited, 0, 0, 20);
    expect(visitedChunks(visited).every((c) => c >= 0 && c < GRID.cw * GRID.ch)).toBe(true);
    expect(isVisited(visited, 0)).toBe(true);
  });

  it("marks a radius of whole chunks around a walker's path", () => {
    const visited = emptyVisited(GRID);
    for (let col = 100; col < 100 + 4 * CHUNK_TILES; col++) markAround(GRID, visited, col, 100);
    expect(visitedChunks(visited).length).toBeGreaterThan(5);
  });
});

describe("merging", () => {
  it("ORs two bitmaps the same in either order", () => {
    const a = emptyVisited(GRID);
    const b = emptyVisited(GRID);
    markAround(GRID, a, 20, 20, 2);
    markAround(GRID, b, 200, 200, 2);
    expect(orVisited(a, b)).toEqual(orVisited(b, a));
    expect(visitedChunks(orVisited(a, b))).toEqual([...visitedChunks(a), ...visitedChunks(b)]);
  });

  it("is idempotent", () => {
    const a = emptyVisited(GRID);
    markAround(GRID, a, 50, 60);
    expect(orVisited(a, a)).toEqual(a);
  });

  it("refuses bitmaps of different lengths", () => {
    expect(() => orVisited(new Uint8Array(2), new Uint8Array(3))).toThrow();
  });
});

describe("encoding", () => {
  it("round-trips through base64", () => {
    const visited = emptyVisited(GRID);
    markAround(GRID, visited, 150, 130);
    expect(decodeVisited(encodeVisited(visited), GRID)).toEqual(visited);
  });

  it("refuses the wrong length and text that isn't base64", () => {
    expect(decodeVisited(encodeVisited(new Uint8Array(160)), GRID)).toBeNull();
    expect(decodeVisited("%%%", GRID)).toBeNull();
  });
});
