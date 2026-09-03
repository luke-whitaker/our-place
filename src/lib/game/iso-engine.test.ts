import { describe, it, expect, vi } from "vitest";
import {
  createIsoState,
  getLocalEntity,
  findRegionId,
  warpMenuOptions,
  warpMenuEntries,
  cameraFor,
  update,
  buildWorldCollision,
  terrainToGrass,
} from "./iso-engine";
import { LAB_TOWN } from "./worlds/lab-town";
import type { IsoWorld } from "./world-model";
import type { InputManager } from "./input";
import type { WorldLink } from "./types";

/** An input manager that reports one key press, once, and nothing else. */
function keyOnce(code: string | null): InputManager {
  let pending = code;
  return {
    isDown: () => false,
    consume: (c) => {
      if (pending === c) {
        pending = null;
        return true;
      }
      return false;
    },
    press: () => {},
    release: () => {},
    attach: () => () => {},
  };
}

const CAPITAL_LINK: WorldLink = { id: "capital", label: "The Capital", place: "capital" };
const LINKED_TOWN: IsoWorld = { ...LAB_TOWN, links: [CAPITAL_LINK] };

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

  it("labels the local player and can start faded to black", () => {
    const state = createIsoState(LAB_TOWN, { playerLabel: "Luke", fadeIn: true });
    expect(getLocalEntity(state).label).toBe("Luke");
    expect(state.fade).toBe(1);
    expect(state.fadeDir).toBe(-1);
    expect(state.mode).toBe("fading");

    const solid = buildWorldCollision(LAB_TOWN);
    // 1/FADE_SPEED ticks brings the fade back to zero and control returns.
    for (let i = 0; i < 30; i++) update(state, LAB_TOWN, solid, keyOnce(null));
    expect(state.fade).toBe(0);
    expect(state.mode).toBe("overworld");
  });
});

describe("terrainToGrass", () => {
  it("treats void as not-grass so an island edge gets the dirt skirt", () => {
    const world: IsoWorld = {
      ...LAB_TOWN,
      cols: 2,
      rows: 1,
      terrain: [["grass", "void"]],
    };
    expect(terrainToGrass(world)).toEqual([[true, false]]);
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

describe("warpMenuEntries", () => {
  it("lists discovered shrines first, then the world's links, undiscovered or not", () => {
    const state = createIsoState(LINKED_TOWN, { discovered: ["mushroom-lab-ridge"] });
    expect(warpMenuEntries(state, LINKED_TOWN).map((e) => e.label)).toEqual([
      "Ridge Shrine",
      "The Capital",
    ]);
    const fresh = createIsoState(LINKED_TOWN);
    expect(warpMenuEntries(fresh, LINKED_TOWN).map((e) => e.kind)).toEqual(["link"]);
  });
});

describe("choosing a link in the warp menu", () => {
  function openMenuOnLink() {
    const state = createIsoState(LINKED_TOWN);
    state.nearbyMushroom = LINKED_TOWN.mushrooms[0];
    state.mode = "warp-menu";
    state.warpMenuIndex = 0; // nothing discovered, so row 0 is the link
    return state;
  }

  it("fades out, fires the callback at the peak, and then holds black", () => {
    const state = openMenuOnLink();
    const solid = buildWorldCollision(LINKED_TOWN);
    const onWorldLink = vi.fn();

    update(state, LINKED_TOWN, solid, keyOnce("Enter"), { onWorldLink });
    expect(state.pendingLink).toEqual(CAPITAL_LINK);
    expect(state.mode).toBe("fading");
    expect(state.fadeDir).toBe(1);
    expect(onWorldLink).not.toHaveBeenCalled();

    for (let i = 0; i < 30; i++) update(state, LINKED_TOWN, solid, keyOnce(null), { onWorldLink });
    expect(onWorldLink).toHaveBeenCalledTimes(1);
    expect(onWorldLink).toHaveBeenCalledWith(CAPITAL_LINK);
    expect(state.fade).toBe(1);
    expect(state.fadeDir).toBe(0);
    expect(state.mode).toBe("fading");
    expect(state.pendingLink).toBeNull();
  });

  it("fades back in when nobody handles the link", () => {
    const state = openMenuOnLink();
    const solid = buildWorldCollision(LINKED_TOWN);
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    for (let i = 0; i < 60; i++) update(state, LINKED_TOWN, solid, keyOnce(null));
    expect(state.fade).toBe(0);
    expect(state.mode).toBe("overworld");
  });

  it("still warps to a shrine when one is chosen", () => {
    const state = createIsoState(LINKED_TOWN, { discovered: ["mushroom-lab-ridge"] });
    state.nearbyMushroom = LINKED_TOWN.mushrooms[0];
    state.mode = "warp-menu";
    state.warpMenuIndex = 0; // Ridge Shrine
    update(state, LINKED_TOWN, buildWorldCollision(LINKED_TOWN), keyOnce("Enter"));
    expect(state.pendingWarp?.id).toBe("mushroom-lab-ridge");
    expect(state.pendingLink).toBeNull();
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
      id: "tiny",
      cols: 4,
      rows: 4,
      spawn: { col: 0, row: 0 },
      terrain: [],
      objects: [],
      doors: [],
      mushrooms: [],
      links: [],
      regions: [],
    };
    // Same camera regardless of where the entity stands — the world is centered.
    expect(cameraFor(tiny, 1, 1).x).toBe(cameraFor(tiny, 3, 3).x);
  });
});
