import { describe, it, expect, vi } from "vitest";
import {
  createIsoState,
  getLocalEntity,
  findRegionId,
  warpMenuOptions,
  warpMenuEntries,
  pcMenuEntries,
  menuView,
  friendMenuEntries,
  setFriends,
  setGatherings,
  travelEntries,
  chooseTravel,
  type FriendsList,
  type GatheringsList,
  cameraFor,
  update,
  buildWorldCollision,
  terrainToGrass,
  ISO_VIEW_W,
  ISO_VIEW_H,
  CONFIRM_TICKS,
  INTERACT_TILES,
  nearestTarget,
  endNpcTalk,
  setMailboxFlag,
  fixtureSprite,
  addDiscovered,
} from "./iso-engine";
import { INTERIORS } from "./worlds/interiors";
import { LAB_TOWN } from "./worlds/lab-town";
import { createInputManager } from "./input";
import type { IsoWorld } from "./world-model";
import type { InputManager } from "./input";
import type { Door, Pc, WorldLink, WorldNpc, WorldFixture } from "./types";

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

describe("shrine discovery", () => {
  it("tells the page once, the first time a shrine comes in reach", () => {
    const state = createIsoState(LAB_TOWN, { spawnCol: 9, spawnRow: 14 });
    const solid = buildWorldCollision(LAB_TOWN);
    const onShrineDiscovered = vi.fn();
    for (let i = 0; i < 5; i++) {
      update(state, LAB_TOWN, solid, keyOnce(null), { onShrineDiscovered });
    }
    expect(onShrineDiscovered).toHaveBeenCalledTimes(1);
    expect(onShrineDiscovered).toHaveBeenCalledWith("mushroom-lab-grove");
  });

  it("takes the account's shrines quietly, with no discovery toast", () => {
    const state = createIsoState(LAB_TOWN);
    addDiscovered(state, ["mushroom-lab-ridge"]);
    expect(state.discovered.has("mushroom-lab-ridge")).toBe(true);
    expect(state.toast).toBeNull();
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
  it("lists discovered shrines first, then the world's links, undiscovered or not, then Friends", () => {
    const state = createIsoState(LINKED_TOWN, { discovered: ["mushroom-lab-ridge"] });
    expect(warpMenuEntries(state, LINKED_TOWN).map((e) => e.label)).toEqual([
      "Ridge Shrine",
      "The Capital",
      "Friends",
    ]);
    const fresh = createIsoState(LINKED_TOWN);
    expect(warpMenuEntries(fresh, LINKED_TOWN).map((e) => e.kind)).toEqual(["link", "friends"]);
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
    expect(nearestTarget({ door, pc, mushroom: null, npc: null, fixture: null }, 3, 2)).toEqual({
      door: null,
      pc,
      mushroom: null,
      npc: null,
      fixture: null,
    });
  });

  it("gives a tie to the door, so a door can always be walked into", () => {
    const near = { ...door, col: 3, row: 1 };
    expect(
      nearestTarget({ door: near, pc, mushroom: null, npc: null, fixture: null }, 3, 2).door,
    ).toBe(near);
  });

  it("keeps only the nearer of an NPC and everything else", () => {
    const npc: WorldNpc = { id: "gnomie", col: 6, row: 2, facing: "S" };
    expect(nearestTarget({ door, pc, mushroom: null, npc, fixture: null }, 6, 2)).toEqual({
      door: null,
      pc: null,
      mushroom: null,
      npc,
      fixture: null,
    });
  });

  it("keeps only the nearer of a fixture and everything else", () => {
    const fixture: WorldFixture = {
      id: "mailbox",
      kind: "mailbox",
      col: 6,
      row: 2,
      label: "Check mailbox",
      owner: "luke",
      color: "slate",
    };
    expect(nearestTarget({ door, pc, mushroom: null, npc: null, fixture }, 6, 2)).toEqual({
      door: null,
      pc: null,
      mushroom: null,
      npc: null,
      fixture,
    });
  });

  it("still gives a tie to the door over a fixture", () => {
    const near = { ...door, col: 3, row: 1 };
    const fixture: WorldFixture = {
      id: "mailbox",
      kind: "mailbox",
      col: 3,
      row: 1,
      label: "Check mailbox",
      color: "slate",
      owner: "luke",
    };
    const result = nearestTarget(
      { door: near, pc: null, mushroom: null, npc: null, fixture },
      3,
      2,
    );
    expect(result.door).toBe(near);
    expect(result.fixture).toBeNull();
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
  it("puts a labelled Log on port first when the PC has an href, then the world's links, then Friends", () => {
    const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "/communities/test" };
    const entries = pcMenuEntries(pc, LINKED_TOWN);
    expect(entries[0]).toEqual({ kind: "port", label: "Log on", href: "/communities/test" });
    expect(entries.slice(1)).toEqual([
      { kind: "link", label: "The Capital", link: CAPITAL_LINK },
      { kind: "friends", label: "Friends" },
    ]);
  });

  it("omits the Log on row when the PC has no href", () => {
    const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "" };
    expect(pcMenuEntries(pc, LINKED_TOWN)).toEqual([
      { kind: "link", label: "The Capital", link: CAPITAL_LINK },
      { kind: "friends", label: "Friends" },
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

describe("fixture proximity and using it", () => {
  const fixture: WorldFixture = {
    id: "mailbox",
    kind: "mailbox",
    col: 5,
    row: 5,
    label: "Check mailbox",
    owner: "luke",
    color: "slate",
  };
  const world: IsoWorld = { ...LAB_TOWN, fixtures: [fixture] };

  it("notices a nearby fixture while walking", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    const solid = buildWorldCollision(world);
    update(state, world, solid, keyOnce(null));
    expect(state.nearbyFixture).toEqual(fixture);
  });

  it("confirming Enter at the mailbox fires onFixture exactly once after CONFIRM_TICKS, with no facing turn, then pauses the engine", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    const solid = buildWorldCollision(world);

    update(state, world, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld"); // confirming first
    expect(state.confirm?.text).toBe("Check mailbox");
    expect(state.confirm?.action).toEqual({ kind: "fixture", fixture });

    const onFixture = vi.fn();
    for (let i = 0; i < CONFIRM_TICKS; i++) {
      update(state, world, solid, keyOnce(null), { onFixture });
    }
    expect(onFixture).toHaveBeenCalledTimes(1);
    expect(onFixture).toHaveBeenCalledWith(fixture);
    expect(state.mode).toBe("dialogue");

    // Paused: a further update does nothing (no menu, no movement), and
    // onFixture does not fire again.
    const before = getLocalEntity(state).row;
    update(state, world, solid, keysHeld("ArrowDown"), { onFixture });
    expect(onFixture).toHaveBeenCalledTimes(1);
    expect(getLocalEntity(state).row).toBe(before);
  });
});

describe("the two-tile desk", () => {
  const desk: WorldFixture = {
    id: "desk",
    kind: "desk",
    col: 4,
    row: 2,
    label: "Open desk",
    owner: "luke",
  };
  const world: IsoWorld = { ...LAB_TOWN, fixtures: [desk] };

  it("answers from beside its west end, out of reach of its anchor tile", () => {
    const state = createIsoState(world, { spawnCol: 2, spawnRow: 3 });
    const solid = buildWorldCollision(world);
    update(state, world, solid, keyOnce(null));
    const player = getLocalEntity(state);
    expect(Math.hypot(player.col - desk.col, player.row - desk.row)).toBeGreaterThan(
      INTERACT_TILES,
    );
    expect(state.nearbyFixture).toEqual(desk);
  });

  it("draws as its own catalog sprite", () => {
    expect(fixtureSprite(desk, createIsoState(LAB_TOWN))).toBe("desk");
  });
});

describe("fixtureSprite", () => {
  const fixture: WorldFixture = {
    id: "mailbox",
    kind: "mailbox",
    col: 5,
    row: 5,
    label: "Check mailbox",
    owner: "luke",
    color: "green",
  };

  it("follows the mailbox's color and flag state", () => {
    const state = createIsoState(LAB_TOWN);
    expect(state.mailboxFlagUp).toBe(false);
    expect(fixtureSprite(fixture, state)).toBe("mailbox_green");

    setMailboxFlag(state, true);
    expect(state.mailboxFlagUp).toBe(true);
    expect(fixtureSprite(fixture, state)).toBe("mailbox_green_flag");

    setMailboxFlag(state, false);
    expect(fixtureSprite(fixture, state)).toBe("mailbox_green");
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

describe("the Friends menu", () => {
  const ADA: WorldLink = {
    id: "friend:ada",
    label: "Ada's Island",
    place: "ada",
    spawnAt: "island-shrine",
  };
  const ZOE: WorldLink = {
    id: "friend:zoe",
    label: "Zoe's Island",
    place: "zoe",
    spawnAt: "island-shrine",
  };
  const solid = buildWorldCollision(LINKED_TOWN);

  /** The shrine menu open with its cursor on Friends, the last row. */
  function shrineMenuOnFriends(friends: FriendsList) {
    const state = createIsoState(LINKED_TOWN);
    setFriends(state, friends);
    state.nearbyMushroom = LINKED_TOWN.mushrooms[0];
    state.mode = "warp-menu";
    const entries = warpMenuEntries(state, LINKED_TOWN);
    state.menuIndex = entries.findIndex((e) => e.kind === "friends");
    return state;
  }

  it("opens a list of friends' islands, and picking one travels there like any link", () => {
    const state = shrineMenuOnFriends([ADA, ZOE]);
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    expect(state.mode).toBe("friends-menu");
    expect(state.menuIndex).toBe(0);
    expect(menuView(state, LINKED_TOWN)).toEqual({
      title: "Friends",
      entries: [
        { kind: "link", label: "Ada's Island", link: ADA },
        { kind: "link", label: "Zoe's Island", link: ZOE },
      ],
    });

    update(state, LINKED_TOWN, solid, keyOnce("ArrowDown"));
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    expect(state.mode).toBe("fading");
    expect(state.pendingLink).toEqual(ZOE);
  });

  it("closes on Cancel without going anywhere", () => {
    const state = shrineMenuOnFriends([ADA]);
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    update(state, LINKED_TOWN, solid, keyOnce("Escape"));
    expect(state.mode).toBe("overworld");
    expect(state.pendingLink).toBeNull();
  });

  it("opens from a PC too, by a tap on touch screens", () => {
    const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "/communities/test" };
    const world: IsoWorld = { ...LINKED_TOWN, pcs: [pc] };
    const state = createIsoState(world);
    setFriends(state, [ADA]);
    state.nearbyPc = pc;
    state.mode = "pc-menu";
    const row = pcMenuEntries(pc, world).findIndex((e) => e.kind === "friends");
    update(state, world, buildWorldCollision(world), pickOnce(row));
    expect(state.mode).toBe("friends-menu");
  });

  it.each([
    ["loading" as const, "Still finding your friends. Try again in a moment."],
    ["error" as const, "Couldn't reach your friends list. Try again later."],
    [[] as WorldLink[], "No friends' islands to visit yet."],
  ])("says why in a toast when the list is %o", (friends, text) => {
    const state = shrineMenuOnFriends(friends);
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld");
    expect(state.toast?.text).toBe(text);
    expect(state.pendingLink).toBeNull();
  });

  it("starts loading until the page hands the list over", () => {
    expect(createIsoState(LINKED_TOWN).friends).toBe("loading");
    expect(friendMenuEntries(createIsoState(LINKED_TOWN))).toEqual([]);
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

describe("doors open only on Enter", () => {
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

  it("never opens when the player walks into it or past it", () => {
    // Walking up-screen is what used to open a door; walking along the street
    // passes right by one. Neither may take a member inside.
    for (const keys of [["ArrowUp"], ["ArrowRight", "ArrowDown"], ["ArrowDown"], ["ArrowLeft"]]) {
      const state = createIsoState(world, { spawnCol: 5, spawnRow: 9 });
      update(state, world, solid, keysHeld()); // walking up from clear of the door
      getLocalEntity(state).row = 6; // now standing just south of it
      for (let tick = 0; tick < 20; tick++) {
        update(state, world, solid, keysHeld(...keys));
        expect(state.confirm).toBeNull();
        expect(state.mode).toBe("overworld");
      }
      expect(state.pendingDoor).toBeNull();
    }
  });

  it("opens on Enter, which is also the touch A button", () => {
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 9 });
    getLocalEntity(state).row = 6;
    update(state, world, solid, keyOnce(null));
    expect(state.nearbyDoor).toEqual(door);
    update(state, world, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld"); // confirming first
    expect(state.confirm?.action).toEqual({ kind: "door", door });
    for (let i = 0; i < CONFIRM_TICKS; i++) update(state, world, solid, keyOnce(null));
    expect(state.mode).toBe("fading");
    expect(state.pendingDoor).toEqual(door);
  });

  it("opens on Enter straight away for a player who arrived on the doorstep", () => {
    // Arriving through a door, or by ?at=<slug>, leaves you inside its reach.
    const state = createIsoState(world, { spawnCol: 5, spawnRow: 6 });
    update(state, world, solid, keyOnce("Enter"));
    for (let i = 0; i < CONFIRM_TICKS; i++) update(state, world, solid, keyOnce(null));
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

describe("the Gatherings menu", () => {
  const LANTERNS: WorldLink = {
    id: "gathering:g1",
    label: "Lantern walk (Oct 3, 7:00 PM)",
    place: "capital",
    spawnAt: "gathering-g1",
  };
  const solid = buildWorldCollision(LINKED_TOWN);

  function shrineMenu(gatherings: GatheringsList) {
    const state = createIsoState(LINKED_TOWN);
    setGatherings(state, gatherings);
    state.nearbyMushroom = LINKED_TOWN.mushrooms[0];
    state.mode = "warp-menu";
    return state;
  }

  function onGatheringsRow(state: ReturnType<typeof shrineMenu>) {
    state.menuIndex = warpMenuEntries(state, LINKED_TOWN).findIndex((e) => e.kind === "gatherings");
  }

  it("shows a Gatherings row after Friends only while there's somewhere to go", () => {
    const kinds = (g: GatheringsList) =>
      warpMenuEntries(shrineMenu(g), LINKED_TOWN).map((e) => e.kind);
    expect(kinds([LANTERNS]).slice(-2)).toEqual(["friends", "gatherings"]);
    expect(kinds([])).not.toContain("gatherings");
    expect(kinds("loading")).not.toContain("gatherings");
    // A failed load keeps the row, so choosing it can say why.
    expect(kinds("error")).toContain("gatherings");
  });

  it("opens a sub-menu whose rows travel to each mushroom like a link", () => {
    const state = shrineMenu([LANTERNS]);
    onGatheringsRow(state);
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    expect(state.mode).toBe("gatherings-menu");
    expect(menuView(state, LINKED_TOWN)).toEqual({
      title: "Gatherings",
      entries: [{ kind: "link", label: LANTERNS.label, link: LANTERNS }],
    });
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    expect(state.mode).toBe("fading");
    expect(state.pendingLink).toEqual(LANTERNS);
  });

  it("shows on a PC's menu too", () => {
    const pc: Pc = { col: 5, row: 5, id: "pc", label: "Terminal", href: "/communities/test" };
    const world: IsoWorld = { ...LINKED_TOWN, pcs: [pc] };
    const state = createIsoState(world);
    setGatherings(state, [LANTERNS]);
    state.nearbyPc = pc;
    state.mode = "pc-menu";
    expect(menuView(state, world)?.entries.at(-1)).toEqual({
      kind: "gatherings",
      label: "Gatherings",
    });
  });

  it("says why in a toast when the list failed", () => {
    const state = shrineMenu("error");
    onGatheringsRow(state);
    update(state, LINKED_TOWN, solid, keyOnce("Enter"));
    expect(state.mode).toBe("overworld");
    expect(state.toast?.text).toBe("Couldn't reach your gatherings. Try again later.");
  });
});

describe("travelling from an Event Mushroom", () => {
  it("offers a shrine's rows and commits one the way the shrine menu would", () => {
    const state = createIsoState(LINKED_TOWN);
    setGatherings(state, []);
    state.mode = "dialogue"; // paused under the card
    const entries = travelEntries(state, LINKED_TOWN);
    expect(entries).toEqual(warpMenuEntries(state, LINKED_TOWN));
    const link = entries.find((e) => e.kind === "link");
    if (!link) throw new Error("LINKED_TOWN has a link");
    chooseTravel(state, link);
    expect(state.mode).toBe("fading");
    expect(state.pendingLink).toEqual(CAPITAL_LINK);
  });

  it("opens Friends from the card as a sub-menu", () => {
    const state = createIsoState(LINKED_TOWN);
    setFriends(state, [{ id: "friend:ada", label: "Ada's Island", place: "ada" }]);
    state.mode = "dialogue";
    chooseTravel(state, { kind: "friends", label: "Friends" });
    expect(state.mode).toBe("friends-menu");
  });

  it("draws every planted mushroom with its own sprite", () => {
    const fixture: WorldFixture = {
      id: "gathering-g1",
      kind: "event_mushroom",
      col: 3,
      row: 3,
      label: "Open gathering",
      owner: "ada",
      gatheringId: "g1",
      invited: true,
    };
    expect(fixtureSprite(fixture, createIsoState(LINKED_TOWN))).toBe("event_mushroom");
  });
});
