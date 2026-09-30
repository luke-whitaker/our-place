import { describe, it, expect } from "vitest";
import { groupNotifications, type NotificationRow } from "./notifications";

let clock = Date.UTC(2026, 8, 30, 12);
/** Rows are built newest first, the order the route reads them in. */
function row(
  overrides: Partial<NotificationRow> & { kind: string; who?: string },
): NotificationRow {
  clock -= 60_000;
  const who = overrides.who ?? "ada";
  return {
    id: `n${clock}`,
    createdAt: new Date(clock),
    readAt: null,
    friendshipId: null,
    actor: { username: who, displayName: who.toUpperCase() },
    post: null,
    comment: null,
    gathering: null,
    ...overrides,
  };
}

const FOOD_POST = { id: "p1", title: "Soup night", community: { slug: "food" } };
const MY_PLACE_POST = { id: "p2", title: "", community: null };

describe("groupNotifications", () => {
  it("keeps friend requests, acceptances, and comments as one line each, in order", () => {
    const items = groupNotifications([
      row({ kind: "friend_request", friendshipId: "f1" }),
      row({ kind: "friend_accepted", who: "ben" }),
      row({ kind: "comment", post: FOOD_POST, comment: { content: "Count me in!" } }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["friend_request", "friend_accepted", "comment"]);
    expect(items[0]).toMatchObject({ friendship_id: "f1", actor: { username: "ada" } });
    expect(items[2]).toMatchObject({
      excerpt: "Count me in!",
      post: { id: "p1", title: "Soup night", href: "/communities/food" },
    });
  });

  it("groups reactions per post at its newest reaction, naming two and counting all", () => {
    const items = groupNotifications([
      row({ kind: "reaction", who: "cam", post: FOOD_POST }),
      row({ kind: "comment", who: "ben", post: MY_PLACE_POST, comment: { content: "Hi" } }),
      row({ kind: "reaction", who: "ada", post: FOOD_POST }),
      row({ kind: "reaction", who: "dee", post: FOOD_POST }),
      row({ kind: "reaction", who: "eve", post: MY_PLACE_POST }),
    ]);
    expect(items.map((i) => i.kind)).toEqual(["reactions", "comment", "reactions"]);
    const food = items[0];
    expect(food).toMatchObject({ count: 3, post: { href: "/communities/food" } });
    expect(food.kind === "reactions" && food.actors.map((a) => a.username)).toEqual(["cam", "ada"]);
    expect(items[2]).toMatchObject({ count: 1, post: { href: "/profile", title: "" } });
  });

  it("marks a reaction group unread if any reaction in it is unread", () => {
    const read = new Date(Date.UTC(2026, 8, 30));
    const items = groupNotifications([
      row({ kind: "reaction", who: "cam", post: FOOD_POST, readAt: read }),
      row({ kind: "reaction", who: "ada", post: FOOD_POST }),
      row({ kind: "comment", post: FOOD_POST, comment: { content: "x" }, readAt: read }),
    ]);
    expect(items.map((i) => i.unread)).toEqual([true, false]);
  });

  it("flattens a long comment into a short excerpt", () => {
    const [item] = groupNotifications([
      row({
        kind: "comment",
        post: FOOD_POST,
        comment: { content: `Line one\n\n${"a".repeat(300)}` },
      }),
    ]);
    expect(item.kind === "comment" && item.excerpt.length).toBe(140);
    expect(item.kind === "comment" && item.excerpt.startsWith("Line one a")).toBe(true);
    expect(item.kind === "comment" && item.excerpt.endsWith("…")).toBe(true);
  });

  it("skips a row whose post or comment is gone instead of showing it half-empty", () => {
    expect(
      groupNotifications([
        row({ kind: "comment", post: FOOD_POST, comment: null }),
        row({ kind: "reaction", post: null }),
        row({ kind: "friend_request", friendshipId: null }),
        row({ kind: "gathering_invite", gathering: null }),
      ]),
    ).toEqual([]);
  });

  it("carries a gathering and the recipient's own answer on invitations and cancellations", () => {
    const gathering = {
      id: "g1",
      title: "Picnic",
      startsAt: new Date(Date.UTC(2026, 9, 3, 17)),
      status: "scheduled",
      invites: [{ status: "accepted" }],
    };
    const [invite, cancelled] = groupNotifications([
      row({ kind: "gathering_invite", gathering }),
      row({
        kind: "gathering_cancelled",
        gathering: { ...gathering, status: "cancelled", invites: [] },
      }),
    ]);
    expect(invite).toMatchObject({
      kind: "gathering_invite",
      gathering: { id: "g1", title: "Picnic", status: "scheduled", my_response: "accepted" },
    });
    expect(cancelled).toMatchObject({
      kind: "gathering_cancelled",
      gathering: { status: "cancelled", my_response: null },
    });
  });
});
