import { describe, expect, it } from "vitest";
import { addMonths, weekStarts } from "@/lib/metrics";

describe("weekStarts", () => {
  it("starts each week on Monday, newest first", () => {
    expect(weekStarts("2026-09-30", 3)).toEqual(["2026-09-28", "2026-09-21", "2026-09-14"]);
  });

  it("keeps Sunday in the week that began the Monday before", () => {
    expect(weekStarts("2026-10-04", 1)).toEqual(["2026-09-28"]);
    expect(weekStarts("2026-09-28", 1)).toEqual(["2026-09-28"]);
  });
});

describe("addMonths", () => {
  it("carries across the year", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", 0)).toBe("2026-01");
  });
});
