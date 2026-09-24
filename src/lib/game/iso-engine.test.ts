import { describe, it, expect, vi } from "vitest";
import {
  createIsoState,
  getLocalEntity,
  findRegionId,
  warpMenuOptions,
  warpMenuEntries,
  pcMenuEntries,
  menuView,
  cameraFor,
  update,
  buildWorldCollision,
  terrainToGrass,
  ISO_VIEW_W,
  ISO_VIEW_H,
  CONFIRM_TICKS,
  nearestTarget,
  endNpcTalk,
} from "./iso-engine";
import { INTERIORS } from "./worlds/interiors";
import { LAB_TOWN } from "./worlds/lab-town";
import { createInputManager } from "./input";
import type { IsoWorld } from "./world-model";
import type { InputManager } from "./input";
import type { Door, Pc, WorldLink, WorldNpc } from "./types";

const DESKTOP_VIEW = { w: ISO_VIEW_W, h: ISO_VIEW_H };

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
    pick: () => {},
    consumePick: () => null,
    attach: () => () => {},
    endTick: () => {},
  };
}

/** An input manager that reports one pending menu pick (a WorldMenu tile tap),
 * once, and nothing else. */
function pickOnce(row: number): InputManager {
  let pending: number | null = row;
  return {
    isDown: () => false,
    consume: () => false,
    press: () => {},
    release: () => {},
    pick: () => {},
    consumePick: () => {
      const picked = pending;
      pending = null;
      return picked;
    },
    attach: () => () => {},
    endTick: () => {},
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
    state.menuIndex = 0; // nothing discovered, so row 0 is the link
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
    state.menuIndex = 0; // Ridge Shrine
    update(state, LINKED_TOWN, buildWorldCollision(LINKED_TOWN), keyOnce("Enter"));
    expect(state.pendingWarp?.id).toBe("mushroom-lab-ridge");
    expect(state.pendingLink).toBeNull();
  });
});

describe("nearestTarget", () => {
  const door = { id: "d", col: 4, row: 1, label: "Out" } as Door;
  const pc = { id: "pc", col: 2, row: 2, label: "PC" } as Pc;

  it("keeps only the nearer of a door and a PC", () => {
    expect(nearestTarget({ door, pc, mushroom: null, npc: null }, 3, 2)).toEqual({
      door: null,
      pc,
      mushroom: null,
      npc: null,
    });
  });

  it("gives a tie to the door, so a door can always be walked into", () => {
    const near = { ...door, col: 3, row: 1 };
    expect(nearestTarget({ door: near, pc, mushroom: null, npc: null }, 3, 2).door).toBe(near);
  });

  it("keeps only the nearer of an NPC and everything else", () => {
    const npc: WorldNpc = { id: "gnomie", col: 6, row: 2, facing: "S" };
    expect(nearestTarget({ door, pc, mushroom: null, npc }, 6, 2)).toEqual({
      door: null,
      pc: null,
      mushroom: null,
      npc,
    });
  });
});

describe("a PC two tiles from the exit", () => {
  // The Technology room: PC at 2,2, exit door at 4,1. Standing east of the PC
  // reaches both, and the door used to win.
  const world = INTERIORS["technology-inside"];
  const solid = buildWorldCollision(world);

  it("answers with the PC, and stepping toward it never walks out the door", () => {
    const state = createIsoState(world, { spawnCol: 3, spawnRow: 2 });
    update(state, world, solid, keysHeld());
    expect(state.nearbyPc?.id).toBe("pc");
    expect(state.nearbyDoor).toBeNull();

    // Toward the PC is screen up-left, which reads as "heading into a door".
    for (let i = 0; i < 10; i++) update(state, world, solid, keysHeld("ArrowUp", "ArrowLeft"));
    expect(state.confirm).toBeNull();
    expect(state.mode).toBe("overworld");

    update(state, world, solid, keyOnce("Enter"));
    expect(state.confirm?.action).toEqual({ kind: "pc" });
  });
});

