import { describe, it, expect } from "vitest";
import { INTERIORS, INTERIOR_SLUGS, interiorPlace, houseNetworkLinks, PC_ID } from "./interiors";
import { EXIT_DOOR_ID } from "./interior";
import { CAPITAL } from "./capital";
import { parseIsoWorld } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";

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

describe("INTERIORS", () => {
  it("is a valid world document for every room, keyed by its own place value", () => {
    for (const [key, world] of Object.entries(INTERIORS)) {
      expect(() => parseIsoWorld(world)).not.toThrow();
      expect(world.id).toBe(key);
      const slug = INTERIOR_SLUGS.find((s) => interiorPlace(s) === key);
      expect(slug).toBeDefined();
    }
  });

  it("has exactly nine rooms, matching the Capital's doors so no door lacks a room", () => {
    expect(INTERIOR_SLUGS).toHaveLength(9);
    expect(Object.keys(INTERIORS)).toHaveLength(9);
    expect(new Set(INTERIOR_SLUGS)).toEqual(new Set(CAPITAL.doors.map((d) => d.id)));
  });

  it("closes the round trip between every Capital door and its room's exit", () => {
    for (const slug of INTERIOR_SLUGS) {
      const door = CAPITAL.doors.find((d) => d.id === slug);
      expect(door).toBeDefined();
      expect(door!.warpTo).toBe(interiorPlace(slug));
      expect(door!.spawnAt).toBe(EXIT_DOOR_ID);

      const room = INTERIORS[interiorPlace(slug)];
      const exit = room.doors.find((d) => d.id === EXIT_DOOR_ID);
      expect(exit).toBeDefined();
      expect(exit!.warpTo).toBe("capital");
      expect(exit!.spawnAt).toBe(slug);

      // Each side really names something that exists on the other.
      expect(CAPITAL.doors.some((d) => d.id === slug)).toBe(true);
      expect(room.doors.some((d) => d.id === EXIT_DOOR_ID)).toBe(true);
    }
  });

  it("spawns walkably and lets the player reach every door, PC, and region on foot", () => {
    for (const world of Object.values(INTERIORS)) {
      const grid = buildSolidGrid(world);
      expect(isSolidAt(grid, world.spawn.col, world.spawn.row)).toBe(false);
      const seen = reachable(grid, world.spawn.col, world.spawn.row);

      for (const door of world.doors) {
        const approach = [
          [door.col, door.row + 1],
          [door.col, door.row - 1],
          [door.col + 1, door.row],
          [door.col - 1, door.row],
        ];
        expect(approach.some(([c, r]) => seen.has(`${c},${r}`))).toBe(true);
      }

      // Two open sides, not one. Every PC sits in a corner, so its north and
      // west neighbours are the room's own back walls and only east and south
      // can ever be free. One free side means something is standing in the
      // other, which is how four rooms once boxed their terminal in behind
      // furniture while still passing a "some approach is reachable" check.
      for (const pc of world.pcs ?? []) {
        const approach = [
          [pc.col + 1, pc.row],
          [pc.col - 1, pc.row],
          [pc.col, pc.row + 1],
          [pc.col, pc.row - 1],
        ];
        const open = approach.filter(([c, r]) => seen.has(`${c},${r}`));
        expect(open.length).toBeGreaterThanOrEqual(2);
      }

      for (const region of world.regions) {
        const { col, row, w, h } = region.bounds;
        let found = false;
        for (let r = row; r < row + h && !found; r++) {
          for (let c = col; c < col + w && !found; c++) {
            if (seen.has(`${c},${r}`)) found = true;
          }
        }
        expect(found).toBe(true);
      }
    }
  });

  it("gives every room's PC an href back to its own community", () => {
    for (const slug of INTERIOR_SLUGS) {
      const room = INTERIORS[interiorPlace(slug)];
      expect(room.pcs).toHaveLength(1);
      expect(room.pcs![0].href).toBe(`/communities/${slug}`);
    }
  });

  it("wires each room's terminal network to the other eight rooms plus home", () => {
    for (const slug of INTERIOR_SLUGS) {
      const room = INTERIORS[interiorPlace(slug)];
      const ownPlace = interiorPlace(slug);
      const otherSlugs = INTERIOR_SLUGS.filter((s) => s !== slug);

      expect(room.links).toHaveLength(otherSlugs.length + 1); // + home

      for (const link of room.links) {
        expect(link.place).not.toBe(ownPlace);
        expect(link.spawnAt).toBe(PC_ID);
      }

      const home = room.links.find((l) => l.id === "home");
      expect(home?.place).toBe("me-inside");

      const rest = room.links.filter((l) => l.id !== "home").map((l) => l.place);
      expect(new Set(rest)).toEqual(new Set(otherSlugs.map((s) => interiorPlace(s))));
      for (const place of rest) {
        expect(place in INTERIORS).toBe(true);
      }
    }
  });

  it("houseNetworkLinks lists all nine buildings and nothing else", () => {
    const links = houseNetworkLinks();
    expect(links).toHaveLength(9);
    expect(new Set(links.map((l) => l.place))).toEqual(
      new Set(INTERIOR_SLUGS.map((s) => interiorPlace(s))),
    );
    for (const link of links) {
      expect(link.spawnAt).toBe(PC_ID);
    }
  });
});
