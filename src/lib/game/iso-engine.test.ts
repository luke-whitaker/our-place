import { describe, it, expect } from "vitest";
import {
  createIsoState,
  getLocalEntity,
  findRegionId,
  warpMenuOptions,
  cameraFor,
} from "./iso-engine";
import { LAB_TOWN } from "./worlds/lab-town";
import type { IsoWorld } from "./world-model";

describe("createIsoState", () => {
  it("spawns the local entity at the world's spawn tile", () => {
    const state = createIsoState(LAB_TOWN);
    const player = getLocalEntity(state);
    expect(state.entities).toHaveLength(1);
    expect(state.localId).toBe("local");
    expect(player.col).toBe(LAB_TOWN.spawn.col);
    expect(player.row).toBe(LAB_TOWN.spawn.row);
    expect(state.mode).toBe("overworld");
  });

  it("honors a spawn override and seeded discoveries", () => {
    const state = createIsoState(LAB_TOWN, {
      spawnCol: 3,
      spawnRow: 4,
      discovered: ["mushroom-lab-grove"],
    });
    expect(getLocalEntity(state).col).toBe(3);
    expect(state.discovered.has("mushroom-lab-grove")).toBe(true);
  });
});

describe("findRegionId", () => {
  it("returns the region containing the tile", () => {
    expect(findRegionId(LAB_TOWN, 12, 12)).toBe("lab-town");
  });

  it("returns null outside every region's bounds", () => {
    expect(findRegionId(LAB_TOWN, -1, -1)).toBeNull();
    expect(findRegionId(LAB_TOWN, 999, 999)).toBeNull();
  });
});

describe("warpMenuOptions", () => {
  it("lists discovered shrines except the one being stood at", () => {
    const state = createIsoState(LAB_TOWN, {
      discovered: ["mushroom-lab-grove", "mushroom-lab-ridge"],
    });
    state.nearbyMushroom = LAB_TOWN.mushrooms[0]; // grove
    const options = warpMenuOptions(state, LAB_TOWN);
    expect(options.map((o) => o.id)).toEqual(["mushroom-lab-ridge"]);
  });

  it("omits undiscovered shrines", () => {
    const state = createIsoState(LAB_TOWN, { discovered: ["mushroom-lab-grove"] });
    const options = warpMenuOptions(state, LAB_TOWN);
    expect(options.map((o) => o.id)).toEqual(["mushroom-lab-grove"]);
  });
});

describe("cameraFor", () => {
  it("clamps to the world's padded edges when the world is larger than the view", () => {
    // LAB_TOWN (24×24) is wider/taller than the viewport, so corners pin to an edge.
    // Left edge: world left (-368) minus a half-tile pad (16).
    expect(cameraFor(LAB_TOWN, 0, 23).x).toBe(-384);
    // Right edge: world right (368) + pad (16) − view width (480).
    expect(cameraFor(LAB_TOWN, 23, 0).x).toBe(-96);
  });

  it("centers a world smaller than the view instead of pinning to an edge", () => {
    const tiny: IsoWorld = {
      cols: 4,
      rows: 4,
      spawn: { col: 0, row: 0 },
      terrain: [],
      objects: [],
      doors: [],
      mushrooms: [],
      regions: [],
    };
    // Same camera regardless of where the entity stands — the world is centered.
    expect(cameraFor(tiny, 1, 1).x).toBe(cameraFor(tiny, 3, 3).x);
  });
});
