import { describe, it, expect } from "vitest";
import { computeIntent, applyMovement, createEntity } from "./iso-actor";
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
