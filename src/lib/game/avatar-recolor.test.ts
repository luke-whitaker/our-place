import { describe, it, expect } from "vitest";
import { buildRecolorMap, hexToRgb, isAvatarConfig } from "./avatar-recolor";
import type { AvatarConfig } from "@/lib/types";

const CONFIG: AvatarConfig = {
  hairStyle: "long",
  hairColor: "#2e8b3c",
  skinTone: "#8d5524",
  shirtColor: "#0d94c4",
  pantsColor: "#b91c1c",
  shoesColor: "#f5f5f5",
};

function pack(hex: string): number {
  const [r, g, b] = hexToRgb(hex)!;
  return (r << 16) | (g << 8) | b;
}

describe("hexToRgb", () => {
  it("parses 6-digit hex", () => {
    expect(hexToRgb("#ff8000")).toEqual([255, 128, 0]);
  });

  it("rejects malformed input", () => {
    expect(hexToRgb("ff8000")).toBeNull();
    expect(hexToRgb("#fff")).toBeNull();
    expect(hexToRgb("#zzzzzz")).toBeNull();
  });
});

describe("buildRecolorMap", () => {
  const map = buildRecolorMap(CONFIG);

  it("maps every sheet ramp color (21 total minus fixed outline/eyes)", () => {
    // 6 hair + 3 skin + 5 shirt + 2 pants + 3 shoes = 19 remapped colors
    expect(map.size).toBe(19);
  });

  it("maps each ramp's dominant (base) step to the exact target color", () => {
    expect(map.get(pack("#ecd9b8"))).toEqual(hexToRgb(CONFIG.skinTone)); // skin base
    expect(map.get(pack("#e9a5e2"))).toEqual(hexToRgb(CONFIG.shirtColor)); // shirt base
    expect(map.get(pack("#592d07"))).toEqual(hexToRgb(CONFIG.hairColor)); // hair base
  });

  it("keeps darker ramp steps darker than the base", () => {
    const base = map.get(pack("#592d07"))!; // hair base-ish step
    const shadow = map.get(pack("#280b03"))!; // hair deep shadow
    const lum = ([r, g, b]: readonly number[]) => 0.299 * r + 0.587 * g + 0.114 * b;
    expect(lum(shadow)).toBeLessThan(lum(base));
  });

  it("clamps channels at 255 for bright targets on highlight steps", () => {
    for (const [, [r, g, b]] of map) {
      expect(Math.max(r, g, b)).toBeLessThanOrEqual(255);
      expect(Math.min(r, g, b)).toBeGreaterThanOrEqual(0);
    }
  });

  it("leaves outline black and eye white out of the map", () => {
    expect(map.has(pack("#000000"))).toBe(false);
    expect(map.has(pack("#ffffff"))).toBe(false);
  });

  it("skips a part whose stored color is unparseable", () => {
    const broken = buildRecolorMap({ ...CONFIG, hairColor: "purple" });
    expect(broken.has(pack("#592d07"))).toBe(false); // hair untouched
    expect(broken.has(pack("#3654bf"))).toBe(true); // pants still remapped
  });
});

describe("isAvatarConfig", () => {
  it("accepts a full config", () => {
    expect(isAvatarConfig(CONFIG)).toBe(true);
  });

  it("rejects null, non-objects, and partial blobs", () => {
    expect(isAvatarConfig(null)).toBe(false);
    expect(isAvatarConfig("config")).toBe(false);
    expect(isAvatarConfig({ hairColor: "#2e8b3c" })).toBe(false);
  });

  it("rejects a config whose colors are not hex", () => {
    expect(isAvatarConfig({ ...CONFIG, skinTone: "tan" })).toBe(false);
  });
});
