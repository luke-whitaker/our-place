import { describe, it, expect } from "vitest";
import { buildRecolorMap, hexToRgb, isAvatarConfig, recolorPixels } from "./avatar-recolor";
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

  it("maps every sheet ramp color (all 20 except outline black and white)", () => {
    // 5 hair + 4 skin + 4 shirt + 2 pants + 3 shoes = 18 remapped colors
    expect(map.size).toBe(18);
  });

  it("shades the neck, ears, and hands from the skin tone, not the hair", () => {
    // #b56732 sits only on skin. In the hair ramp it painted necks hair-colored.
    const neck = map.get(pack("#b56732"))!;
    const skin = hexToRgb(CONFIG.skinTone)!;
    const ratio = neck[0] / skin[0];
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.7);
    expect(neck[1] / skin[1]).toBeCloseTo(ratio, 1);
    expect(neck[2] / skin[2]).toBeCloseTo(ratio, 1);
  });

  it("keeps the old blush color off every ramp", () => {
    // #eabcd6 was painted only on faces (now painted out of our sheets). It was
    // once listed in the shirt ramp, which made cheeks follow the shirt color.
    expect(map.has(pack("#eabcd6"))).toBe(false);
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

describe("recolorPixels", () => {
  const map = buildRecolorMap(CONFIG);

  /** RGBA pixels from [r, g, b, a] tuples. */
  function pixels(...rgba: number[][]): Uint8ClampedArray {
    return new Uint8ClampedArray(rgba.flat());
  }

  it("recolors an exact sheet color", () => {
    const px = pixels([...hexToRgb("#e9a5e2")!, 255]);
    expect(recolorPixels(px, map)).toBe(0);
    expect([...px]).toEqual([...hexToRgb(CONFIG.shirtColor)!, 255]);
  });

  it("recolors a pixel that canvas noise nudged one step off", () => {
    // Firefox's anti-fingerprinting noise: the shirt pink read back as #e8a5e3.
    // An exact lookup missed these, leaving pink flecks on every shirt.
    const px = pixels([0xe8, 0xa5, 0xe3, 255], [0x37, 0x54, 0xbf, 254]);
    expect(recolorPixels(px, map)).toBe(0);
    expect([...px]).toEqual([
      ...hexToRgb(CONFIG.shirtColor)!,
      255,
      ...hexToRgb(CONFIG.pantsColor)!,
      255,
    ]);
  });

  it("writes noisy fixed colors back clean", () => {
    const px = pixels([1, 0, 1, 255]);
    recolorPixels(px, map);
    expect([...px]).toEqual([0, 0, 0, 255]);
  });

  it("clears a transparent pixel that noise lifted to alpha 1", () => {
    const px = pixels([37, 148, 22, 1]);
    expect(recolorPixels(px, map)).toBe(0);
    expect([...px]).toEqual([0, 0, 0, 0]);
  });

  it("counts, and leaves alone, an opaque pixel far from every sheet color", () => {
    const px = pixels([0, 200, 0, 255]);
    expect(recolorPixels(px, map)).toBe(1);
    expect([...px]).toEqual([0, 200, 0, 255]);
  });
});
