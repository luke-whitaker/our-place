import { describe, it, expect, vi } from "vitest";
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
    expect(loadIsoSave("capital")).toBeNull();
    expect(() => persistIsoSave("capital", 1, 2, new Set(["a"]))).not.toThrow();
  });
});

describe("save (with a localStorage)", () => {
  function fakeStorage(): Storage & { store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
      store,
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  }

  it("keeps one slot per world and drops the pre-islands single slot", () => {
    const storage = fakeStorage();
    storage.setItem("ourplace.world.save", JSON.stringify({ version: 2, col: 1, row: 1 }));
    vi.stubGlobal("window", { localStorage: storage });
    try {
      persistIsoSave("capital", 5, 6, new Set(["capital-gate"]));
      persistIsoSave("island:u1", 2, 3, new Set());
      expect(loadIsoSave("capital")).toMatchObject({
        col: 5,
        row: 6,
        discovered: ["capital-gate"],
      });
      expect(loadIsoSave("island:u1")).toMatchObject({ col: 2, row: 3 });
      expect(loadIsoSave("island:u2")).toBeNull();
      expect(storage.store.has("ourplace.world.save")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
