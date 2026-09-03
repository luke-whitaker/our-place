import { describe, it, expect } from "vitest";
import { islandAccess } from "./islands";

describe("islandAccess", () => {
  const viewer = "viewer-id";
  const owner = "owner-id";

  it("is always open to the owner, regardless of their own visibility", () => {
    expect(islandAccess(owner, { id: owner, islandVisibility: "anyone" }, false)).toBe("open");
    expect(islandAccess(owner, { id: owner, islandVisibility: "friends" }, false)).toBe("open");
    expect(islandAccess(owner, { id: owner, islandVisibility: "nobody" }, false)).toBe("open");
  });

  it("is open to anyone when visibility is 'anyone'", () => {
    expect(islandAccess(viewer, { id: owner, islandVisibility: "anyone" }, false)).toBe("open");
    expect(islandAccess(viewer, { id: owner, islandVisibility: "anyone" }, true)).toBe("open");
  });

  it("is closed to everyone but the owner when visibility is 'nobody'", () => {
    expect(islandAccess(viewer, { id: owner, islandVisibility: "nobody" }, false)).toBe("closed");
    expect(islandAccess(viewer, { id: owner, islandVisibility: "nobody" }, true)).toBe("closed");
  });

  it("is open to friends and friends-only to non-friends when visibility is 'friends'", () => {
    expect(islandAccess(viewer, { id: owner, islandVisibility: "friends" }, true)).toBe("open");
    expect(islandAccess(viewer, { id: owner, islandVisibility: "friends" }, false)).toBe(
      "friends-only",
    );
  });

  it("falls back to the friends gate for an unrecognized visibility value", () => {
    expect(islandAccess(viewer, { id: owner, islandVisibility: "bogus" }, true)).toBe("open");
    expect(islandAccess(viewer, { id: owner, islandVisibility: "bogus" }, false)).toBe(
      "friends-only",
    );
  });
});
