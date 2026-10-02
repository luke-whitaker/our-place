import { describe, it, expect } from "vitest";
import {
  PLANT_CLEARANCE,
  frontTile,
  gatheringIdFromSpawn,
  gatheringSpawnId,
  mushroomLanding,
  plantProblem,
  withEventMushrooms,
  type PlantedMushroom,
} from "./event-mushroom";
import { INTERACT_TILES } from "./iso-engine";
import { buildSolidGrid } from "./iso-collision";
import type { IsoWorld, TerrainKind } from "./world-model";

// A 9x5 meadow split by a pond at column 4, crossed by one dry tile at (4, 2).
// Spawn is on the west side; a door stands at (7, 4) on the east side.
const ROWS: TerrainKind[][] = Array.from({ length: 5 }, (_, r) =>
  Array.from({ length: 9 }, (_, c): TerrainKind => (c === 4 && r !== 2 ? "water" : "grass")),
);
const MEADOW: IsoWorld = {
  id: "meadow",
  cols: 9,
  rows: 5,
  spawn: { col: 1, row: 2 },
  terrain: ROWS,
  objects: [],
  doors: [{ id: "hall", label: "Hall", col: 7, row: 4 }],
  mushrooms: [],
  links: [],
  regions: [],
};

const PLANTED: PlantedMushroom = { gatheringId: "g1", col: 1, row: 0, host: "ada", invited: true };

describe("gathering spawn ids", () => {
  it("round-trips a gathering id through ?at=", () => {
    expect(gatheringIdFromSpawn(gatheringSpawnId("abc"))).toBe("abc");
  });

  it("ignores anything else", () => {
    expect(gatheringIdFromSpawn(undefined)).toBeNull();
    expect(gatheringIdFromSpawn("island-shrine")).toBeNull();
    expect(gatheringIdFromSpawn("gathering-")).toBeNull();
  });
});

describe("plantProblem", () => {
  it("allows open ground that blocks nothing", () => {
    expect(plantProblem(MEADOW, 2, 4)).toBeNull();
  });

  it("refuses off the map, between tiles, and on water", () => {
    expect(plantProblem(MEADOW, -1, 0)).not.toBeNull();
    expect(plantProblem(MEADOW, 9, 0)).not.toBeNull();
    expect(plantProblem(MEADOW, 1.5, 0)).not.toBeNull();
    expect(plantProblem(MEADOW, 4, 0)).toMatch(/already there/);
  });

  it("keeps clear of a door, as far as the engine's reach", () => {
    expect(PLANT_CLEARANCE).toBe(INTERACT_TILES);
    expect(plantProblem(MEADOW, 7, 3)).toMatch(/Too close/);
    expect(plantProblem(MEADOW, 7, 1)).toBeNull();
  });

  it("refuses the one tile that would cut the meadow in two", () => {
    expect(plantProblem(MEADOW, 4, 2)).toMatch(/block the way/);
  });

  it("refuses a tile another mushroom stands on or beside", () => {
    const world = withEventMushrooms(MEADOW, [PLANTED]);
    expect(plantProblem(world, 1, 0)).not.toBeNull();
    expect(plantProblem(world, 2, 0)).toMatch(/Too close/);
  });
});

describe("withEventMushrooms", () => {
  it("returns the same world when nothing is planted", () => {
    expect(withEventMushrooms(MEADOW, [])).toBe(MEADOW);
  });

  it("adds each mushroom as a solid fixture labelled for its viewer", () => {
    const world = withEventMushrooms(MEADOW, [
      PLANTED,
      { ...PLANTED, gatheringId: "g2", col: 6, row: 0, invited: false },
    ]);
    expect(world.fixtures?.map((f) => [f.id, f.label])).toEqual([
      ["gathering-g1", "Open gathering"],
      ["gathering-g2", "Look at the mushroom"],
    ]);
    expect(buildSolidGrid(world)[0][1]).toBe(true);
  });
});

describe("frontTile", () => {
  it("picks the neighbouring tile the player faces on screen", () => {
    expect(frontTile(5.5, 5.5, "S")).toEqual({ col: 6, row: 6 });
    expect(frontTile(5.5, 5.5, "N")).toEqual({ col: 4, row: 4 });
    expect(frontTile(5.5, 5.5, "E")).toEqual({ col: 6, row: 4 });
    expect(frontTile(5.5, 5.5, "W")).toEqual({ col: 4, row: 6 });
  });

  it("never picks the player's own tile", () => {
    for (const dir of ["S", "SE", "E", "NE", "N", "NW", "W", "SW"] as const) {
      expect(frontTile(5.1, 5.9, dir)).not.toEqual({ col: 5, row: 5 });
    }
  });
});

describe("mushroomLanding", () => {
  it("lands south of the mushroom when that's open, like a shrine", () => {
    const solid = buildSolidGrid(withEventMushrooms(MEADOW, [PLANTED]));
    expect(mushroomLanding(solid, 1, 0)).toEqual({ col: 1, row: 1 });
  });

  it("goes around when south is blocked, and gives up when boxed in", () => {
    const solid = buildSolidGrid(MEADOW);
    expect(mushroomLanding(solid, 4, 0)).toEqual({ col: 5, row: 0 });
    const walled = solid.map((row) => row.map(() => true));
    expect(mushroomLanding(walled, 1, 1)).toBeNull();
  });
});
