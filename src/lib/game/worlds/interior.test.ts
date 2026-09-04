import { describe, it, expect } from "vitest";
import { buildInterior, EXIT_DOOR_ID, INTERIOR_GROUND, type InteriorSpec } from "./interior";
import { parseIsoWorld } from "../world-model";
import { buildSolidGrid, isSolidAt, type SolidGrid } from "../iso-collision";

const BASE_SPEC: InteriorSpec = {
  id: "test-room-inside",
  label: "Test Room",
  doorCol: 6,
  exit: { warpTo: "capital", spawnAt: "test-room" },
  pc: { col: 2, row: 2 },
  pcHref: "/communities/test-room",
};

// Default 13×13 document: floorBounds gives a floor rectangle of [1,11]×[1,11].
// The north wall sits on row 1, the west wall on column 1, leaving a 10×10
// walkable floor starting at (2,2).
const FLOOR = { c0: 1, r0: 1, c1: 11, r1: 11 };

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

describe("buildInterior", () => {
  const room = buildInterior(BASE_SPEC);

  it("is a valid world document", () => {
    expect(() => parseIsoWorld(room)).not.toThrow();
  });

  it("names the interior ground sheet", () => {
    expect(room.groundSheet).toBe(INTERIOR_GROUND);
  });

  it("keeps the floor inside the void ring walkable, and the ring itself solid", () => {
    const grid = buildSolidGrid(room);
    expect(isSolidAt(grid, 0, 0)).toBe(true);
    expect(isSolidAt(grid, room.cols - 1, room.rows - 1)).toBe(true);
    expect(isSolidAt(grid, 0, 6)).toBe(true);
    // A floor tile clear of both walls and the computer.
    expect(isSolidAt(grid, 5, 5)).toBe(false);
  });

  it("puts the north wall on the floor's north row, never on the void outside it", () => {
    const northWallCols = room.objects.filter(
      (o) => o.row === FLOOR.r0 && o.kind.startsWith("wall_col"),
    );
    expect(northWallCols.length).toBeGreaterThan(0);
    const onVoidRow = room.objects.some((o) => o.row === FLOOR.r0 - 1 && o.kind.startsWith("wall"));
    expect(onVoidRow).toBe(false);
  });

  it("puts the west wall on the floor's west column, never on the void outside it", () => {
    const westWallRows = room.objects.filter(
      (o) => o.col === FLOOR.c0 && o.kind.startsWith("wall_row"),
    );
    expect(westWallRows.length).toBeGreaterThan(0);
    const onVoidCol = room.objects.some((o) => o.col === FLOOR.c0 - 1 && o.kind.startsWith("wall"));
    expect(onVoidCol).toBe(false);
  });

  it("joins the two walls with a corner piece", () => {
    expect(room.objects).toContainEqual({ kind: "wall_corner", col: FLOOR.c0, row: FLOOR.r0 });
  });

  it("uses the door variant at the doorway and the window variant at named columns/rows", () => {
    expect(room.objects).toContainEqual({
      kind: "wall_col_door",
      col: BASE_SPEC.doorCol,
      row: FLOOR.r0,
    });

    const windowed = buildInterior({ ...BASE_SPEC, windowCols: [3], windowRows: [4] });
    expect(windowed.objects).toContainEqual({ kind: "wall_col_window", col: 3, row: FLOOR.r0 });
    expect(windowed.objects).toContainEqual({ kind: "wall_row_window", col: FLOOR.c0, row: 4 });
  });

  it("gives the exit door the spec's warp and the shared exit id", () => {
    expect(room.doors).toHaveLength(1);
    expect(room.doors[0].id).toBe(EXIT_DOOR_ID);
    expect(room.doors[0].warpTo).toBe(BASE_SPEC.exit.warpTo);
    expect(room.doors[0].spawnAt).toBe(BASE_SPEC.exit.spawnAt);
  });

  it("spawns the player walkably and lets them reach the door and the PC on foot", () => {
    const grid = buildSolidGrid(room);
    expect(isSolidAt(grid, room.spawn.col, room.spawn.row)).toBe(false);

    const seen = reachable(grid, room.spawn.col, room.spawn.row);
    const door = room.doors[0];
    // The door tile itself is a solid wall fixture; the player interacts from
    // the approach tile just south of it, one tile north of spawn.
    expect(seen.has(`${door.col},${door.row + 1}`)).toBe(true);

    // The PC's own tile holds the solid computer sprite, so the player reaches
    // it by standing on an adjacent tile instead.
    const pcAdjacent = [
      [BASE_SPEC.pc.col + 1, BASE_SPEC.pc.row],
      [BASE_SPEC.pc.col, BASE_SPEC.pc.row + 1],
    ];
    expect(pcAdjacent.some(([c, r]) => seen.has(`${c},${r}`))).toBe(true);
  });

  it("places the computer sprite on the PC's own tile, so art and interaction can't drift apart", () => {
    expect(room.objects).toContainEqual({
      kind: "computer",
      col: BASE_SPEC.pc.col,
      row: BASE_SPEC.pc.row,
    });
  });

  it("paints flagstones as dirt inside the rectangle and grass outside it, both walkable", () => {
    const flagged = buildInterior({ ...BASE_SPEC, flagstones: [3, 3, 5, 5] });
    const grid = buildSolidGrid(flagged);

    expect(flagged.terrain[3][3]).toBe("dirt");
    expect(flagged.terrain[5][5]).toBe("dirt");
    expect(isSolidAt(grid, 3, 3)).toBe(false);

    expect(flagged.terrain[8][8]).toBe("grass");
    expect(isSolidAt(grid, 8, 8)).toBe(false);
  });
});
