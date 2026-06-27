import { describe, it, expect } from "vitest";
import { edgeCode, groundCell, grassAt, EDGE, FOREST_BLOB, type Terrain } from "./forest-autotile";

// 3×3 grass field with the centre tile's neighbours toggled per test.
function field(grass: boolean): Terrain {
  return Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => grass));
}

describe("forest autotile edge codes", () => {
  it("an interior grass tile is fully grassed (code F)", () => {
    expect(edgeCode(field(true), 1, 1)).toBe(0xf);
  });

  it("a lone grass tile surrounded by dirt has no grassy edges (code 0)", () => {
    const t = field(false);
    t[1][1] = true;
    expect(edgeCode(t, 1, 1)).toBe(0x0);
  });

  it("encodes a single grass neighbour on the correct edge", () => {
    const t = field(false);
    t[1][1] = true;
    t[0][1] = true; // tile directly north (row-1) → NE edge
    expect(edgeCode(t, 1, 1)).toBe(EDGE.NE);
    t[0][1] = false;
    t[1][2] = true; // east (col+1) → SE edge
    expect(edgeCode(t, 1, 1)).toBe(EDGE.SE);
  });

  it("treats out-of-bounds as grass (no seam at the map edge)", () => {
    expect(grassAt(field(true), -1, 0)).toBe(true);
    expect(edgeCode(field(true), 0, 0)).toBe(0xf);
  });
});

describe("groundCell selection", () => {
  it("returns a dirt cell for dirt tiles", () => {
    const t = field(false);
    const [c, r] = groundCell(t, 1, 1);
    // dirt cells live in the lower-right of the sheet (col≥4, row≥4)
    expect(c).toBeGreaterThanOrEqual(4);
    expect(r).toBeGreaterThanOrEqual(4);
  });

  it("returns a full-grass cell for interior grass", () => {
    const cell = groundCell(field(true), 1, 1);
    expect(FOREST_BLOB[0xf]).toContainEqual([cell[0], cell[1]]);
  });

  it("is deterministic for a given position", () => {
    const t = field(true);
    expect(groundCell(t, 2, 3)).toEqual(groundCell(t, 2, 3));
  });
});
