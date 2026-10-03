import { describe, it, expect, beforeEach } from "vitest";
import {
  createPresenceHub,
  EMOTE_SHOW_MS,
  LEAVE_AFTER_SILENCE_MS,
  LEAVE_AFTER_STREAM_MS,
  MAX_PLAYERS,
  MAX_SUBSCRIBERS,
  MAX_SUBSCRIBERS_PER_USER,
  MAX_VISIT_SECONDS,
  type PresenceEvent,
  type PresenceHub,
  type PresenceProfile,
} from "./presence";

const HERE = { col: 5, row: 6, dir: "S" as const, moving: false };

function profile(name: string, ghost = false): PresenceProfile {
  return { username: name, display_name: name.toUpperCase(), avatar: null, hat: null, ghost };
}

/** A subscriber that records every event it receives. */
function listener(userId: string, worldId: string) {
  const events: { event: PresenceEvent; data: unknown }[] = [];
  return {
    events,
    sub: {
      userId,
      worldId,
      send: (event: PresenceEvent, data: unknown) => events.push({ event, data }),
    },
    names: () => events.map((e) => e.event),
  };
}

let t = 0;
let hub: PresenceHub;

beforeEach(() => {
  t = 1_000_000;
  hub = createPresenceHub({ now: () => t, autoSweep: false });
});

