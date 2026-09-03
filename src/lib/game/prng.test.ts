import { describe, it, expect } from "vitest";
import { createRng, hashString } from "./prng";

describe("hashString", () => {
  it("is stable and sensitive to every character", () => {
    expect(hashString("abc")).toBe(hashString("abc"));
    expect(hashString("abc")).not.toBe(hashString("abd"));
    expect(hashString("")).toBe(0x811c9dc5);
  });
});

describe("createRng", () => {
  it("replays the same stream for the same seed", () => {
    const a = createRng("user-1");
    const b = createRng("user-1");
    const streamA = Array.from({ length: 20 }, () => a.next());
    const streamB = Array.from({ length: 20 }, () => b.next());
    expect(streamA).toEqual(streamB);
    expect(createRng("user-2").next()).not.toBe(createRng("user-1").next());
  });

  it("keeps int and pick inside their ranges", () => {
    const rng = createRng("bounds");
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
      expect(["x", "y"]).toContain(rng.pick(["x", "y"]));
    }
  });
});
