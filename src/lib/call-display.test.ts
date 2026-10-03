import { describe, it, expect } from "vitest";
import type { CallInvitation, CallMember } from "@/lib/types";
import {
  CALL_POLL_BACKOFF_MAX_CONNECTED_MS,
  CALL_POLL_BACKOFF_MAX_MS,
  CALL_POLL_HIDDEN_MS,
  CALL_POLL_MS,
  inviteToastText,
  listNames,
  orderMembers,
  pollDelay,
  roomLeft,
} from "./call-display";

describe("pollDelay", () => {
  it("polls every 10 seconds while connected, even in a hidden tab", () => {
    expect(pollDelay({ connected: true, hidden: true, failures: 0 })).toBe(CALL_POLL_MS);
    expect(pollDelay({ connected: false, hidden: false, failures: 0 })).toBe(CALL_POLL_MS);
  });

  it("slows down in a hidden tab that isn't in a call", () => {
    expect(pollDelay({ connected: false, hidden: true, failures: 0 })).toBe(CALL_POLL_HIDDEN_MS);
  });

  it("backs off after failures, up to a cap that keeps a connected heartbeat alive", () => {
    expect(pollDelay({ connected: false, hidden: false, failures: 1 })).toBe(20_000);
    expect(pollDelay({ connected: false, hidden: false, failures: 50 })).toBe(
      CALL_POLL_BACKOFF_MAX_MS,
    );
    expect(pollDelay({ connected: true, hidden: false, failures: 50 })).toBe(
      CALL_POLL_BACKOFF_MAX_CONNECTED_MS,
    );
    expect(CALL_POLL_BACKOFF_MAX_CONNECTED_MS).toBeLessThan(45_000);
  });
});

describe("listNames", () => {
  it("joins names the way a person would say them", () => {
    expect(listNames([])).toBe("");
    expect(listNames(["Sam"])).toBe("Sam");
    expect(listNames(["Sam", "Robin"])).toBe("Sam and Robin");
    expect(listNames(["Sam", "Robin", "Ada"])).toBe("Sam, Robin, and Ada");
    expect(listNames(["Sam", "Robin", "Ada", "Lee"])).toBe("Sam, Robin, and 2 others");
  });
});

describe("inviteToastText", () => {
  const person = (username: string, display_name: string) => ({ username, display_name });
  const invitation = (over: Partial<CallInvitation>): CallInvitation => ({
    call_id: "c1",
    invited_by: person("luke", "Luke"),
    joined: [person("luke", "Luke")],
    expires_at: new Date().toISOString(),
    ...over,
  });

  it("names the caller alone when nobody else is in the call", () => {
    expect(inviteToastText(invitation({}))).toBe("Luke is calling. Join?");
  });

  it("names who else is there, without repeating the caller", () => {
    expect(
      inviteToastText(invitation({ joined: [person("luke", "Luke"), person("sam", "Sam")] })),
    ).toBe("Luke is calling, with Sam. Join?");
  });

  it("still makes sense when the inviter has since deleted their account", () => {
    expect(inviteToastText(invitation({ invited_by: null, joined: [person("sam", "Sam")] }))).toBe(
      "A call with Sam is going. Join?",
    );
  });
});

describe("orderMembers and roomLeft", () => {
  const member = (username: string, status: "joined" | "pending"): CallMember => ({
    user_id: `id-${username}`,
    username,
    display_name: username[0].toUpperCase() + username.slice(1),
    avatar_color: "#000",
    status,
  });

  it("lists you first, then everyone in the call by name, then those invited", () => {
    const ordered = orderMembers(
      [
        member("zed", "pending"),
        member("sam", "joined"),
        member("me", "joined"),
        member("ada", "joined"),
      ],
      "me",
    );
    expect(ordered.map((m) => m.username)).toEqual(["me", "ada", "sam", "zed"]);
  });

  it("counts room left against eight people, open invitations included", () => {
    expect(roomLeft([member("me", "joined"), member("sam", "pending")])).toBe(6);
    expect(roomLeft(Array.from({ length: 9 }, (_, i) => member(`p${i}`, "joined")))).toBe(0);
  });
});
