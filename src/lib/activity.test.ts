import { describe, expect, it } from "vitest";
import { dayToDate, isCounted, metricsDay } from "@/lib/activity";

describe("metricsDay", () => {
  it("counts an evening visit on that evening's Chicago day, not the next UTC day", () => {
    // 11:30 pm in Chicago (CDT, UTC-5) is already 4:30 am the next day in UTC.
    expect(metricsDay(new Date("2026-09-30T04:30:00Z"))).toBe("2026-09-29");
    expect(metricsDay(new Date("2026-09-30T05:00:00Z"))).toBe("2026-09-30");
  });

  it("follows Chicago's standard time in winter (UTC-6)", () => {
    expect(metricsDay(new Date("2026-12-15T05:59:59Z"))).toBe("2026-12-14");
    expect(metricsDay(new Date("2026-12-15T06:00:00Z"))).toBe("2026-12-15");
  });

  it("turns a day back into the UTC-midnight Date a DATE column stores", () => {
    expect(dayToDate("2026-09-29").toISOString()).toBe("2026-09-29T00:00:00.000Z");
  });
});

describe("isCounted", () => {
  it("counts members, but not opted-out members or the world's own account", () => {
    expect(isCounted({ id: "a", username: "ann", excludeFromMetrics: false })).toBe(true);
    expect(isCounted({ id: "a", username: "ann", excludeFromMetrics: true })).toBe(false);
    expect(isCounted({ id: "o", username: "ourplace", excludeFromMetrics: false })).toBe(false);
  });
});
