import { describe, it, expect } from "vitest";
import { ITEM_CATALOG, MAX_STACK, itemName, planStackAdd } from "@/lib/items";
import { dropOne, upsertItem } from "@/components/ItemSlotGrid";
import type { PocketItem } from "@/lib/types";

describe("ITEM_CATALOG stacking", () => {
  it("stacks seeds and nothing else for now", () => {
    const stackable = Object.entries(ITEM_CATALOG)
      .filter(([, entry]) => entry.stackable)
      .map(([kind]) => kind);
    expect(stackable).toEqual(["seed"]);
  });
});

describe("itemName", () => {
  it("counts a stack and names a single one plainly", () => {
    expect(itemName({ kind: "seed", quantity: 5 })).toBe("5 seeds");
    expect(itemName({ kind: "seed", quantity: 1 })).toBe("Seed");
    expect(itemName({ kind: "seed" })).toBe("Seed");
    expect(itemName({ kind: "flower", color: "pink", quantity: 1 })).toBe("Pink flower");
  });
});

describe("planStackAdd", () => {
  it("tops up the existing stack before taking a slot", () => {
    expect(planStackAdd([{ id: "a", quantity: 3 }], [4, 5], 5)).toEqual({
      topUps: [{ id: "a", add: 5 }],
      newStacks: [],
    });
  });

  it("starts a new stack in the lowest free slot when there is none", () => {
    expect(planStackAdd([], [2, 7], 5)).toEqual({
      topUps: [],
      newStacks: [{ slot: 2, quantity: 5 }],
    });
  });

  it("fills a stack to MAX_STACK and spills the rest into a free slot", () => {
    expect(planStackAdd([{ id: "a", quantity: MAX_STACK - 2 }], [0], 5)).toEqual({
      topUps: [{ id: "a", add: 2 }],
      newStacks: [{ slot: 0, quantity: 3 }],
    });
  });

  it("refuses, adding nothing, when they don't all fit", () => {
    expect(planStackAdd([{ id: "a", quantity: MAX_STACK - 1 }], [], 2)).toBeNull();
    expect(planStackAdd([], [], 1)).toBeNull();
  });

  it("refuses a count that isn't a positive whole number", () => {
    expect(planStackAdd([], [0], 0)).toBeNull();
    expect(planStackAdd([], [0], -1)).toBeNull();
    expect(planStackAdd([], [0], 1.5)).toBeNull();
  });

  it("never plans a stack past MAX_STACK", () => {
    const plan = planStackAdd([], [0, 1, 2], MAX_STACK * 2 + 1);
    expect(plan?.newStacks.map((s) => s.quantity)).toEqual([MAX_STACK, MAX_STACK, 1]);
  });
});

function seed(id: string, quantity: number): PocketItem {
  return {
    id,
    kind: "seed",
    slot: 0,
    body: null,
    from: null,
    placed_at: null,
    gathering_id: null,
    color: null,
    quantity,
  };
}

describe("dropOne and upsertItem", () => {
  it("shrinks a stack by one and removes a single item", () => {
    expect(dropOne([seed("a", 5)], "a")).toEqual([seed("a", 4)]);
    expect(dropOne([seed("a", 1), seed("b", 2)], "a")).toEqual([seed("b", 2)]);
  });

  it("replaces a merged stack by id instead of showing it twice", () => {
    expect(upsertItem([seed("a", 3)], seed("a", 8))).toEqual([seed("a", 8)]);
    expect(upsertItem([seed("a", 3)], seed("b", 1))).toEqual([seed("a", 3), seed("b", 1)]);
  });
});
