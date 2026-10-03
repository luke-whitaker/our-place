import { describe, it, expect } from "vitest";
import {
  BLOOM_MAX_MS,
  BLOOM_MIN_MS,
  CAPITAL_PLANT_CAP,
  FLOWER_COLORS,
  ISLAND_PLANT_CAP,
  chooseBloom,
  isFlowerColor,
  placedFromWire,
  plantCap,
  plantFixture,
  plantableWorld,
  plotProblem,
  withPlants,
  type PlacedPlant,
} from "./plants";
import { buildSolidGrid } from "./iso-collision";
import { fixtureSprite, createIsoState } from "./iso-engine";
import { CAPITAL } from "./worlds/world-map";

function plant(overrides: Partial<PlacedPlant> = {}): PlacedPlant {
  return {
    id: "p1",
    col: 10,
    row: 10,
    owner: "ann",
    ownerName: "Ann",
    mine: true,
    color: null,
    ...overrides,
  };
}

/** The first tile near spawn the rule allows, so tests stand somewhere real. */
function openTile(): { col: number; row: number } {
  const { col: sc, row: sr } = CAPITAL.spawn;
  for (let d = 3; d < 40; d++) {
    for (let dc = -d; dc <= d; dc++) {
      const t = { col: Math.floor(sc) + dc, row: Math.floor(sr) + d };
      if (plotProblem(CAPITAL, t.col, t.row) === null) return t;
    }
  }
  throw new Error("No open tile");
}

describe("flower colors and caps", () => {
  it("knows its five colors", () => {
    expect(FLOWER_COLORS).toHaveLength(5);
    expect(isFlowerColor("pink")).toBe(true);
    expect(isFlowerColor("green")).toBe(false);
    expect(isFlowerColor(null)).toBe(false);
  });

  it("caps the Capital at 10 and an island generously", () => {
    expect(plantCap("capital")).toBe(CAPITAL_PLANT_CAP);
    expect(plantCap("island:abc")).toBe(ISLAND_PLANT_CAP);
    expect(ISLAND_PLANT_CAP).toBeGreaterThan(CAPITAL_PLANT_CAP);
  });

  it("allows the shared world and your own island, nowhere else", () => {
    expect(plantableWorld("capital", "island:me")).toBe(true);
    expect(plantableWorld("island:me", "island:me")).toBe(true);
    expect(plantableWorld("island:you", "island:me")).toBe(false);
    expect(plantableWorld("island:me:inside", "island:me")).toBe(false);
    expect(plantableWorld("music-inside", "island:me")).toBe(false);
  });
});

describe("chooseBloom", () => {
  const now = new Date("2026-10-02T12:00:00Z");

  it("blooms 12 hours out at the low end and just under 24 at the high end", () => {
    expect(chooseBloom(now, () => 0).bloomsAt.getTime() - now.getTime()).toBe(BLOOM_MIN_MS);
    const late = chooseBloom(now, () => 0.999999).bloomsAt.getTime() - now.getTime();
    expect(late).toBeLessThan(BLOOM_MAX_MS);
    expect(late).toBeGreaterThan(BLOOM_MAX_MS - 1000);
  });

  it("picks every color across the range", () => {
    const seen = new Set(
      [0, 0.2, 0.4, 0.6, 0.8].map((r) => chooseBloom(now, () => r + 0.01).color),
    );
    expect([...seen].sort()).toEqual([...FLOWER_COLORS].sort());
  });
});

describe("plant fixtures", () => {
  it("labels by whose it is and whether it has bloomed", () => {
    expect(plantFixture(plant()).label).toBe("Dig up the seed");
    expect(plantFixture(plant({ color: "red" })).label).toBe("Pick the flower");
    expect(plantFixture(plant({ mine: false })).label).toBe("Look at the mound");
    expect(plantFixture(plant({ mine: false, color: "red" })).label).toBe("Look at the flower");
  });

  it("draws a mound until it blooms, then the flower's own color", () => {
    const state = createIsoState(CAPITAL);
    expect(fixtureSprite(plantFixture(plant()), state)).toBe("plant_mound");
    expect(fixtureSprite(plantFixture(plant({ color: "blue" })), state)).toBe("flower_blue");
  });

  it("maps the wire shape", () => {
    expect(
      placedFromWire({
        id: "p1",
        col: 1,
        row: 2,
        owner: { username: "ann", display_name: "Ann" },
        mine: false,
        color: "pink",
      }),
    ).toEqual(plant({ col: 1, row: 2, mine: false, color: "pink" }));
  });

  it("keeps the world's identity with nothing planted", () => {
    expect(withPlants(CAPITAL, [])).toBe(CAPITAL);
  });

  it("is never solid, so a garden can't block a path", () => {
    const tile = openTile();
    const world = withPlants(CAPITAL, [plant(tile)]);
    expect(buildSolidGrid(world)[tile.row][tile.col]).toBe(false);
  });
});

describe("plotProblem", () => {
  it("allows open ground and refuses off the map", () => {
    const tile = openTile();
    expect(plotProblem(CAPITAL, tile.col, tile.row)).toBeNull();
    expect(plotProblem(CAPITAL, -1, 0)).toMatch(/isn't a spot/);
    expect(plotProblem(CAPITAL, 1.5, 3)).toMatch(/isn't a spot/);
  });

  it("refuses a tile that already holds a plant, but lets plants stand side by side", () => {
    const tile = openTile();
    const world = withPlants(CAPITAL, [plant(tile)]);
    expect(plotProblem(world, tile.col, tile.row)).toBe("Something's already growing there.");
    const beside = [
      { col: tile.col + 1, row: tile.row },
      { col: tile.col - 1, row: tile.row },
      { col: tile.col, row: tile.row + 1 },
    ].find((t) => plotProblem(CAPITAL, t.col, t.row) === null);
    if (beside) expect(plotProblem(world, beside.col, beside.row)).toBeNull();
  });

  it("refuses solid ground and anything people use", () => {
    const grid = buildSolidGrid(CAPITAL);
    const row = grid.findIndex((r) => r.some(Boolean));
    expect(plotProblem(CAPITAL, grid[row].indexOf(true), row)).toMatch(/already there/);
    const shrine = CAPITAL.mushrooms[0];
    const nextTo = { col: shrine.col, row: shrine.row + 1 };
    expect(plotProblem(CAPITAL, nextTo.col, nextTo.row)).not.toBeNull();
  });
});