describe("cameraFor", () => {
  it("clamps to the world's padded edges when the world is larger than the view", () => {
    // LAB_TOWN (24×24) is wider/taller than the viewport, so corners pin to an edge.
    // Left edge: world left (-368) minus a half-tile pad (16).
    expect(cameraFor(LAB_TOWN, 0, 23, DESKTOP_VIEW).x).toBe(-384);
    // Right edge: world right (368) + pad (16) − view width (480).
    expect(cameraFor(LAB_TOWN, 23, 0, DESKTOP_VIEW).x).toBe(-96);
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
    expect(cameraFor(tiny, 1, 1, DESKTOP_VIEW).x).toBe(cameraFor(tiny, 3, 3, DESKTOP_VIEW).x);
  });
});

describe("pcMenuEntries", () => {
  it("puts a labelled Log on port first when the PC has an href, then the world's links", () => {
    const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "/communities/test" };
    const entries = pcMenuEntries(pc, LINKED_TOWN);
    expect(entries[0]).toEqual({ kind: "port", label: "Log on", href: "/communities/test" });
    expect(entries.slice(1)).toEqual([{ kind: "link", label: "The Capital", link: CAPITAL_LINK }]);
  });

  it("omits the Log on row when the PC has no href", () => {
    const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "" };
    expect(pcMenuEntries(pc, LINKED_TOWN)).toEqual([
      { kind: "link", label: "The Capital", link: CAPITAL_LINK },
    ]);
  });
});

describe("PC proximity and the pc-menu mode", () => {
  const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "/communities/test" };
  const world: IsoWorld = { ...LAB_TOWN, pcs: [pc], links: [CAPITAL_LINK] };

  it("notices a nearby PC while walking, and opens the pc-menu on Enter", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    const solid = buildWorldCollision(world);

    update(state, world, solid, keyOnce(null));
    expect(state.nearbyPc).toEqual(pc);

    update(state, world, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld"); // confirming first
    for (let i = 0; i < CONFIRM_TICKS; i++) update(state, world, solid, keyOnce(null));
    expect(state.mode).toBe("pc-menu");
    expect(state.menuIndex).toBe(0);
  });
});

describe("NPC proximity and talking", () => {
  const npc: WorldNpc = { id: "gnomie", col: 5, row: 5, facing: "N" };
  const world: IsoWorld = { ...LAB_TOWN, npcs: [npc] };

  it("notices a nearby NPC while walking", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    const solid = buildWorldCollision(world);
    update(state, world, solid, keyOnce(null));
    expect(state.nearbyNpc).toEqual(npc);
  });

  it("starts idle-facing, then confirming Enter fires onNpcTalk after CONFIRM_TICKS, turns the NPC to face the player, and pauses the engine", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    const solid = buildWorldCollision(world);
    expect(state.npcFacing[npc.id]).toBe("N"); // the authored default

    update(state, world, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld"); // confirming first
    expect(state.confirm?.text).toBe("Talk to Gnomie");
    expect(state.confirm?.action).toEqual({ kind: "npc", npc });

    const onNpcTalk = vi.fn();
    for (let i = 0; i < CONFIRM_TICKS; i++) {
      update(state, world, solid, keyOnce(null), { onNpcTalk });
    }
    expect(onNpcTalk).toHaveBeenCalledTimes(1);
    expect(onNpcTalk).toHaveBeenCalledWith("gnomie");
    // The player stands one row south of the NPC — the same tile delta
    // facingToward's own test says projects to "SW" on screen.
    expect(state.npcFacing[npc.id]).toBe("SW");
    expect(state.mode).toBe("dialogue");

    // Paused: a further update does nothing (no menu, no movement).
    const before = getLocalEntity(state).row;
    update(state, world, solid, keysHeld("ArrowDown"), { onNpcTalk });
    expect(onNpcTalk).toHaveBeenCalledTimes(1);
    expect(getLocalEntity(state).row).toBe(before);

    endNpcTalk(state, world, npc.id);
    expect(state.mode).toBe("overworld");
    expect(state.npcFacing[npc.id]).toBe("N"); // back to its default
  });

  it("drains a pending Enter while paused, so it can't reopen the NPC it just closed", () => {
    // Regression: the DOM dialogue closes on the same physical Enter press
    // that the engine's own InputManager also queues. If that queued press
    // survived past the resume, the very next tick would read it as a fresh
    // Enter at whatever NPC the player is still standing beside — instantly
    // reopening the dialogue it was just told to close. update() must drain
    // Enter/Space on every tick it spends paused, not just return early.
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    state.mode = "dialogue";
    const input = createInputManager();
    input.press("Enter"); // simulates the close keypress the DOM handler saw too
    update(state, world, buildWorldCollision(world), input);
    expect(input.consume("Enter")).toBe(false); // already drained, nothing left to consume

    // Resuming now must not find an armed confirm waiting to fire.
    endNpcTalk(state, world, npc.id);
    update(state, world, buildWorldCollision(world), keyOnce(null));
    expect(state.mode).toBe("overworld");
    expect(state.confirm).toBeNull();
  });
});

