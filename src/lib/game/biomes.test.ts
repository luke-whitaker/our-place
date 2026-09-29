import { describe, it, expect } from "vitest";
import { biomeAt, extraGroundBiomes, extraObjectBiomes } from "./biomes";

const mixed = {
  cols: 3,
  rows: 2,
  biomes: {
    presets: ["forest", "snow", "swamp"] as ("forest" | "snow" | "swamp")[],
    grid: [
      [0, 1, 1],
      [0, 0, 2],
    ],
  },
  objects: [
    { kind: "pine1", col: 1, row: 0 },
    { kind: "oak1", col: 2, row: 1 },
    { kind: "oak1", col: 0, row: 0 },
  ],
};

describe("biomeAt", () => {
  it("reads the tile's own preset", () => {
    expect(biomeAt(mixed, 1, 0)).toBe("snow");
    expect(biomeAt(mixed, 2.7, 1.4)).toBe("swamp");
    expect(biomeAt(mixed, 0, 1)).toBe("forest");
  });

  it("falls back to the world tint off the map or without a map", () => {
    expect(biomeAt(mixed, -1, 0)).toBe("forest");
    expect(biomeAt({ cols: 3, rows: 2, tint: "dusk" }, 1, 1)).toBe("dusk");
  });
});

describe("baking only what a world uses", () => {
  it("lists the ground presets beyond the base", () => {
    expect(extraGroundBiomes(mixed).sort()).toEqual(["snow", "swamp"]);
    expect(extraGroundBiomes({ cols: 1, rows: 1, tint: "snow" })).toEqual([]);
  });

  it("pairs each extra preset with only the kinds placed in it", () => {
    const pairs = extraObjectBiomes(mixed);
    expect([...(pairs.get("snow") ?? [])]).toEqual(["pine1"]);
    expect([...(pairs.get("swamp") ?? [])]).toEqual(["oak1"]);
    expect(pairs.has("forest")).toBe(false);
  });
});
