import { describe, it, expect } from "vitest";
import { tileToScreen, HALF_W, HALF_H } from "./iso";
import { ISO_VIEW_W, ISO_VIEW_H } from "./iso-engine";
import { groundCullRange, visibleGroundTiles, rectsOverlap, CELL, type ViewRect } from "./iso-cull";

/** The exact CELL×CELL rect drawGround blits a tile into, in absolute
 * world-screen (pre-zoom, pre-camera-subtraction) pixels — mirrors drawGround's
 * own `s.x - 16`/`s.y - 8` anchor so the brute-force check below tests the real
 * geometry, not a restatement of the culling code. */
function tileDrawRect(col: number, row: number): ViewRect {
  const s = tileToScreen(col, row);
  return { x: s.x - HALF_W, y: s.y - HALF_H, w: CELL, h: CELL };
}

describe("groundCullRange", () => {
  it("excludes a diagonal far outside the view and includes one inside it", () => {
    const range = groundCullRange(0, 0, 480, 320, 50, 50);

    // Origin tile: sum=0, diff=0 — squarely under the camera.
    expect(range.sumMin).toBeLessThanOrEqual(0);
    expect(range.sumMax).toBeGreaterThanOrEqual(0);
    expect(range.diffMin).toBeLessThanOrEqual(0);
    expect(range.diffMax).toBeGreaterThanOrEqual(0);

    // Far corner: sum=98 is nowhere near a 320px-tall view starting at y=0.
    expect(range.sumMax).toBeLessThan(98);
  });

  it("stays within the grid's real diagonal bounds", () => {
    const range = groundCullRange(-100000, -100000, 480, 320, 20, 20);
    expect(range.sumMin).toBeGreaterThanOrEqual(0);
    expect(range.diffMin).toBeGreaterThanOrEqual(-19);
    expect(range.diffMax).toBeLessThanOrEqual(19);
  });
});

describe("visibleGroundTiles (brute-force superset property)", () => {
  const cols = 20;
  const rows = 20;
  // World screen extent for a 20×20 grid, so the camera positions below sit at
  // real corners/centre rather than arbitrary numbers.
  const left = -(rows - 1) * HALF_W;
  const right = (cols - 1) * HALF_W;
  const top = 0;
  const bottom = (cols - 1 + (rows - 1)) * HALF_H;
  const viewW = 200; // smaller than the world's screen span (608px wide)
  const viewH = 150; // smaller than the world's screen span (304px tall)

  const cameras: Array<[number, number]> = [
    [left, top], // top-left corner
    [right - viewW, top], // top-right corner
    [left, bottom - viewH], // bottom-left corner
    [right - viewW, bottom - viewH], // bottom-right corner
    [(left + right - viewW) / 2, (top + bottom - viewH) / 2], // centre
  ];

  it.each(cameras)(
    "camera (%d, %d): culled tiles are a superset of intersecting tiles",
    (camX, camY) => {
      const view: ViewRect = { x: camX, y: camY, w: viewW, h: viewH };

      const visited = new Set<string>();
      for (const { col, row } of visibleGroundTiles(camX, camY, viewW, viewH, cols, rows)) {
        visited.add(`${col},${row}`);
      }

      let intersectingCount = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (!rectsOverlap(tileDrawRect(col, row), view)) continue;
          intersectingCount++;
          // The core correctness contract: culling never drops a tile that could
          // actually appear on screen.
          expect(visited.has(`${col},${row}`)).toBe(true);
        }
      }

      // Culling is allowed to over-include a border around the true visible set
      // (that's the point of the CELL padding), but that border is bounded by the
      // grid's perimeter, not by its area — a regression that visits the whole
      // grid would blow well past this.
      const perimeterMargin = 6 * (cols + rows);
      expect(visited.size).toBeLessThanOrEqual(intersectingCount + perimeterMargin);
    },
  );
});

describe("visibleGroundTiles (large-world tile count)", () => {
  it("visits well under 3000 tiles on a 500×500 world with a typical camera", () => {
    // A camera comfortably inside a 500×500 world, away from any clamped edge.
    const camX = 0;
    const camY = 4000;

    const count = [...visibleGroundTiles(camX, camY, ISO_VIEW_W, ISO_VIEW_H, 500, 500)].length;

    expect(count).toBeLessThan(3000);
  });
});

describe("rectsOverlap", () => {
  it("is true for overlapping rects and false for disjoint ones", () => {
    const a: ViewRect = { x: 0, y: 0, w: 10, h: 10 };
    expect(rectsOverlap(a, { x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    expect(rectsOverlap(a, { x: 10, y: 10, w: 10, h: 10 })).toBe(false); // half-open: touching edges don't overlap
    expect(rectsOverlap(a, { x: 100, y: 100, w: 10, h: 10 })).toBe(false);
  });
});
