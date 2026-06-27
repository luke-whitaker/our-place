import { describe, it, expect } from "vitest";
import { tileToScreen, screenToTile, depthAt, TILE_W, TILE_H, HALF_W, HALF_H } from "./iso";

describe("iso projection", () => {
  it("places the origin tile at the screen origin", () => {
    expect(tileToScreen(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("steps neighbours by half a tile along each axis (2:1 diamond)", () => {
    // +col goes down-right, +row goes down-left
    expect(tileToScreen(1, 0)).toEqual({ x: HALF_W, y: HALF_H });
    expect(tileToScreen(0, 1)).toEqual({ x: -HALF_W, y: HALF_H });
    // one tile straight "down" the diamond is a full tile-height below
    expect(tileToScreen(1, 1)).toEqual({ x: 0, y: TILE_H });
  });

  it("round-trips tile → screen → tile", () => {
    for (const [c, r] of [
      [0, 0],
      [3, 7],
      [12, 4],
      [9.5, 2.25],
    ]) {
      const { x, y } = tileToScreen(c, r);
      const back = screenToTile(x, y);
      expect(back.col).toBeCloseTo(c, 6);
      expect(back.row).toBeCloseTo(r, 6);
    }
  });

  it("orders depth front-to-back by col+row", () => {
    expect(depthAt(0, 0)).toBeLessThan(depthAt(1, 0));
    expect(depthAt(2, 3)).toBe(depthAt(3, 2)); // same diagonal band
    expect(depthAt(5, 5)).toBeGreaterThan(depthAt(1, 2));
  });

  it("keeps the 2:1 aspect ratio", () => {
    expect(TILE_W).toBe(2 * TILE_H);
  });
});
