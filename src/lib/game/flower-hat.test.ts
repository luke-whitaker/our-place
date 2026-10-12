import { describe, it, expect } from "vitest";
import { crownFromAlpha, hatPath } from "./flower-hat";

/** An alpha grid from rows of "." (clear) and "#" (opaque). */
function alphaOf(rows: string[]): { alpha: number[]; w: number; h: number } {
  const w = rows[0].length;
  return {
    alpha: rows.flatMap((r) => [...r].map((c) => (c === "#" ? 255 : 0))),
    w,
    h: rows.length,
  };
}

describe("crownFromAlpha", () => {
  it("finds the top of the head and centres on the crown's width", () => {
    const { alpha, w, h } = alphaOf(["........", "...##...", "..####..", "..####..", "...##..."]);
    expect(crownFromAlpha(alpha, w, h)).toEqual({ x: 4, y: 1 });
  });

  it("follows a head drawn to one side, as a turned facing is", () => {
    const { alpha, w, h } = alphaOf(["......", "....##", "...###", "...###"]);
    expect(crownFromAlpha(alpha, w, h)).toEqual({ x: 5, y: 1 });
  });

  it("ignores faint noise from privacy-hardened canvas reads", () => {
    const { alpha, w, h } = alphaOf(["....", ".##.", ".##."]);
    alpha[0] = 3;
    expect(crownFromAlpha(alpha, w, h)).toEqual({ x: 2, y: 1 });
  });

  it("answers null for an empty frame", () => {
    const { alpha, w, h } = alphaOf(["...", "..."]);
    expect(crownFromAlpha(alpha, w, h)).toBeNull();
  });
});

describe("hatPath", () => {
  it("names the hat art for a flower's color", () => {
    expect(hatPath("pink")).toBe("/world/objects/flower_hat_pink.png");
  });

  it("names the hat art for a Keepsake Mushroom", () => {
    expect(hatPath("keepsake_ourplace")).toBe("/world/objects/keepsake_hat_ourplace.png");
    expect(hatPath("keepsake_red")).toBe("/world/objects/keepsake_hat_red.png");
  });
});
