import { describe, it, expect } from "vitest";
import { KEEPSAKE_REACH_TILES, keepsakesInReach, nextKeepsakeColor } from "./keepsake";

describe("nextKeepsakeColor", () => {
  it("flips a coin for the first keepsake", () => {
    expect(nextKeepsakeColor(null, () => 0.1)).toBe("ourplace");
    expect(nextKeepsakeColor(null, () => 0.9)).toBe("red");
  });

  it("alternates from the one before, whatever the coin says", () => {
    expect(nextKeepsakeColor("ourplace", () => 0.1)).toBe("red");
    expect(nextKeepsakeColor("red", () => 0.9)).toBe("ourplace");
  });

  it("gives host, then guests, alternating colors", () => {
    const colors: string[] = [];
    let previous: string | null = null;
    for (let i = 0; i < 5; i++) {
      previous = nextKeepsakeColor(previous, () => 0.9);
      colors.push(previous);
    }
    expect(colors).toEqual(["red", "ourplace", "red", "ourplace", "red"]);
  });
});

describe("keepsakesInReach", () => {
  const mushroom = { gatheringId: "g1", col: 10, row: 10, invited: true };

  const none = new Map<string, number>();

  it("finds a mushroom within reach", () => {
    expect(keepsakesInReach([mushroom], 10 + KEEPSAKE_REACH_TILES, 10, none, 0)).toEqual(["g1"]);
  });

  it("ignores one out of reach", () => {
    expect(keepsakesInReach([mushroom], 10 + KEEPSAKE_REACH_TILES + 1, 10, none, 0)).toEqual([]);
  });

  it("ignores a gathering the player can't open", () => {
    expect(keepsakesInReach([{ ...mushroom, invited: false }], 10, 10, none, 0)).toEqual([]);
  });

  it("waits until a gathering already asked about may be asked again", () => {
    const settled = new Map([["g1", Infinity]]);
    expect(keepsakesInReach([mushroom], 10, 10, settled, 1e12)).toEqual([]);
    const retry = new Map([["g1", 5000]]);
    expect(keepsakesInReach([mushroom], 10, 10, retry, 4999)).toEqual([]);
    expect(keepsakesInReach([mushroom], 10, 10, retry, 5000)).toEqual(["g1"]);
  });
});
