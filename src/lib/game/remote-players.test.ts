import { describe, expect, it } from "vitest";
import type { PresencePlayer } from "@/lib/types";
import {
  applyPlayer,
  createRoster,
  emoteAt,
  poseAt,
  removePlayer,
  EMOTE_MS,
  INTERP_DELAY_MS,
  MAX_SAMPLES,
  STALE_MS,
} from "./remote-players";

function player(overrides: Partial<PresencePlayer> = {}): PresencePlayer {
  return {
    user_id: "u1",
    username: "sam",
    display_name: "Sam",
    avatar: null,
    col: 10,
    row: 10,
    dir: "S",
    moving: false,
    emote: null,
    emote_at: null,
    ...overrides,
  };
}

describe("poseAt", () => {
  it("interpolates between the samples either side of the render time", () => {
    const roster = createRoster();
    applyPlayer(roster, player({ col: 10, row: 10, moving: true }), 1000, 0);
    applyPlayer(roster, player({ col: 11, row: 12, moving: true, dir: "SE" }), 1200, 0);
    // Render time is 100 ms after the first sample: halfway to the second.
    const pose = poseAt(roster.get("u1")!, 1100 + INTERP_DELAY_MS);
    expect(pose).toEqual({ col: 10.5, row: 11, dir: "SE", moving: true });
  });

  it("draws the first sample until the render time reaches it", () => {
    const roster = createRoster();
    applyPlayer(roster, player({ col: 3, row: 4 }), 1000, 0);
    expect(poseAt(roster.get("u1")!, 1000)).toMatchObject({ col: 3, row: 4 });
  });

  it("holds the last sample when data stops, and stops walking once stale", () => {
    const roster = createRoster();
    applyPlayer(roster, player({ col: 5, row: 5, moving: true }), 1000, 0);
    const p = roster.get("u1")!;
    expect(poseAt(p, 1000 + INTERP_DELAY_MS + 50)).toMatchObject({ col: 5, moving: true });
    expect(poseAt(p, 1000 + STALE_MS + 1)).toMatchObject({ col: 5, row: 5, moving: false });
  });

  it("snaps instead of gliding across a long jump", () => {
    const roster = createRoster();
    applyPlayer(roster, player({ col: 1, row: 1 }), 1000, 0);
    applyPlayer(roster, player({ col: 40, row: 30 }), 1100, 0);
    const p = roster.get("u1")!;
    expect(p.samples).toHaveLength(1);
    // Even before the render time reaches the new sample, it's drawn there.
    expect(poseAt(p, 1050)).toMatchObject({ col: 40, row: 30 });
  });

  it("keeps at most MAX_SAMPLES samples", () => {
    const roster = createRoster();
    for (let i = 0; i < MAX_SAMPLES + 5; i++) {
      applyPlayer(roster, player({ col: 10 + i * 0.1 }), 1000 + i * 100, 0);
    }
    expect(roster.get("u1")!.samples).toHaveLength(MAX_SAMPLES);
  });
});

describe("removePlayer", () => {
  it("drops a member who left", () => {
    const roster = createRoster();
    applyPlayer(roster, player(), 0, 0);
    removePlayer(roster, "u1");
    expect(roster.size).toBe(0);
  });
});

describe("emotes", () => {
  it("shows a fresh emote for EMOTE_MS, then clears it", () => {
    const roster = createRoster();
    applyPlayer(roster, player({ emote: "heart", emote_at: 50_000 }), 1000, 50_500);
    const e = roster.get("u1")!.emote;
    // Already 500 ms old on arrival.
    expect(emoteAt(e, 1000)).toEqual({ kind: "heart", age: 500 });
    expect(emoteAt(e, 1000 + EMOTE_MS)).toBeNull();
  });

  it("ignores an emote that's already over when it arrives", () => {
    const roster = createRoster();
    applyPlayer(roster, player({ emote: "laugh", emote_at: 1_000 }), 0, 1_000 + EMOTE_MS + 1);
    expect(roster.get("u1")!.emote).toBeNull();
  });

  it("doesn't restart a bubble for the same emote on later move updates", () => {
    const roster = createRoster();
    applyPlayer(roster, player({ emote: "wow", emote_at: 10_000 }), 1000, 10_000);
    applyPlayer(roster, player({ emote: "wow", emote_at: 10_000, col: 11 }), 2000, 11_000);
    expect(roster.get("u1")!.emote?.startedAt).toBe(1000);
  });
});