describe("choosing Log on in a PC's menu", () => {
  const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "/communities/test" };
  const world: IsoWorld = { ...LAB_TOWN, pcs: [pc], links: [CAPITAL_LINK] };

  function openPcMenu() {
    const state = createIsoState(world);
    state.nearbyPc = pc;
    state.mode = "pc-menu";
    state.menuIndex = 0; // Log on is row 0 whenever the PC has an href
    return state;
  }

  it("fades out, fires onPcPort at the peak with the href, and then holds black", () => {
    const state = openPcMenu();
    const solid = buildWorldCollision(world);
    const onPcPort = vi.fn();

    update(state, world, solid, keyOnce("Enter"), { onPcPort });
    expect(state.pendingPort).toBe("/communities/test");
    expect(state.mode).toBe("fading");
    expect(state.fadeDir).toBe(1);
    expect(onPcPort).not.toHaveBeenCalled();

    for (let i = 0; i < 30; i++) update(state, world, solid, keyOnce(null), { onPcPort });
    expect(onPcPort).toHaveBeenCalledTimes(1);
    expect(onPcPort).toHaveBeenCalledWith("/communities/test");
    expect(state.fade).toBe(1);
    expect(state.fadeDir).toBe(0);
    expect(state.mode).toBe("fading");
    expect(state.pendingPort).toBeNull();
  });

  it("closes back to overworld on Escape, without porting", () => {
    const state = openPcMenu();
    const solid = buildWorldCollision(world);
    update(state, world, solid, keyOnce("Escape"));
    expect(state.mode).toBe("overworld");
    expect(state.pendingPort).toBeNull();
  });
});

describe("picking a menu row by tapping a WorldMenu tile", () => {
  const pc: Pc = { col: 5, row: 5, id: "pc", label: "Music PC", href: "/communities/music" };
  const world: IsoWorld = { ...LAB_TOWN, pcs: [pc], links: [CAPITAL_LINK] };

  function openPcMenu() {
    const state = createIsoState(world);
    state.nearbyPc = pc;
    state.mode = "pc-menu";
    state.menuIndex = 0;
    return state;
  }

  it("stages a link row and starts the fade, the same as Enter would", () => {
    const state = openPcMenu();
    const solid = buildWorldCollision(world);
    // pcMenuEntries is [Log on (port), The Capital (link)] — row 1 is the link.
    update(state, world, solid, pickOnce(1));
    expect(state.pendingLink).toEqual(CAPITAL_LINK);
    expect(state.mode).toBe("fading");
    expect(state.menuIndex).toBe(1);
  });

  it("stages the port row when row 0 is picked", () => {
    const state = openPcMenu();
    const solid = buildWorldCollision(world);
    update(state, world, solid, pickOnce(0));
    expect(state.pendingPort).toBe("/communities/music");
    expect(state.mode).toBe("fading");
  });

  it("ignores an out-of-range pick and leaves the menu open", () => {
    const state = openPcMenu();
    const solid = buildWorldCollision(world);
    update(state, world, solid, pickOnce(99));
    expect(state.mode).toBe("pc-menu");
    expect(state.pendingLink).toBeNull();
    expect(state.pendingPort).toBeNull();
  });
});

