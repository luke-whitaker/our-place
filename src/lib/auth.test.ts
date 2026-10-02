import { describe, it, expect, vi } from "vitest";
import jwt from "jsonwebtoken";
import { hashResetCode, signToken, tokenIssuedBeforePasswordChange, verifyToken } from "./auth";

// auth.ts reads the secret at import, so set it before the imports above run.
const SECRET = vi.hoisted(() => {
  process.env.JWT_SECRET = "unit-test-secret";
  return "unit-test-secret";
});

describe("JWT algorithm", () => {
  const payload = { userId: "u1", username: "jane", is_verified: 1, role: "user" };

  it("verifies the tokens it signs", () => {
    expect(verifyToken(signToken(payload))?.userId).toBe("u1");
  });

  it("refuses a token signed with another algorithm, even with the right secret", () => {
    expect(verifyToken(jwt.sign(payload, SECRET, { algorithm: "HS512" }))).toBeNull();
  });

  it("refuses an unsigned token", () => {
    expect(verifyToken(jwt.sign(payload, "", { algorithm: "none" }))).toBeNull();
  });
});

describe("hashResetCode", () => {
  it("never stores the code itself and is stable for the same code", () => {
    expect(hashResetCode("123456")).not.toContain("123456");
    expect(hashResetCode("123456")).toBe(hashResetCode("123456"));
    expect(hashResetCode("123456")).not.toBe(hashResetCode("123457"));
  });
});

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
