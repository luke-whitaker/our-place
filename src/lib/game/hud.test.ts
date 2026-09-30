import { describe, it, expect } from "vitest";
import { menuWindow } from "./hud";

describe("menuWindow", () => {
  it("shows every row of a menu that fits", () => {
    expect(menuWindow(5, 4, 8)).toEqual({ start: 0, end: 5 });
  });

  it("keeps the selected row in view, centred where it can be", () => {
    expect(menuWindow(30, 0, 8)).toEqual({ start: 0, end: 8 });
    expect(menuWindow(30, 15, 8)).toEqual({ start: 11, end: 19 });
    expect(menuWindow(30, 29, 8)).toEqual({ start: 22, end: 30 });
  });

  it("always shows exactly maxRows rows of a long menu, with the selection inside", () => {
    for (let selected = 0; selected < 30; selected++) {
      const { start, end } = menuWindow(30, selected, 8);
      expect(end - start).toBe(8);
      expect(selected).toBeGreaterThanOrEqual(start);
      expect(selected).toBeLessThan(end);
    }
  });
});
