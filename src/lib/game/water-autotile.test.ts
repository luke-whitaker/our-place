import { describe, it, expect } from "vitest";
import { waterEdgeCode, waterCell, isWaterAt, WATER_BLOB } from "./water-autotile";
import type { TerrainGrid } from "./water-autotile";
import type { TerrainKind } from "./world-model";

/** A grass grid with a tile-space diamond pond of the given radius at (cc,cr). */
function pond(size: number, cc: number, cr: number, radius: number): TerrainGrid {
  const t: TerrainGrid = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => "grass" as TerrainKind),
  );
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (Math.abs(c - cc) + Math.abs(r - cr) <= radius) t[r][c] = "water";
    }
  }
  return t;
}

describe("isWaterAt", () => {
  it("treats out-of-bounds as land", () => {
    const t = pond(7, 3, 3, 2);
    expect(isWaterAt(t, 3, 3)).toBe(true);
    expect(isWaterAt(t, -1, 3)).toBe(false);
  });
});

describe("waterEdgeCode", () => {
  const t = pond(7, 3, 3, 2);

  it("is 0 for an interior tile (every neighbour is water)", () => {
    expect(waterEdgeCode(t, 3, 3)).toBe(0x0);
  });

  it("is a three-edge tip code at the pond's points", () => {
    // North tip (3,1): land NE+SE+NW = 1+2+8.
    expect(waterEdgeCode(t, 3, 1)).toBe(0xb);
  });

  it("is a two-edge side code along a diagonal edge", () => {
    // (4,2): land NE+SE = 1+2.
    expect(waterEdgeCode(t, 4, 2)).toBe(0x3);
  });
});

describe("waterCell", () => {
  const t = pond(7, 3, 3, 2);

  it("returns a mapped frame-0 cell within the blob block", () => {
    for (const [c, r] of [
      [3, 3],
      [3, 1],
      [4, 2],
    ]) {
      const [sc, sr] = waterCell(t, c, r);
      expect(sc).toBeGreaterThanOrEqual(0);
      expect(sc).toBeLessThan(4); // frame-0 columns
      expect(sr).toBeGreaterThanOrEqual(0);
      expect(sr).toBeLessThan(10);
    }
  });

  it("maps every code in the blob table to in-range cells", () => {
    for (const cells of Object.values(WATER_BLOB)) {
      for (const [sc, sr] of cells) {
        expect(sc).toBeLessThan(4);
        expect(sr).toBeLessThan(10);
      }
    }
  });
});
