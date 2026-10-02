import { describe, it, expect } from "vitest";
import { CAPITAL } from "./worlds/world-map";
import { MAPPED_WORLDS, mappedWorld } from "./mapped-worlds";

describe("MAPPED_WORLDS", () => {
  it("matches the grown Capital's size and shrines", () => {
    const capital = MAPPED_WORLDS.capital;
    expect(capital.cols).toBe(CAPITAL.cols);
    expect(capital.rows).toBe(CAPITAL.rows);
    expect([...capital.shrines].sort()).toEqual(CAPITAL.mushrooms.map((m) => m.id).sort());
  });

  it("knows only real worlds, never an inherited property", () => {
    expect(mappedWorld("capital")?.grid.bytes).toBe(161);
    expect(mappedWorld("constructor")).toBeNull();
    expect(mappedWorld("me-inside")).toBeNull();
  });
});