describe("presence hub", () => {
  it("asks for a profile the first time a member appears, and not after", () => {
    expect(hub.move("ann", "capital", HERE)).toBe("needs-profile");
    expect(hub.move("ann", "capital", HERE, profile("ann"))).toBe("ok");
    expect(hub.knows("ann")).toBe(true);
    expect(hub.move("ann", "capital", { ...HERE, col: 6 })).toBe("ok");
  });

  it("sends a snapshot of everyone else in the world, never the listener", () => {
    hub.move("ann", "capital", HERE, profile("ann"));
    hub.move("bo", "capital", HERE, profile("bo"));
    hub.move("cy", "music-inside", HERE, profile("cy"));

    const ann = listener("ann", "capital");
    hub.subscribe(ann.sub);

    expect(ann.events).toEqual([
      { event: "snapshot", data: { players: [expect.objectContaining({ user_id: "bo" })] } },
    ]);
  });

  it("tells a world about a move, except the mover", () => {
    const ann = listener("ann", "capital");
    const bo = listener("bo", "capital");
    hub.subscribe(ann.sub);
    hub.subscribe(bo.sub);

    hub.move("ann", "capital", { ...HERE, col: 9, moving: true }, profile("ann"));

    expect(ann.names()).toEqual(["snapshot"]);
    expect(bo.events[1]).toEqual({
      event: "update",
      data: expect.objectContaining({ user_id: "ann", col: 9, moving: true, display_name: "ANN" }),
    });
  });

  it("moves a member between worlds: a leave in the old one, an update in the new", () => {
    const inCapital = listener("bo", "capital");
    const inRoom = listener("cy", "music-inside");
    hub.subscribe(inCapital.sub);
    hub.subscribe(inRoom.sub);
    hub.move("ann", "capital", HERE, profile("ann"));

    hub.move("ann", "music-inside", HERE);

    expect(inCapital.events.at(-1)).toEqual({ event: "leave", data: { user_id: "ann" } });
    expect(inRoom.events.at(-1)?.event).toBe("update");
  });

  it("broadcasts an emote and refuses one from a member who isn't in that world", () => {
    const bo = listener("bo", "capital");
    hub.subscribe(bo.sub);
    hub.move("ann", "capital", HERE, profile("ann"));

    expect(hub.emote("ann", "capital", "heart")).toBe("ok");
    expect(bo.events.at(-1)?.data).toEqual(
      expect.objectContaining({ emote: "heart", emote_at: t }),
    );
    expect(hub.emote("ann", "music-inside", "heart")).toBe("not-here");
    expect(hub.emote("nobody", "capital", "heart")).toBe("not-here");
  });

  it("shows a late joiner an emote only while it's still showing", () => {
    hub.move("ann", "capital", HERE, profile("ann"));
    hub.emote("ann", "capital", "wow");

    t += EMOTE_SHOW_MS - 1;
    const early = listener("bo", "capital");
    hub.subscribe(early.sub);
    t += 2;
    const late = listener("cy", "capital");
    hub.subscribe(late.sub);

    expect(early.events[0].data).toEqual({
      players: [expect.objectContaining({ emote: "wow" })],
    });
    expect(late.events[0].data).toEqual({
      players: [expect.objectContaining({ emote: null, emote_at: null })],
    });
  });

  it("lets a member leave 10 s after their last stream closes", () => {
    const bo = listener("bo", "capital");
    hub.subscribe(bo.sub);
    const ann = listener("ann", "capital");
    const annSub = hub.subscribe(ann.sub);
    hub.move("ann", "capital", HERE, profile("ann"));
    if (annSub.ok) annSub.unsubscribe();

    t += LEAVE_AFTER_STREAM_MS;
    hub.sweep();
    expect(hub.knows("ann")).toBe(true);

    t += 1;
    hub.sweep();
    expect(hub.knows("ann")).toBe(false);
    expect(bo.events.at(-1)).toEqual({ event: "leave", data: { user_id: "ann" } });
  });

  it("keeps a member with an open stream until 30 s of silence", () => {
    hub.subscribe(listener("ann", "capital").sub);
    hub.move("ann", "capital", HERE, profile("ann"));

    t += LEAVE_AFTER_STREAM_MS + 1;
    hub.sweep();
    expect(hub.knows("ann")).toBe(true);

    t += LEAVE_AFTER_SILENCE_MS;
    hub.sweep();
    expect(hub.knows("ann")).toBe(false);
  });

  it("drops a subscriber whose send throws, without disturbing the others", () => {
    const bo = listener("bo", "capital");
    hub.subscribe(bo.sub);
    let calls = 0;
    hub.subscribe({
      userId: "cy",
      worldId: "capital",
      send: () => {
        calls++;
        if (calls > 1) throw new Error("connection gone");
      },
    });
    expect(hub.stats().subscribers).toBe(2);

    hub.move("ann", "capital", HERE, profile("ann"));

    expect(hub.stats().subscribers).toBe(1);
    expect(bo.events.at(-1)?.event).toBe("update");
  });

  it("caps streams per member", () => {
    for (let i = 0; i < MAX_SUBSCRIBERS_PER_USER; i++) {
      expect(hub.subscribe(listener("ann", "capital").sub).ok).toBe(true);
    }
    expect(hub.subscribe(listener("ann", "music-inside").sub)).toEqual({
      ok: false,
      reason: "user-limit",
    });
  });

  it("caps streams and players overall", () => {
    for (let i = 0; i < MAX_SUBSCRIBERS; i++) hub.subscribe(listener(`u${i}`, "capital").sub);
    expect(hub.subscribe(listener("one-more", "capital").sub)).toEqual({
      ok: false,
      reason: "full",
    });

    const fresh = createPresenceHub({ now: () => t, autoSweep: false });
    for (let i = 0; i < MAX_PLAYERS; i++) fresh.move(`p${i}`, "capital", HERE, profile(`p${i}`));
    expect(fresh.move("one-more", "capital", HERE, profile("x"))).toBe("full");
    // A member already here can still move.
    expect(fresh.move("p0", "capital", { ...HERE, col: 1 })).toBe("ok");
  });

  it("never tells anyone about a ghost: no snapshot, no update, no emote, no leave", () => {
    hub.move("ann", "capital", HERE, profile("ann", true));
    const bo = listener("bo", "capital");
    hub.subscribe(bo.sub);
    hub.move("ann", "capital", { ...HERE, col: 8 });
    expect(hub.emote("ann", "capital", "heart")).toBe("ok");
    hub.move("ann", "music-inside", HERE);

    expect(bo.events).toEqual([{ event: "snapshot", data: { players: [] } }]);
    // Coming back while in another world only reaches that world.
    hub.setGhost("ann", false);
    expect(bo.events).toHaveLength(1);
  });

  it("going ghost is a leave to everyone else; coming back is an update", () => {
    hub.move("ann", "capital", HERE, profile("ann"));
    const bo = listener("bo", "capital");
    hub.subscribe(bo.sub);

    hub.setGhost("ann", true);
    hub.move("ann", "capital", { ...HERE, col: 9 });
    hub.emote("ann", "capital", "heart");
    t += 500;
    hub.setGhost("ann", false);

    expect(bo.names()).toEqual(["snapshot", "leave", "update"]);
    expect(bo.events[2].data).toEqual(expect.objectContaining({ user_id: "ann", col: 9 }));
    // An emote sent as a ghost doesn't come back with them.
    expect(bo.events[2].data).toEqual(expect.objectContaining({ emote: null }));
    expect(bo.events[2].data).not.toHaveProperty("ghost");
    // Setting the same state again says nothing.
    hub.setGhost("ann", false);
    expect(bo.events).toHaveLength(3);
  });

  it("shows a new outfit to everyone nearby at once, but never a ghost's", () => {
    const avatar = {
      hairStyle: "long" as const,
      hairColor: "#1c1c22",
      skinTone: "#FFE0BD",
      shirtColor: "#ec4899",
      pantsColor: "#1f2937",
      shoesColor: "#111827",
    };
    hub.move("ann", "capital", HERE, profile("ann"));
    hub.move("cy", "capital", HERE, profile("cy", true));
    const bo = listener("bo", "capital");
    hub.subscribe(bo.sub);

    hub.setAvatar("ann", avatar);
    hub.setAvatar("cy", avatar);
    hub.setAvatar("nobody", avatar);

    expect(bo.names()).toEqual(["snapshot", "update"]);
    expect(bo.events[1].data).toEqual(expect.objectContaining({ user_id: "ann", avatar }));
  });

  it("only runs its sweep timer while someone is here", () => {
    const timed = createPresenceHub({ now: () => t });
    expect(timed.stats().sweeping).toBe(false);
    const sub = timed.subscribe(listener("ann", "capital").sub);
    expect(timed.stats().sweeping).toBe(true);
    if (sub.ok) sub.unsubscribe();
    expect(timed.stats().sweeping).toBe(false);
  });
});

