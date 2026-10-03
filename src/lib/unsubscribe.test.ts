import { describe, it, expect, vi } from "vitest";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

vi.hoisted(() => {
  process.env.JWT_SECRET = "unit-test-secret";
});

const ID = "3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f";
const OTHER = "8d7c6b5a-4e3f-4a2b-9c1d-0e9f8a7b6c5d";

describe("unsubscribe tokens", () => {
  it("names the member it was made for", () => {
    expect(verifyUnsubscribeToken(signUnsubscribeToken(ID))).toBe(ID);
  });

  it("refuses an altered signature", () => {
    const token = signUnsubscribeToken(ID);
    const flipped = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(verifyUnsubscribeToken(flipped)).toBeNull();
  });

  it("refuses one member's signature on another member's id", () => {
    const mac = signUnsubscribeToken(ID).split(".")[1];
    expect(verifyUnsubscribeToken(`${OTHER}.${mac}`)).toBeNull();
  });

  it("refuses malformed tokens", () => {
    for (const token of ["", ID, `${ID}.`, `.${ID}`, `${signUnsubscribeToken(ID)}.extra`]) {
      expect(verifyUnsubscribeToken(token)).toBeNull();
    }
  });

  it("depends on the server secret", () => {
    const token = signUnsubscribeToken(ID);
    process.env.JWT_SECRET = "a-rotated-secret";
    try {
      expect(verifyUnsubscribeToken(token)).toBeNull();
    } finally {
      process.env.JWT_SECRET = "unit-test-secret";
    }
  });
});
