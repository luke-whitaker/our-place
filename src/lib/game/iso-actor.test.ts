import { describe, it, expect } from "vitest";
import { computeIntent, applyMovement, createEntity, facingToward } from "./iso-actor";
import type { SolidGrid } from "./iso-collision";

function openGrid(cols: number, rows: number): SolidGrid {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

function stubInput(held: string[]) {
  return { isDown: (code: string) => held.includes(code) };
}

describe("computeIntent", () => {
  it("maps WASD to a screen-space direction", () => {
    expect(computeIntent(stubInput(["KeyW"]))).toEqual({ sx: 0, sy: -1 });
    expect(computeIntent(stubInput(["KeyD"]))).toEqual({ sx: 1, sy: 0 });
    expect(computeIntent(stubInput(["KeyW", "KeyD"]))).toEqual({ sx: 1, sy: -1 });
  });

  it("treats arrows and WASD the same", () => {
    expect(computeIntent(stubInput(["ArrowLeft"]))).toEqual({ sx: -1, sy: 0 });
  });

  it("returns no movement when nothing is held", () => {
    expect(computeIntent(stubInput([]))).toEqual({ sx: 0, sy: 0 });
  });
});

describe("applyMovement", () => {
  it("stops the entity on a zero intent", () => {
    const entity = createEntity("local", 1, 1);
    entity.moving = true;
    applyMovement(openGrid(3, 3), entity, { sx: 0, sy: 0 });
    expect(entity.moving).toBe(false);
    expect(entity.col).toBe(1);
    expect(entity.row).toBe(1);
  });

  it("moves in world space toward the screen direction and faces it", () => {
    const entity = createEntity("local", 5, 5);
    applyMovement(openGrid(11, 11), entity, { sx: 1, sy: 0 });
    // Screen-east increases col and decreases row in the 2:1 projection.
    expect(entity.col).toBeGreaterThan(5);
    expect(entity.row).toBeLessThan(5);
    expect(entity.dir).toBe("E");
    expect(entity.moving).toBe(true);
  });

  it("cannot cross into solid tiles when boxed in", () => {
    const grid = Array.from({ length: 11 }, () => Array.from({ length: 11 }, () => true));
    grid[5][5] = false; // only the starting tile is open
    const entity = createEntity("local", 5, 5);
    applyMovement(grid, entity, { sx: 1, sy: 0 });
    expect(Math.floor(entity.col)).toBe(5);
    expect(Math.floor(entity.row)).toBe(5);
    expect(entity.dir).toBe("E"); // still turns to face the attempted direction
  });
});

describe("facingToward", () => {
  it("returns S when the two tiles coincide", () => {
    expect(facingToward({ col: 5, row: 5 }, { col: 5, row: 5 })).toBe("S");
  });

  it("faces a target one column ahead as the down-right screen direction", () => {
    // The col axis alone projects to screen (+16,+8) — down-right, the same
    // "SE" a player walking that way would face (see iso.ts's tileToScreen).
    expect(facingToward({ col: 5, row: 5 }, { col: 6, row: 5 })).toBe("SE");
  });

  it("faces a target one row ahead as the down-left screen direction", () => {
    expect(facingToward({ col: 5, row: 5 }, { col: 5, row: 6 })).toBe("SW");
  });

  it("is symmetric: facing away from a target is the opposite of facing toward it", () => {
    const from = { col: 3, row: 8 };
    const to = { col: 9, row: 2 };
    const opposite: Record<string, string> = {
      S: "N",
      SE: "NW",
      E: "W",
      NE: "SW",
      N: "S",
      NW: "SE",
      W: "E",
      SW: "NE",
    };
    expect(facingToward(from, to)).toBe(opposite[facingToward(to, from)]);
  });
});
