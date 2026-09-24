import { afterEach, describe, expect, it } from "vitest";
import { createInputManager } from "./input";

/** A keydown as the browser sends it, including the auto-repeat flag. */
function keydown(code: string, repeat = false): Event {
  return Object.assign(new Event("keydown"), { code, repeat });
}

describe("createInputManager", () => {
  it("still reports a tap released before the tick read it", () => {
    const input = createInputManager();
    input.press("Enter");
    input.release("Enter");
    expect(input.consume("Enter")).toBe(true);
    expect(input.consume("Enter")).toBe(false);
  });

  it("forgets an unconsumed tap at the end of the tick", () => {
    const input = createInputManager();
    input.press("Enter");
    input.release("Enter");
    input.endTick();
    // Nothing was in reach when it happened; it must not fire at the next door.
    expect(input.consume("Enter")).toBe(false);
  });

  it("consumes a held key once until it is pressed again", () => {
    const input = createInputManager();
    input.press("ArrowUp");
    expect(input.consume("ArrowUp")).toBe(true);
    input.endTick();
    expect(input.consume("ArrowUp")).toBe(false);
    input.press("ArrowUp");
    expect(input.consume("ArrowUp")).toBe(true);
  });

  describe("with keyboard listeners attached", () => {
    const g = globalThis as { window?: EventTarget };
    const saved = g.window;
    afterEach(() => {
      g.window = saved;
    });

    it("ignores Enter's auto-repeat, so holding it never picks a menu row", () => {
      g.window = new EventTarget();
      const input = createInputManager();
      const detach = input.attach();
      g.window.dispatchEvent(keydown("Enter"));
      expect(input.consume("Enter")).toBe(true);
      input.endTick();
      g.window.dispatchEvent(keydown("Enter", true));
      expect(input.consume("Enter")).toBe(false);
      detach();
    });

    it("leaves Enter and Space on a focused link to the link, but still walks", () => {
      // A keydown's target is the focused element. Stand the window in for a
      // focused link by giving it the `matches` a link would answer true to.
      g.window = Object.assign(new EventTarget(), { matches: () => true });
      const input = createInputManager();
      const detach = input.attach();
      g.window.dispatchEvent(keydown("Enter"));
      g.window.dispatchEvent(keydown("Space"));
      g.window.dispatchEvent(keydown("ArrowUp"));
      expect(input.consume("Enter")).toBe(false);
      expect(input.consume("Space")).toBe(false);
      expect(input.consume("ArrowUp")).toBe(true);
      detach();
    });

    it("still lets a held arrow repeat, so it scrolls a menu", () => {
      g.window = new EventTarget();
      const input = createInputManager();
      const detach = input.attach();
      g.window.dispatchEvent(keydown("ArrowDown"));
      expect(input.consume("ArrowDown")).toBe(true);
      input.endTick();
      g.window.dispatchEvent(keydown("ArrowDown", true));
      expect(input.consume("ArrowDown")).toBe(true);
      detach();
    });
  });

  it("reports a held key as down across ticks", () => {
    const input = createInputManager();
    input.press("ArrowLeft");
    input.endTick();
    expect(input.isDown("ArrowLeft")).toBe(true);
    input.release("ArrowLeft");
    expect(input.isDown("ArrowLeft")).toBe(false);
  });
});
