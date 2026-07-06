import { describe, it, expect } from "vitest";
import { friendshipStatusFor } from "./friends";

describe("friendshipStatusFor", () => {
  const viewer = "viewer-id";
  const owner = "owner-id";

  it("returns self when viewing your own profile", () => {
    expect(friendshipStatusFor(viewer, viewer, null)).toBe("self");
  });

  it("returns none when no friendship row exists", () => {
    expect(friendshipStatusFor(viewer, owner, null)).toBe("none");
  });

  it("returns friends for an accepted row in either direction", () => {
    expect(friendshipStatusFor(viewer, owner, { userId: viewer, status: "accepted" })).toBe(
      "friends",
    );
    expect(friendshipStatusFor(viewer, owner, { userId: owner, status: "accepted" })).toBe(
      "friends",
    );
  });

  it("returns pending_outgoing when the viewer sent the pending request", () => {
    expect(friendshipStatusFor(viewer, owner, { userId: viewer, status: "pending" })).toBe(
      "pending_outgoing",
    );
  });

  it("returns pending_incoming when the owner sent the pending request", () => {
    expect(friendshipStatusFor(viewer, owner, { userId: owner, status: "pending" })).toBe(
      "pending_incoming",
    );
  });
});