describe("world visits for the metrics", () => {
  let visits: { userId: string; seconds: number }[];
  let timed: PresenceHub;

  beforeEach(() => {
    visits = [];
    timed = createPresenceHub({
      now: () => t,
      autoSweep: false,
      onVisitEnd: (userId, seconds) => visits.push({ userId, seconds }),
    });
  });

  /** Post a position every 5 s for `seconds`, as a walking client does. */
  function walk(userId: string, worldId: string, seconds: number) {
    for (let s = 0; s < seconds; s += 5) {
      timed.move(userId, worldId, HERE, profile(userId));
      t += 5_000;
    }
    timed.move(userId, worldId, HERE, profile(userId));
  }

  /** Let the silence timeout pass so the sweep removes everyone. */
  function goQuiet() {
    t += LEAVE_AFTER_SILENCE_MS + 1;
    timed.sweep();
  }

  it("reports a visit's length from arrival to the last position, not the timeout", () => {
    walk("ann", "capital", 60);
    goQuiet();

    expect(visits).toEqual([{ userId: "ann", seconds: 60 }]);
  });

  it("keeps one visit across doors and warps", () => {
    walk("ann", "capital", 30);
    walk("ann", "music-inside", 30);
    walk("ann", "island:ann", 30);
    goQuiet();

    expect(visits).toEqual([{ userId: "ann", seconds: 90 }]);
  });

  it("caps a visit at three hours", () => {
    walk("ann", "capital", 4 * 60 * 60);
    goQuiet();

    expect(visits).toEqual([{ userId: "ann", seconds: MAX_VISIT_SECONDS }]);
  });

  it("ends a visit through the sweep once the stream is gone and positions stop", () => {
    walk("ann", "capital", 20);
    t += LEAVE_AFTER_STREAM_MS + 1;
    timed.sweep();

    expect(visits).toEqual([{ userId: "ann", seconds: 20 }]);
    expect(timed.knows("ann")).toBe(false);
  });

  it("reports nothing for a visit with no time in it", () => {
    timed.move("ann", "capital", HERE, profile("ann"));
    goQuiet();

    expect(visits).toEqual([]);
  });
});

describe("presence hub: blocks", () => {
  it("never sends a hidden member in the snapshot, their moves, emotes, or leave", () => {
    hub.move("ann", "capital", HERE, profile("ann"));
    hub.move("bo", "capital", HERE, profile("bo"));
    const bo = listener("bo", "capital");
    hub.subscribe({ ...bo.sub, hidden: new Set(["ann"]) });

    hub.move("ann", "capital", { ...HERE, col: 9 });
    hub.emote("ann", "capital", "heart");
    hub.move("ann", "music-inside", HERE);

    expect(bo.events).toEqual([{ event: "snapshot", data: { players: [] } }]);
  });

  it("hides both ways at once when a block is made, and shows both again when lifted", () => {
    hub.move("ann", "capital", HERE, profile("ann"));
    hub.move("bo", "capital", HERE, profile("bo"));
    const ann = listener("ann", "capital");
    const bo = listener("bo", "capital");
    hub.subscribe(ann.sub);
    hub.subscribe(bo.sub);

    hub.setBlocked("ann", "bo", true);
    expect(ann.events.at(-1)).toEqual({ event: "leave", data: { user_id: "bo" } });
    expect(bo.events.at(-1)).toEqual({ event: "leave", data: { user_id: "ann" } });

    hub.move("bo", "capital", { ...HERE, col: 2 });
    hub.move("ann", "capital", { ...HERE, col: 3 });
    expect(ann.names()).toEqual(["snapshot", "leave"]);
    expect(bo.names()).toEqual(["snapshot", "leave"]);

    hub.setBlocked("ann", "bo", false);
    expect(ann.events.at(-1)?.event).toBe("update");
    expect(bo.events.at(-1)?.event).toBe("update");
  });

  it("doesn't reveal a ghost when a block is lifted", () => {
    hub.move("ann", "capital", HERE, profile("ann", true));
    const bo = listener("bo", "capital");
    hub.subscribe({ ...bo.sub, hidden: new Set(["ann"]) });

    hub.setBlocked("bo", "ann", false);
    expect(bo.names()).toEqual(["snapshot"]);
  });
});
