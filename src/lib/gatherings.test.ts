import { describe, it, expect } from "vitest";
import { invitationLetterBody, START_GRACE_MS, timesProblem } from "./gatherings";

const NOW = new Date("2026-10-01T15:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);

describe("timesProblem", () => {
  it("accepts a start a few minutes ago, so a form filled in for now still works", () => {
    const start = new Date(NOW.getTime() - START_GRACE_MS + 1000);
    expect(timesProblem(start, at(2), NOW)).toBeNull();
  });

  it("refuses a past start, an end before the start, and more than 7 days", () => {
    expect(timesProblem(at(-1), at(2), NOW)).toBe("That start time has passed.");
    expect(timesProblem(at(2), at(2), NOW)).toBe("The end has to come after the start.");
    expect(timesProblem(at(2), at(2 + 7 * 24 + 1), NOW)).toBe("A gathering can last up to 7 days.");
  });

  it("refuses planning more than a year ahead", () => {
    expect(timesProblem(at(24 * 400), at(24 * 400 + 1), NOW)).toBe(
      "Gatherings can be planned up to a year ahead.",
    );
  });
});

describe("invitationLetterBody", () => {
  it("names the gathering and its Chicago time, and nothing else", () => {
    expect(invitationLetterBody("Picnic", new Date("2026-10-03T17:00:00Z"))).toBe(
      "You're invited to Picnic, Saturday, October 3 at 12:00 PM CDT. Open the invitation to answer.",
    );
  });
});
