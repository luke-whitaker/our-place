import { describe, it, expect } from "vitest";
import {
  buildIsland,
  islandWorldId,
  ISLAND_DOOR_ID,
  ISLAND_SHRINE_ID,
  ISLAND_MAILBOX_ID,
} from "./island";
import { parseIsoWorld } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";
import { INTERACT_TILES } from "../iso-engine";
import { TINT_PRESETS } from "../terrain-tint";
import { MAILBOX_COLORS } from "../mailbox-colors";

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

describe("buildIsland", () => {
  const home = buildIsland({ owner: OWNER, biome: "autumn", mailboxColor: "green", isOwn: true });

  it("is a valid world document carrying the owner's biome and id", () => {
    expect(() => parseIsoWorld(home)).not.toThrow();
    expect(home.id).toBe(islandWorldId(OWNER.id));
    expect(home.tint).toBe("autumn");
  });

  it("is deterministic per owner and different between owners", () => {
    const again = buildIsland({
      owner: OWNER,
      biome: "autumn",
      mailboxColor: "green",
      isOwn: true,
    });
    expect(again).toEqual(home);
    const other = buildIsland({
      owner: { ...OWNER, id: "8f2c1a2e-1b7d-4a8e-9c3f-000000000002" },
      biome: "autumn",
      mailboxColor: "green",
      isOwn: true,
    });
    expect(other.terrain).not.toEqual(home.terrain);
  });

  it("starts bare: only the cottage and the shrine, for the member to fill", () => {
    expect(home.objects.map((o) => o.kind).sort()).toEqual(["cottage_blue", "mushroom"]);
  });

  it("has one cottage door, one shrine, and the way back to the Capital gate", () => {
    expect(home.doors.map((d) => d.id)).toEqual([ISLAND_DOOR_ID]);
    expect(home.mushrooms.map((m) => m.id)).toEqual([ISLAND_SHRINE_ID]);
    expect(home.links).toEqual([
      { id: "capital", label: "The Capital", place: "capital", spawnAt: "capital-gate" },
    ]);
    expect(home.objects.filter((o) => o.kind === "mushroom")).toHaveLength(1);
    expect(home.regions[0].label).toBe("Home");
  });

  it("names a visitor's view after the owner and offers them Home", () => {
    const visit = buildIsland({ owner: OWNER, biome: "snow", mailboxColor: "green", isOwn: false });
    expect(visit.doors[0].label).toBe("Luke's Place");
    expect(visit.regions[0].label).toBe("Luke's Island");
    expect(visit.links.map((l) => l.place)).toEqual(["capital", "me"]);
  });

  it("places a mailbox beside the garden path, on grass, out of the door's and shrine's own reach", () => {
    expect(home.fixtures?.map((f) => f.id)).toEqual([ISLAND_MAILBOX_ID]);
    const mailbox = home.fixtures![0];
    expect(mailbox.kind).toBe("mailbox");
    expect(mailbox.owner).toBe(OWNER.username);
    expect(mailbox.label).toBe("Check mailbox");
    expect(mailbox.color).toBe("green");
    expect(home.terrain[mailbox.row][mailbox.col]).toBe("grass");

    const door = home.doors[0];
    const shrine = home.mushrooms[0];
    expect(Math.hypot(mailbox.col - door.col, mailbox.row - door.row)).toBeGreaterThanOrEqual(
      INTERACT_TILES,
    );
    expect(Math.hypot(mailbox.col - shrine.col, mailbox.row - shrine.row)).toBeGreaterThanOrEqual(
      INTERACT_TILES,
    );
  });

  it("labels the mailbox for a visitor instead of the owner", () => {
    const visit = buildIsland({
      owner: OWNER,
      biome: "autumn",
      mailboxColor: "blue",
      isOwn: false,
    });
    expect(visit.fixtures![0].label).toBe("Leave a letter");
    expect(visit.fixtures![0].owner).toBe(OWNER.username);
    expect(visit.fixtures![0].color).toBe("blue");
  });

  it("floats: every border tile is void and the void is solid", () => {
    const grid = buildSolidGrid(home);
    for (let i = 0; i < home.cols; i++) {
      expect(home.terrain[0][i]).toBe("void");
      expect(home.terrain[home.rows - 1][i]).toBe("void");
      expect(home.terrain[i][0]).toBe("void");
      expect(home.terrain[i][home.cols - 1]).toBe("void");
      expect(isSolidAt(grid, 0, i)).toBe(true);
    }
  });

  it("keeps the door, shrine, and mailbox reachable from spawn for many owners and every biome", () => {
    for (let n = 0; n < 60; n++) {
      const biome = TINT_PRESETS[n % TINT_PRESETS.length];
      const world = buildIsland({
        owner: { ...OWNER, id: `owner-${n}-${Math.imul(n, 2654435761) >>> 0}` },
        biome,
        mailboxColor: MAILBOX_COLORS[n % MAILBOX_COLORS.length],
        isOwn: true,
      });
      const grid = buildSolidGrid(world);
      expect(isSolidAt(grid, world.spawn.col, world.spawn.row)).toBe(false);
      const seen = reachable(grid, world.spawn.col, world.spawn.row);
      const door = world.doors[0];
      expect(seen.has(`${door.col},${door.row}`)).toBe(true);
      const shrine = world.mushrooms[0];
      expect(seen.has(`${shrine.col},${shrine.row - 1}`)).toBe(true);

      // Nothing stands on the mailbox tile, and the garden path tile beside
      // it, within the mailbox's reach, stays open and reachable, the same as
      // the door and shrine above.
      const mailbox = world.fixtures![0];
      expect(world.objects.some((o) => o.col === mailbox.col && o.row === mailbox.row)).toBe(false);
      const approach = { col: mailbox.col + 1, row: mailbox.row }; // the garden path
      expect(Math.hypot(mailbox.col - approach.col, mailbox.row - approach.row)).toBeLessThan(
        INTERACT_TILES,
      );
      expect(isSolidAt(grid, approach.col, approach.row)).toBe(false);
      expect(seen.has(`${approach.col},${approach.row}`)).toBe(true);
    }
  });
});
