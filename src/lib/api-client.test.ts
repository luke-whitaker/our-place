import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, userMessage } from "./api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("apiFetch", () => {
  const assign = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("window", { location: { origin: "https://example.test", assign } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    assign.mockReset();
  });

  it("returns the parsed body on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, { posts: [1, 2] })));
    await expect(apiFetch<{ posts: number[] }>("/api/feed")).resolves.toEqual({ posts: [1, 2] });
  });

  it("throws an ApiError carrying the server's message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(409, { error: "Taken." })));
    const failure = apiFetch("/api/communities", { method: "POST" });
    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 409, message: "Taken." });
  });

  it("falls back to a generic message when the body is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 502 })));
    await expect(apiFetch("/api/feed")).rejects.toMatchObject({
      status: 502,
      message: "Request failed (502).",
    });
  });

  it("sends a 401 to the login page by default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Nope." })));
    await expect(apiFetch("/api/feed")).rejects.toBeInstanceOf(ApiError);
    expect(assign).toHaveBeenCalledWith("https://example.test/auth/login");
  });

  it("leaves a 401 alone when the caller opts out (the login form)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Wrong." })));
    await expect(
      apiFetch("/api/auth/login", { method: "POST", redirectOnUnauthorized: false }),
    ).rejects.toMatchObject({ message: "Wrong." });
    expect(assign).not.toHaveBeenCalled();
  });

  it("does not forward the redirect option to fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    await apiFetch("/api/x", { method: "DELETE", redirectOnUnauthorized: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", { method: "DELETE" });
  });
});

describe("userMessage", () => {
  it("uses the ApiError message and a fallback for anything else", () => {
    expect(userMessage(new ApiError(400, "Bad input."))).toBe("Bad input.");
    expect(userMessage(new TypeError("network"))).toBe("Something went wrong.");
    expect(userMessage(null, "Could not load.")).toBe("Could not load.");
  });
});
