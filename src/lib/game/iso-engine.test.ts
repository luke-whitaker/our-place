import { describe, it, expect } from "vitest";
import { createIsoState, getLocalEntity, findRegionId, warpMenuOptions } from "./iso-engine";
import { LAB_TOWN } from "./worlds/lab-town";

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
