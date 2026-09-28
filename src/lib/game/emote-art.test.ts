import { describe, expect, it } from "vitest";
import { EMOTES } from "@/lib/types";
import { bubbleArt } from "./emote-art";

describe("bubbleArt", () => {
  it("builds a bubble for every emote, sized to its icon plus padding and a tail", () => {
    for (const emote of EMOTES) {
      const art = bubbleArt(emote);
      expect(art.pixels).toHaveLength(art.w * art.h);
      // 10-row icons: 2 px padding and a 1 px outline each side, then a 2 px tail.
      expect(art.h).toBe(10 + 2 * 2 + 2 + 2);
    }
  });

  it("clips the bubble's corners and points the tail at the head", () => {
    const art = bubbleArt("heart");
    expect(art.pixels[0]).toBeNull();
    const tip = art.pixels[(art.h - 1) * art.w + Math.floor(art.w / 2)];
    expect(tip).toBe("#2a2230");
    // The bottom row is only the tail's point, three pixels wide.
    const bottomRow = art.pixels.slice((art.h - 1) * art.w);
    expect(bottomRow.filter(Boolean)).toHaveLength(3);
  });

  it("paints every icon pixel with a known color", () => {
    for (const emote of EMOTES) {
      const art = bubbleArt(emote);
      for (const c of art.pixels) expect(c === null || /^#[0-9a-f]{6}$/.test(c)).toBe(true);
    }
  });
});
