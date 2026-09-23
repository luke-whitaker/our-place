import { describe, it, expect } from "vitest";
import { computeViewport, fitCanvas, MIN_VIEW_W } from "./viewport";

describe("computeViewport", () => {
  it("matches today's desktop view at dpr 1: worldScale 2, view 480x320", () => {
    const vp = computeViewport(960, 640, 1);
    expect(vp.worldScale).toBe(2);
    expect(vp.viewW).toBe(480);
    expect(vp.viewH).toBe(320);
  });

  it("keeps the same view at dpr 2, just at a sharper worldScale", () => {
    const vp = computeViewport(960, 640, 2);
    expect(vp.worldScale).toBe(4);
    expect(vp.viewW).toBe(480);
    expect(vp.viewH).toBe(320);
  });

  it("backs the zoom off for a narrow phone canvas, staying crisp and wide enough", () => {
    const vp = computeViewport(390, 700, 3);
    expect(Number.isInteger(vp.worldScale)).toBe(true);
    expect(vp.worldScale).toBeGreaterThan(0);
    expect(vp.viewW).toBeGreaterThanOrEqual(MIN_VIEW_W);
  });
});

describe("fitCanvas", () => {
  it("fills a portrait phone screen edge to edge", () => {
    expect(fitCanvas(374, 700, true)).toEqual({ cssW: 374, cssH: 700 });
  });

  it("fills a landscape phone screen, capped by the 3:2 aspect on the short axis", () => {
    expect(fitCanvas(828, 266, true)).toEqual({ cssW: 665, cssH: 266 });
  });

  it("letterboxes a wide desktop window at the classic 960x640", () => {
    expect(fitCanvas(1264, 640, false)).toEqual({ cssW: 960, cssH: 640 });
  });

  it("letterboxes a shorter desktop window, shrinking to fit its height", () => {
    expect(fitCanvas(1264, 500, false)).toEqual({ cssW: 750, cssH: 500 });
  });

  it("never returns less than 1px on either axis", () => {
    expect(fitCanvas(0, 0, true)).toEqual({ cssW: 1, cssH: 1 });
    expect(fitCanvas(0, 0, false)).toEqual({ cssW: 1, cssH: 1 });
  });
});
