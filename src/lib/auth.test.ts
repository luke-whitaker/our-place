import { describe, it, expect } from "vitest";
import { tokenIssuedBeforePasswordChange } from "./auth";

describe("tokenIssuedBeforePasswordChange", () => {
  const changedAt = new Date("2026-07-06T12:00:00.500Z");
  const changedAtSeconds = Math.floor(changedAt.getTime() / 1000);

  it("keeps every token valid when the password has never changed", () => {
    expect(tokenIssuedBeforePasswordChange(changedAtSeconds - 9999, null)).toBe(false);
    expect(tokenIssuedBeforePasswordChange(undefined, null)).toBe(false);
  });

  it("revokes tokens issued before the change", () => {
    expect(tokenIssuedBeforePasswordChange(changedAtSeconds - 1, changedAt)).toBe(true);
    expect(tokenIssuedBeforePasswordChange(changedAtSeconds - 86400, changedAt)).toBe(true);
  });

  it("keeps tokens issued in the same second as the change (the re-issued cookie)", () => {
    expect(tokenIssuedBeforePasswordChange(changedAtSeconds, changedAt)).toBe(false);
  });

  it("keeps tokens issued after the change", () => {
    expect(tokenIssuedBeforePasswordChange(changedAtSeconds + 1, changedAt)).toBe(false);
  });

  it("revokes a token without an issued-at claim once a change happened", () => {
    expect(tokenIssuedBeforePasswordChange(undefined, changedAt)).toBe(true);
  });
});
