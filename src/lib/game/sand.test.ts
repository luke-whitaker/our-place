import { describe, it, expect } from "vitest";
import { drawsAsSand, sandBiomes } from "./sand";
import { rgbToHsl, sandPixels } from "./terrain-tint";
import type { TerrainKind } from "./world-model";

const terrain: TerrainKind[][] = [
  ["grass", "grass", "grass"],
  ["grass", "sand", "dirt"],
  ["water", "water", "water"],
];

describe("drawsAsSand", () => {
  it("covers sand and the grass right beside it, and nothing else", () => {
    expect(drawsAsSand(terrain, 1, 1)).toBe(true);
    expect(drawsAsSand(terrain, 1, 0)).toBe(true); // grass beside the sand
    expect(drawsAsSand(terrain, 0, 0)).toBe(false); // grass only diagonal to it
    expect(drawsAsSand(terrain, 2, 1)).toBe(false); // a dirt trail stays dirt
  });
});

describe("sandBiomes", () => {
  it("lists each biome with a beach, and nothing for a world without one", () => {
    const world = {
      cols: 3,
      rows: 3,
      terrain,
      biomes: {
        presets: ["forest" as const, "autumn" as const],
        grid: [
          [0, 0, 0],
          [0, 1, 0],
          [0, 0, 0],
        ],
      },
    };
    expect(sandBiomes(world).sort()).toEqual(["autumn", "forest"]);
    expect(sandBiomes({ ...world, terrain: [["grass"]], cols: 1, rows: 1 })).toEqual([]);
  });
});

describe("sandPixels", () => {
  const pixel = (r: number, g: number, b: number) => new Uint8ClampedArray([r, g, b, 255]);

  it("turns dirt paler and warmer", () => {
    const dirt = pixel(115, 84, 58);
    sandPixels(dirt);
    const [hue, , light] = rgbToHsl(dirt[0], dirt[1], dirt[2]);
    expect(hue).toBeGreaterThan(35);
    expect(hue).toBeLessThan(45);
    expect(light).toBeGreaterThan(rgbToHsl(115, 84, 58)[2]);
  });

  it("leaves grass alone", () => {
    const grass = pixel(116, 168, 62);
    sandPixels(grass);
    expect([...grass]).toEqual([116, 168, 62, 255]);
  });
});
