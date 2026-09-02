import { describe, expect, it } from "vitest";
import { hslToRgb, isTintPreset, rgbToHsl, tintPixels } from "./terrain-tint";

// Colors sampled from the Evergrow art: ground grass, dirt, an oak canopy
// (cool, desaturated teal-green), a trunk brown, and a red roof tile.
const GRASS: [number, number, number] = [116, 168, 62];
const DIRT: [number, number, number] = [122, 78, 52];
const CANOPY: [number, number, number] = [56, 74, 68];
const TRUNK: [number, number, number] = [110, 70, 50];
const ROOF: [number, number, number] = [176, 66, 44];

function pixels(...colors: [number, number, number][]): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flatMap((c) => [...c, 255]));
}

function hslAt(px: Uint8ClampedArray, index: number): [number, number, number] {
  return rgbToHsl(px[index * 4], px[index * 4 + 1], px[index * 4 + 2]);
}

describe("rgbToHsl / hslToRgb", () => {
  it("round-trips within rounding error", () => {
    for (const [r, g, b] of [GRASS, DIRT, CANOPY, [0, 0, 0], [255, 255, 255]] as const) {
      const [h, s, l] = rgbToHsl(r, g, b);
      const [r2, g2, b2] = hslToRgb(h, s, l);
      expect(Math.abs(r2 - r)).toBeLessThanOrEqual(1);
      expect(Math.abs(g2 - g)).toBeLessThanOrEqual(1);
      expect(Math.abs(b2 - b)).toBeLessThanOrEqual(1);
    }
  });

  it("places the sampled colors in the bands the presets assume", () => {
    expect(rgbToHsl(...GRASS)[0]).toBeGreaterThan(70);
    expect(rgbToHsl(...GRASS)[0]).toBeLessThan(120);
    expect(rgbToHsl(...CANOPY)[0]).toBeGreaterThan(140);
    expect(rgbToHsl(...CANOPY)[0]).toBeLessThan(200);
    expect(rgbToHsl(...DIRT)[0]).toBeLessThan(40);
  });
});

describe("tintPixels", () => {
  it("leaves every pixel untouched for the forest preset", () => {
    const px = pixels(GRASS, DIRT, CANOPY);
    const before = Array.from(px);
    tintPixels(px, "forest", "ground");
    expect(Array.from(px)).toEqual(before);
  });

  it("skips fully transparent pixels", () => {
    const px = new Uint8ClampedArray([...GRASS, 0]);
    tintPixels(px, "autumn", "ground");
    expect(Array.from(px)).toEqual([...GRASS, 0]);
  });

  it("turns ground grass orange in autumn while leaving dirt close to itself", () => {
    const px = pixels(GRASS, DIRT);
    tintPixels(px, "autumn", "ground");
    expect(hslAt(px, 0)[0]).toBeGreaterThan(15);
    expect(hslAt(px, 0)[0]).toBeLessThan(60);
    expect(Math.abs(hslAt(px, 1)[0] - rgbToHsl(...DIRT)[0])).toBeLessThan(10);
  });

  it("turns a canopy orange and saturated in autumn but leaves the trunk alone", () => {
    const px = pixels(CANOPY, TRUNK);
    tintPixels(px, "autumn", "nature");
    const [hue, sat] = hslAt(px, 0);
    expect(hue).toBeGreaterThan(5);
    expect(hue).toBeLessThan(45);
    expect(sat).toBeGreaterThan(0.4);
    expect(Math.abs(hslAt(px, 1)[0] - rgbToHsl(...TRUNK)[0])).toBeLessThan(10);
  });

  it("keeps an evergreen's canopy green in autumn", () => {
    const px = pixels(CANOPY);
    tintPixels(px, "autumn", "evergreen");
    expect(Array.from(px)).toEqual([...CANOPY, 255]);
  });

  it("does not recolor a building's roof for a biome preset", () => {
    const px = pixels(ROOF);
    tintPixels(px, "autumn", "building");
    expect(Array.from(px)).toEqual([...ROOF, 255]);
  });

  it("makes ground grass pale and nearly gray in snow", () => {
    const px = pixels(GRASS);
    tintPixels(px, "snow", "ground");
    const [, sat, light] = hslAt(px, 0);
    expect(sat).toBeLessThan(0.2);
    expect(light).toBeGreaterThan(0.75);
  });

  it("darkens ground, trees, and buildings alike at dusk", () => {
    for (const [target, color] of [
      ["ground", GRASS],
      ["nature", CANOPY],
      ["building", ROOF],
    ] as const) {
      const px = pixels(color);
      tintPixels(px, "dusk", target);
      expect(hslAt(px, 0)[2]).toBeLessThan(rgbToHsl(...color)[2]);
    }
  });
});

describe("isTintPreset", () => {
  it("accepts known presets and rejects anything else", () => {
    expect(isTintPreset("autumn")).toBe(true);
    expect(isTintPreset("forest")).toBe(true);
    expect(isTintPreset("lava")).toBe(false);
    expect(isTintPreset(undefined)).toBe(false);
  });
});
