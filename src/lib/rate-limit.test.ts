import { describe, it, expect } from "vitest";
import { getClientIp } from "./rate-limit";

function req(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/test", { headers });
}

// These assume the default TRUSTED_PROXY_HOPS = 1 (Railway's single edge).
describe("getClientIp", () => {
  it("returns the only forwarded entry when the chain is honest", () => {
    expect(getClientIp(req({ "x-forwarded-for": "1.1.1.1" }))).toBe("1.1.1.1");
  });

  it("ignores a client-spoofed leftmost entry and trusts the proxy-appended hop", () => {
    // Client forged 9.9.9.9; our edge proxy appended the real 1.1.1.1.
    expect(getClientIp(req({ "x-forwarded-for": "9.9.9.9, 1.1.1.1" }))).toBe("1.1.1.1");
  });

  it("cannot be pushed past the trusted hop by stuffing extra entries", () => {
    expect(getClientIp(req({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 1.1.1.1" }))).toBe("1.1.1.1");
  });

  it("trims whitespace and skips empty segments", () => {
    expect(getClientIp(req({ "x-forwarded-for": "  9.9.9.9 ,  , 1.1.1.1  " }))).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip when there is no forwarded header", () => {
    expect(getClientIp(req({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
  });

  it("falls back to a shared constant when no IP headers are present", () => {
    expect(getClientIp(req({}))).toBe("unknown");
  });
});
