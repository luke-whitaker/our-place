import { describe, expect, it } from "vitest";
import { createInputManager } from "./input";

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

  it("reports a held key as down across ticks", () => {
    const input = createInputManager();
    input.press("ArrowLeft");
    input.endTick();
    expect(input.isDown("ArrowLeft")).toBe(true);
    input.release("ArrowLeft");
    expect(input.isDown("ArrowLeft")).toBe(false);
  });
});
