import { describe, it, expect } from "vitest";
import type { PollWire } from "@/lib/types";
import { pollFooter, pollHint, pollPercent } from "./poll-display";

const NOW = Date.parse("2026-10-03T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function poll(overrides: Partial<PollWire> = {}): PollWire {
  return {
    id: "p",
    multiple_choice: false,
    results_visible: "after_vote",
    closes_at: null,
    closed: false,
    has_voted: false,
    show_results: false,
    total_votes: 3,
    options: [],
    ...overrides,
  };
}

describe("pollFooter", () => {
  it("counts votes, with one vote singular", () => {
    expect(pollFooter(poll(), NOW)).toBe("3 votes");
    expect(pollFooter(poll({ total_votes: 1 }), NOW)).toBe("1 vote");
  });

  it("says how long is left, in days, hours, or under an hour", () => {
    const at = (ms: number) => new Date(NOW + ms).toISOString();
    expect(pollFooter(poll({ closes_at: at(50 * HOUR) }), NOW)).toBe("3 votes · closes in 2 days");
    expect(pollFooter(poll({ closes_at: at(5.5 * HOUR) }), NOW)).toBe(
      "3 votes · closes in 5 hours",
    );
    expect(pollFooter(poll({ closes_at: at(HOUR / 2) }), NOW)).toBe(
      "3 votes · closes in under an hour",
    );
  });

  it("says closed once it has", () => {
    const closed = poll({ closed: true, closes_at: new Date(NOW - HOUR).toISOString() });
    expect(pollFooter(closed, NOW)).toBe("3 votes · closed");
  });
});

describe("pollHint", () => {
  it("explains when results will show, and says nothing once they do", () => {
    expect(pollHint(poll())).toBe("Results show after you vote");
    expect(pollHint(poll({ results_visible: "after_close" }))).toBe(
      "Results show when the poll closes",
    );
    expect(pollHint(poll({ show_results: true }))).toBeNull();
  });
});

describe("pollPercent", () => {
  it("rounds to a whole share and never divides by zero", () => {
    expect(pollPercent(1, 3)).toBe(33);
    expect(pollPercent(2, 3)).toBe(67);
    expect(pollPercent(0, 0)).toBe(0);
  });
});
