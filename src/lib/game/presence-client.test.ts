import { describe, expect, it } from "vitest";
import type { PresenceMoveBody } from "@/lib/types";
import {
  createPresenceSender,
  parsePresenceEvent,
  KEEPALIVE_MS,
  SEND_INTERVAL_MS,
} from "./presence-client";

const SAM = {
  user_id: "u1",
  username: "sam",
  display_name: "Sam",
  avatar: null,
  hat: "pink",
  col: 3,
  row: 4,
  dir: "S",
  moving: false,
  emote: null,
  emote_at: null,
};

describe("parsePresenceEvent", () => {
  it("reads a player from before flower hats, or with an unknown hat, as hatless", () => {
    const { hat: _hat, ...old } = SAM;
    void _hat;
    const parsed = parsePresenceEvent("update", JSON.stringify(old));
    expect(parsed).toEqual({ type: "update", player: { ...SAM, hat: null } });
    const odd = parsePresenceEvent("update", JSON.stringify({ ...SAM, hat: "green" }));
    expect(odd).toEqual({ type: "update", player: { ...SAM, hat: null } });
  });

  it("reads a snapshot, an update, and a leave", () => {
    expect(parsePresenceEvent("snapshot", JSON.stringify({ players: [SAM] }))).toEqual({
      type: "snapshot",
      players: [SAM],
    });
    expect(
      parsePresenceEvent("update", JSON.stringify({ ...SAM, emote: "heart", emote_at: 5 })),
    ).toMatchObject({ type: "update", player: { emote: "heart", emote_at: 5 } });
    expect(parsePresenceEvent("leave", JSON.stringify({ user_id: "u1" }))).toEqual({
      type: "leave",
      userId: "u1",
    });
  });

  it("skips malformed JSON, unknown types, and bad fields", () => {
    expect(parsePresenceEvent("update", "{not json")).toBeNull();
    expect(parsePresenceEvent("dance", JSON.stringify(SAM))).toBeNull();
    expect(parsePresenceEvent("update", JSON.stringify({ ...SAM, dir: "UP" }))).toBeNull();
    expect(parsePresenceEvent("update", JSON.stringify({ ...SAM, emote: "wave" }))).toBeNull();
    expect(parsePresenceEvent("leave", JSON.stringify({}))).toBeNull();
  });

  it("keeps the good players in a snapshot with one broken entry", () => {
    const event = parsePresenceEvent(
      "snapshot",
      JSON.stringify({ players: [SAM, { user_id: 1 }] }),
    );
    expect(event).toEqual({ type: "snapshot", players: [SAM] });
  });

  it("draws an invalid avatar in the default colors instead of dropping the player", () => {
    const event = parsePresenceEvent("update", JSON.stringify({ ...SAM, avatar: { skin: 3 } }));
    expect(event).toMatchObject({ type: "update", player: { avatar: null } });
  });
});

describe("createPresenceSender", () => {
  const body: PresenceMoveBody = { world_id: "capital", col: 1, row: 1, dir: "S", moving: true };

  function harness(result: () => Promise<unknown> = () => Promise.resolve()) {
    let t = 0;
    const sent: PresenceMoveBody[] = [];
    const sender = createPresenceSender(
      (b) => {
        sent.push(b);
        return result();
      },
      () => t,
    );
    return {
      sender,
      sent,
      at: (ms: number) => {
        t = ms;
      },
    };
  }

  async function settle() {
    await new Promise((r) => setTimeout(r, 0));
  }

  it("posts a change at most every SEND_INTERVAL_MS, rounded to 2 decimals", async () => {
    const h = harness();
    h.sender.tick({ ...body, col: 1.23456 });
    await settle();
    h.at(SEND_INTERVAL_MS - 1);
    h.sender.tick({ ...body, col: 2 });
    await settle();
    expect(h.sent).toEqual([{ ...body, col: 1.23 }]);
    h.at(SEND_INTERVAL_MS);
    h.sender.tick({ ...body, col: 2 });
    await settle();
    expect(h.sent).toHaveLength(2);
  });

  it("stays quiet when nothing changes, apart from a keepalive", async () => {
    const h = harness();
    h.sender.tick(body);
    await settle();
    h.at(KEEPALIVE_MS - 1);
    h.sender.tick(body);
    await settle();
    expect(h.sent).toHaveLength(1);
    h.at(KEEPALIVE_MS);
    h.sender.tick(body);
    await settle();
    expect(h.sent).toHaveLength(2);
  });

  it("sends the final standing position when the player stops", async () => {
    const h = harness();
    h.sender.tick(body);
    await settle();
    h.at(SEND_INTERVAL_MS);
    h.sender.tick({ ...body, moving: false });
    await settle();
    expect(h.sent[1].moving).toBe(false);
  });

  it("never overlaps two posts; a tick mid-flight is dropped, not queued", async () => {
    let release: () => void = () => {};
    const h = harness(() => new Promise<void>((r) => (release = r)));
    h.sender.tick(body);
    h.at(SEND_INTERVAL_MS * 3);
    h.sender.tick({ ...body, col: 9 });
    expect(h.sent).toHaveLength(1);
    release();
    await settle();
    h.sender.tick({ ...body, col: 9 });
    expect(h.sent).toHaveLength(2);
  });

  it("counts failures without throwing, and retries on the next tick", async () => {
    const h = harness(() => Promise.reject(new Error("offline")));
    h.sender.tick(body);
    await settle();
    expect(h.sender.failures()).toBe(1);
    h.at(SEND_INTERVAL_MS);
    h.sender.tick(body);
    await settle();
    expect(h.sent).toHaveLength(2);
    expect(h.sender.failures()).toBe(2);
  });
});
