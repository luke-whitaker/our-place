import { describe, it, expect } from "vitest";
import { buildIslandHouse } from "./island-house";
import { buildIsland, housePlace, houseWorldId, islandWorldId, ISLAND_DOOR_ID } from "./island";
import { EXIT_DOOR_ID } from "./interior";
import { parseIsoWorld } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";

const OWNER = { id: "8f2c1a2e-1b7d-4a8e-9c3f-000000000001", username: "luke", displayName: "Luke" };

function reachable(grid: SolidGrid, startCol: number, startRow: number): Set<string> {
  const seen = new Set<string>();
  const queue: [number, number][] = [[startCol, startRow]];
  while (queue.length) {
    const [c, r] = queue.pop()!;
    const key = `${c},${r}`;
    if (seen.has(key) || isSolidAt(grid, c, r)) continue;
    seen.add(key);
    queue.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
  }
  return seen;
}

describe("buildIslandHouse", () => {
  const home = buildIslandHouse({ owner: OWNER, isOwn: true });

  it("is a valid world document", () => {
    expect(() => parseIsoWorld(home)).not.toThrow();
  });

  it("is deterministic per owner, and differs between owners", () => {
    const again = buildIslandHouse({ owner: OWNER, isOwn: true });
    expect(JSON.stringify(again)).toBe(JSON.stringify(home));

    const other = buildIslandHouse({
      owner: { ...OWNER, id: "8f2c1a2e-1b7d-4a8e-9c3f-000000000002" },
      isOwn: true,
    });
    expect(other.objects).not.toEqual(home.objects);
  });

  it("opens the owner's own profile and calls the room Home, for the owner", () => {
    expect(home.pcs?.[0].href).toBe("/profile");
    expect(home.regions[0].label).toBe("Home");
    const exit = home.doors.find((d) => d.id === EXIT_DOOR_ID);
    expect(exit?.warpTo).toBe("me");
    expect(exit?.spawnAt).toBe(ISLAND_DOOR_ID);
  });

  it("opens the owner's public profile and names the room after them, for a visitor", () => {
    const visit = buildIslandHouse({ owner: OWNER, isOwn: false });
    expect(visit.pcs?.[0].href).toBe(`/profile/${OWNER.username}`);
    expect(visit.regions[0].label).toBe(`${OWNER.displayName}'s Place`);
    const exit = visit.doors.find((d) => d.id === EXIT_DOOR_ID);
    expect(exit?.warpTo).toBe(OWNER.username);
    expect(exit?.spawnAt).toBe(ISLAND_DOOR_ID);
  });

  it("saves to its own slot, distinct from the island's", () => {
    expect(home.id).toBe(houseWorldId(OWNER.id));
    expect(home.id).not.toBe(islandWorldId(OWNER.id));
  });

  it("spawns walkably and keeps the door reachable on foot for many owners", () => {
    for (let n = 0; n < 30; n++) {
      const owner = { ...OWNER, id: `owner-${n}` };
      const world = buildIslandHouse({ owner, isOwn: true });
      const grid = buildSolidGrid(world);
      expect(isSolidAt(grid, world.spawn.col, world.spawn.row)).toBe(false);

      const seen = reachable(grid, world.spawn.col, world.spawn.row);
      const door = world.doors[0];
      expect(seen.has(`${door.col},${door.row + 1}`)).toBe(true);
    }
  });

  // A house is generated deterministically from its owner's id, so furniture
  // sealing the terminal in would not be a glitch that clears on reload: that
  // member's "log on" would be permanently gone, and only theirs. propTiles()
  // keeps the desk's two open neighbours clear for exactly this reason — assert
  // it across many owners, because one fixture would not have caught it.
  it("keeps the PC reachable on foot for many owners", () => {
    for (let n = 0; n < 50; n++) {
      const owner = { ...OWNER, id: `owner-${n}` };
      const world = buildIslandHouse({ owner, isOwn: true });
      const grid = buildSolidGrid(world);
      const seen = reachable(grid, world.spawn.col, world.spawn.row);
      const pc = world.pcs![0];
      const pcAdjacent = [
        [pc.col + 1, pc.row],
        [pc.col - 1, pc.row],
        [pc.col, pc.row + 1],
        [pc.col, pc.row - 1],
      ];
      expect(pcAdjacent.some(([c, r]) => seen.has(`${c},${r}`))).toBe(true);
    }
  });

  it("never lets furniture land on the PC's desk or block the doorway approach", () => {
    // Regression guard on propTiles' exclusion zone: furniture is drawn only
    // from tiles that are neither the PC's desk nor near the doorway.
    for (let n = 0; n < 30; n++) {
      const owner = { ...OWNER, id: `owner-${n}` };
      const world = buildIslandHouse({ owner, isOwn: true });
      const door = world.doors[0];
      const pc = world.pcs![0];

      for (const obj of world.objects) {
        if (obj.kind === "computer" || obj.kind.startsWith("wall")) continue;
        expect(obj.col === pc.col && obj.row === pc.row).toBe(false);
        const nearDoor = Math.abs(obj.col - door.col) <= 1 && obj.row <= pc.row + 1;
        expect(nearDoor).toBe(false);
      }
    }
  });

  describe("the island round trip", () => {
    it("warps from the island door into the house, and back to the island door, for the owner", () => {
      const island = buildIsland({ owner: OWNER, biome: "forest", isOwn: true });
      expect(island.doors[0].warpTo).toBe(housePlace("me"));
      expect(island.doors[0].spawnAt).toBe(EXIT_DOOR_ID);

      const house = buildIslandHouse({ owner: OWNER, isOwn: true });
      const exit = house.doors.find((d) => d.id === EXIT_DOOR_ID);
      expect(exit?.spawnAt).toBe(ISLAND_DOOR_ID);
      expect(island.doors.some((d) => d.id === ISLAND_DOOR_ID)).toBe(true);
    });

    it("does the same for a visitor, using the owner's username", () => {
      const island = buildIsland({ owner: OWNER, biome: "forest", isOwn: false });
      expect(island.doors[0].warpTo).toBe(housePlace(OWNER.username));
      expect(island.doors[0].spawnAt).toBe(EXIT_DOOR_ID);
    });
  });
});
