import { describe, it, expect } from "vitest";
import { isValidIsoPosition, loadIsoSave, persistIsoSave } from "./iso-save";
import type { SolidGrid } from "./iso-collision";

describe("isValidIsoPosition", () => {
  const grid: SolidGrid = [
    [false, true],
    [false, false],
  ];

  it("accepts an in-bounds walkable tile", () => {
    expect(isValidIsoPosition(grid, 0, 0)).toBe(true);
  });

  it("rejects a solid tile", () => {
    expect(isValidIsoPosition(grid, 1, 0)).toBe(false);
  });

  it("rejects an out-of-bounds position", () => {
    expect(isValidIsoPosition(grid, -1, 0)).toBe(false);
    expect(isValidIsoPosition(grid, 0, 5)).toBe(false);
  });
});

describe("save (no-window environment)", () => {
  it("loads null and persists without throwing when there's no localStorage", () => {
    expect(loadIsoSave()).toBeNull();
    expect(() => persistIsoSave(1, 2, new Set(["a"]))).not.toThrow();
  });
});
