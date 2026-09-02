import { describe, it, expect } from "vitest";
import { toPeopleEntry, type DirectoryUserLike } from "./people";

describe("toPeopleEntry", () => {
  const viewerId = "viewer-id";
  const createdAt = new Date("2026-01-15T00:00:00.000Z");

  function user(overrides: Partial<DirectoryUserLike> = {}): DirectoryUserLike {
    return {
      id: "other-id",
      username: "priya",
      displayName: "Priya Shah",
      avatarColor: "#6366f1",
      createdAt,
      inviter: null,
      ...overrides,
    };
  }

  it("maps a founding member (no inviter) with no relation to the viewer", () => {
    const entry = toPeopleEntry(user(), viewerId, null);
    expect(entry).toEqual({
      id: "other-id",
      username: "priya",
      display_name: "Priya Shah",
      avatar_color: "#6366f1",
      created_at: createdAt.toISOString(),
      invited_by: null,
      friendship: { status: "none", id: null },
    });
  });

  it("carries the inviter through as invited_by", () => {
    const entry = toPeopleEntry(
      user({ inviter: { username: "admin", displayName: "Admin" } }),
      viewerId,
      null,
    );
    expect(entry.invited_by).toEqual({ username: "admin", display_name: "Admin" });
  });

  it("marks the viewer's own row as self, regardless of a stray friendship row", () => {
    const entry = toPeopleEntry(user({ id: viewerId }), viewerId, {
      id: "f1",
      userId: viewerId,
      status: "accepted",
    });
    expect(entry.friendship).toEqual({ status: "self", id: "f1" });
  });

  it("marks an accepted friendship as friends and carries its id", () => {
    const entry = toPeopleEntry(user(), viewerId, {
      id: "f1",
      userId: viewerId,
      status: "accepted",
    });
    expect(entry.friendship).toEqual({ status: "friends", id: "f1" });
  });

  it("marks a pending row the viewer sent as pending_outgoing", () => {
    const entry = toPeopleEntry(user(), viewerId, {
      id: "f2",
      userId: viewerId,
      status: "pending",
    });
    expect(entry.friendship).toEqual({ status: "pending_outgoing", id: "f2" });
  });

  it("marks a pending row the other user sent as pending_incoming", () => {
    const entry = toPeopleEntry(user(), viewerId, {
      id: "f3",
      userId: "other-id",
      status: "pending",
    });
    expect(entry.friendship).toEqual({ status: "pending_incoming", id: "f3" });
  });
});