describe("menuView", () => {
  const pc: Pc = { col: 5, row: 5, id: "pc", label: "Music PC", href: "/communities/music" };
  const world: IsoWorld = { ...LAB_TOWN, pcs: [pc], links: [CAPITAL_LINK] };

  it("returns null in the overworld", () => {
    const state = createIsoState(world);
    expect(menuView(state, world)).toBeNull();
  });

  it("returns the PC's own label and its menu rows in pc-menu", () => {
    const state = createIsoState(world);
    state.nearbyPc = pc;
    state.mode = "pc-menu";
    expect(menuView(state, world)).toEqual({
      title: "Music PC",
      entries: pcMenuEntries(pc, world),
    });
  });

  it("returns the shrine network's title and rows in warp-menu", () => {
    const state = createIsoState(LINKED_TOWN);
    state.mode = "warp-menu";
    expect(menuView(state, LINKED_TOWN)).toEqual({
      title: "Mycelium Network",
      entries: warpMenuEntries(state, LINKED_TOWN),
    });
  });
});

describe("interaction priority", () => {
  it("gives a door a tie with a PC, and keeps only that one target", () => {
    const door: Door = { col: 5, row: 5, id: "welcome-center", label: "Welcome Center" };
    const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "/communities/test" };
    const world: IsoWorld = { ...LAB_TOWN, doors: [door], pcs: [pc], links: [] };
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    const solid = buildWorldCollision(world);

    update(state, world, solid, keyOnce(null));
    expect(state.nearbyDoor).toEqual(door);
    expect(state.nearbyPc).toBeNull();

    update(state, world, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld"); // confirming first
    expect(state.confirm?.action).toEqual({ kind: "door", door });
    for (let i = 0; i < CONFIRM_TICKS; i++) update(state, world, solid, keyOnce(null));
    expect(state.mode).toBe("fading");
    expect(state.pendingDoor).toEqual(door);
  });
});

/** An input manager reporting a set of held keys, for movement-driven tests. */
function keysHeld(...codes: string[]): InputManager {
  const held = new Set(codes);
  return {
    isDown: (c) => held.has(c),
    consume: () => false,
    press: () => {},
    release: () => {},
    pick: () => {},
    consumePick: () => null,
    attach: () => () => {},
    endTick: () => {},
  };
}

describe("walking into a door", () => {
  const door: Door = {
    col: 5,
    row: 5,
    id: "welcome-center",
    label: "Welcome Center",
    warpTo: "welcome-center-inside",
    spawnAt: "exit",
  };
  const world: IsoWorld = { ...LAB_TOWN, doors: [door], links: [] };
  const solid = buildWorldCollision(world);

  /** Spawn clear of the door and walk back to it, so auto-warp is armed — which
   * is what happens to a player who was not just deposited by that same door. */
  function armedAtDoor() {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 9 });
    update(state, world, solid, keysHeld()); // no door in reach: arms
    expect(state.doorArmed).toBe(true);
    getLocalEntity(state).row = 6; // now standing just south of the door
    return state;
  }

  it("goes through the same confirm as Enter, then warps", () => {
    const state = armedAtDoor();
    update(state, world, solid, keysHeld("ArrowUp"));
    expect(state.mode).toBe("overworld"); // confirming first
    expect(state.confirm?.action).toEqual({ kind: "door", door });

    // Holding the key through the flash must not move the player or re-fire
    // the walk-into check; the confirm block returns before either runs.
    const { col, row } = getLocalEntity(state);
    for (let i = 1; i < CONFIRM_TICKS; i++) {
      update(state, world, solid, keysHeld("ArrowUp"));
      expect(getLocalEntity(state)).toMatchObject({ col, row, moving: false });
    }

    update(state, world, solid, keysHeld("ArrowUp"));
    expect(state.mode).toBe("fading");
    expect(state.pendingDoor).toEqual(door);
    expect(state.confirm).toBeNull();
  });

  it("does not warp when the player walks past it", () => {
    // Down-right is east along a street in tile space: the row axis alone would
    // read that as northward, which is why the test is on screen direction.
    for (const keys of [["ArrowRight", "ArrowDown"], ["ArrowDown"], ["ArrowLeft"]]) {
      const state = armedAtDoor();
      update(state, world, solid, keysHeld(...keys));
      expect(state.mode).toBe("overworld");
      expect(state.pendingDoor).toBeNull();
    }
  });

  it("does not fire the door it just deposited you at, even holding the key", () => {
    // Arriving through a door leaves you inside its reach; without disarming,
    // a held key would bounce you straight back out in a loop.
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    for (let tick = 0; tick < 10; tick++) {
      update(state, world, solid, keysHeld("ArrowUp"));
      expect(state.mode).toBe("overworld");
    }
    expect(state.doorArmed).toBe(false);
  });

  it("re-arms once the player is clear of every door, and works again", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    update(state, world, solid, keysHeld("ArrowUp"));
    expect(state.doorArmed).toBe(false);

    getLocalEntity(state).row = 9; // walked away
    update(state, world, solid, keysHeld());
    expect(state.doorArmed).toBe(true);

    getLocalEntity(state).row = 6; // came back
    update(state, world, solid, keysHeld("ArrowUp"));
    expect(state.mode).toBe("overworld"); // confirming first
    for (let i = 0; i < CONFIRM_TICKS; i++) update(state, world, solid, keyOnce(null));
    expect(state.mode).toBe("fading");
    expect(state.pendingDoor).toEqual(door);
  });

  it("still opens on Enter, which the touch controls rely on", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    update(state, world, solid, keyOnce(null));
    expect(state.doorArmed).toBe(false); // Enter is not gated on arming
    update(state, world, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld"); // confirming first
    for (let i = 0; i < CONFIRM_TICKS; i++) update(state, world, solid, keyOnce(null));
    expect(state.mode).toBe("fading");
    expect(state.pendingDoor).toEqual(door);
  });
});

describe("confirming an interaction (the prompt pill's green flash)", () => {
  const door: Door = {
    col: 5,
    row: 5,
    id: "welcome-center",
    label: "Welcome Center",
    warpTo: "welcome-center-inside",
    spawnAt: "exit",
  };
  const world: IsoWorld = { ...LAB_TOWN, doors: [door], links: [] };
  const solid = buildWorldCollision(world);

  it("arms a door confirm and keeps mode at overworld", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    update(state, world, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld");
    expect(state.confirm).toEqual({
      text: "Welcome Center",
      ticksLeft: CONFIRM_TICKS,
      action: { kind: "door", door },
    });
  });

  it("holds an arrow key during the confirm without moving the player", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    update(state, world, solid, keyOnce("Enter"));
    const { col, row } = getLocalEntity(state);

    for (let i = 0; i < CONFIRM_TICKS - 1; i++) {
      update(state, world, solid, keysHeld("ArrowDown"));
      expect(getLocalEntity(state)).toMatchObject({ col, row, moving: false });
    }
  });
});

describe("a repeated Enter during a shrine confirm", () => {
  it("is drained rather than picked up as the warp menu's own first keypress", () => {
    // Grove Shrine sits at (9,13); spawn one tile south, in its reach, like a
    // deep link to a shrine would.
    const grove = LINKED_TOWN.mushrooms[0];
    const state = createIsoState(LINKED_TOWN, {
      spawnCol: grove.col,
      spawnRow: grove.row + 1,
      discovered: ["mushroom-lab-ridge"],
    });
    const solid = buildWorldCollision(LINKED_TOWN);
    const input = createInputManager();

    input.press("Enter");
    update(state, LINKED_TOWN, solid, input); // starts the shrine confirm
    expect(state.mode).toBe("overworld");
    expect(state.confirm?.action).toEqual({ kind: "shrine" });

    // A second physical press lands mid-flash. Without draining it, the warp
    // menu that opens right after would read it as its own first keypress and
    // pick row 0 before the player ever sees the list.
    input.press("Enter");
    for (let i = 0; i < CONFIRM_TICKS; i++) update(state, LINKED_TOWN, solid, input);

    expect(state.mode).toBe("warp-menu");
    expect(state.menuIndex).toBe(0);
  });
});
