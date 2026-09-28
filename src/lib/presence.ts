// Live presence: who is in which world, where they stand, and who is
// listening. Everything lives in this one process's memory, which is right for
// a single Railway instance and wrong the moment a second one runs (the Redis
// note in ROADMAP.md). The hub itself does no I/O: routes feed it positions
// and subscribers, and it decides who hears what, so it is unit-tested with a
// fake clock and no HTTP.

import type { Emote, PresenceDir, PresencePlayer } from "@/lib/types";

/** How long an emote shows. A late joiner's snapshot drops older ones. */
export const EMOTE_SHOW_MS = 3_000;
/** A player whose stream has closed leaves once no position has come for this long. */
export const LEAVE_AFTER_STREAM_MS = 10_000;
/** Any player leaves after this long with no position (the client keeps alive every 10 s). */
export const LEAVE_AFTER_SILENCE_MS = 30_000;
/** How often the background sweep runs while anyone is here. */
const SWEEP_EVERY_MS = 5_000;

export const MAX_PLAYERS = 500;
export const MAX_SUBSCRIBERS = 500;
export const MAX_SUBSCRIBERS_PER_USER = 3;

export type PresenceEvent = "snapshot" | "update" | "leave";

export interface PresenceSubscriber {
  userId: string;
  worldId: string;
  /** Deliver one event. Throwing means the connection is gone: the hub drops it. */
  send(event: PresenceEvent, data: unknown): void;
}

/** The parts of a player that come from their account, fetched once on arrival. */
export interface PresenceProfile {
  username: string;
  display_name: string;
  avatar: PresencePlayer["avatar"];
}

export interface PresencePosition {
  col: number;
  row: number;
  dir: PresenceDir;
  moving: boolean;
}

interface PlayerEntry {
  worldId: string;
  player: PresencePlayer;
  lastSeen: number;
}

export type MoveResult = "ok" | "needs-profile" | "full";
export type SubscribeResult =
  { ok: true; unsubscribe: () => void } | { ok: false; reason: "user-limit" | "full" };

export interface PresenceHubOptions {
  now?: () => number;
  /** Run the background sweep on a timer. Tests turn it off and call sweep(). */
  autoSweep?: boolean;
}

export function createPresenceHub({ now = Date.now, autoSweep = true }: PresenceHubOptions = {}) {
  const players = new Map<string, PlayerEntry>();
  const subscribers = new Map<string, Set<PresenceSubscriber>>(); // by world id
  let subscriberCount = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Ghost Mode (coming with the armoire) filters here and only here: a player
  // this returns false for is never in a snapshot, an update, or a leave, so
  // their position never leaves the server. Everyone is visible until then.
  function isVisible(entry: PlayerEntry): boolean {
    void entry;
    return true;
  }

  function streamsFor(userId: string, worldId: string): number {
    let count = 0;
    for (const sub of subscribers.get(worldId) ?? []) if (sub.userId === userId) count++;
    return count;
  }

  function streamsOfUser(userId: string): number {
    let count = 0;
    for (const subs of subscribers.values()) {
      for (const sub of subs) if (sub.userId === userId) count++;
    }
    return count;
  }

  function removeSubscriber(sub: PresenceSubscriber): void {
    const subs = subscribers.get(sub.worldId);
    if (!subs?.delete(sub)) return;
    subscriberCount--;
    if (subs.size === 0) subscribers.delete(sub.worldId);
    stopTimerIfIdle();
  }

  /** Send to everyone in a world except `exceptUserId`; a failed send drops that subscriber. */
  function broadcast(worldId: string, exceptUserId: string, event: PresenceEvent, data: unknown) {
    for (const sub of [...(subscribers.get(worldId) ?? [])]) {
      if (sub.userId === exceptUserId) continue;
      try {
        sub.send(event, data);
      } catch {
        removeSubscriber(sub);
      }
    }
  }

  function leave(userId: string): void {
    const entry = players.get(userId);
    if (!entry) return;
    players.delete(userId);
    if (isVisible(entry)) broadcast(entry.worldId, userId, "leave", { user_id: userId });
    stopTimerIfIdle();
  }

  function sweep(): void {
    const t = now();
    for (const [userId, entry] of [...players]) {
      const silence = t - entry.lastSeen;
      const hasStream = streamsFor(userId, entry.worldId) > 0;
      if (silence > LEAVE_AFTER_SILENCE_MS || (!hasStream && silence > LEAVE_AFTER_STREAM_MS)) {
        leave(userId);
      }
    }
  }

  function startTimer(): void {
    if (!autoSweep || timer) return;
    timer = setInterval(sweep, SWEEP_EVERY_MS);
    // Never keep the process alive just to sweep an empty room.
    timer.unref?.();
  }

  function stopTimerIfIdle(): void {
    if (timer && players.size === 0 && subscriberCount === 0) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** A player as others see them: an old emote is dropped rather than replayed. */
  function forSnapshot(player: PresencePlayer, t: number): PresencePlayer {
    const fresh = player.emote_at !== null && t - player.emote_at < EMOTE_SHOW_MS;
    return fresh ? player : { ...player, emote: null, emote_at: null };
  }

  return {
    /** Whether the hub already holds this member's profile (so the route can skip the DB). */
    knows(userId: string): boolean {
      return players.has(userId);
    },

    /** Set a member's position, moving them between worlds if the id changed.
     * A newcomer needs their profile; the route fetches it and calls again. */
    move(
      userId: string,
      worldId: string,
      pos: PresencePosition,
      profile?: PresenceProfile,
    ): MoveResult {
      sweep();
      const existing = players.get(userId);
      if (!existing && !profile) return "needs-profile";
      if (!existing && players.size >= MAX_PLAYERS) return "full";

      if (existing && existing.worldId !== worldId) {
        if (isVisible(existing)) broadcast(existing.worldId, userId, "leave", { user_id: userId });
      }
      const base = existing?.player ?? {
        user_id: userId,
        ...profile!,
        emote: null,
        emote_at: null,
      };
      const switched = existing !== undefined && existing.worldId !== worldId;
      const player: PresencePlayer = {
        ...base,
        ...pos,
        // An emote belongs to the world it was shown in.
        ...(switched ? { emote: null, emote_at: null } : {}),
      };
      const entry = { worldId, player, lastSeen: now() };
      players.set(userId, entry);
      startTimer();
      if (isVisible(entry)) broadcast(worldId, userId, "update", player);
      return "ok";
    },

    /** Show an emote to everyone in the member's world. */
    emote(userId: string, worldId: string, emote: Emote): "ok" | "not-here" {
      sweep();
      const entry = players.get(userId);
      if (!entry || entry.worldId !== worldId) return "not-here";
      entry.player = { ...entry.player, emote, emote_at: now() };
      entry.lastSeen = now();
      if (isVisible(entry)) broadcast(worldId, userId, "update", entry.player);
      return "ok";
    },

    /** Start listening to a world: the snapshot goes out at once, then every change. */
    subscribe(sub: PresenceSubscriber): SubscribeResult {
      sweep();
      if (streamsOfUser(sub.userId) >= MAX_SUBSCRIBERS_PER_USER) {
        return { ok: false, reason: "user-limit" };
      }
      if (subscriberCount >= MAX_SUBSCRIBERS) return { ok: false, reason: "full" };

      const t = now();
      const others: PresencePlayer[] = [];
      for (const [userId, entry] of players) {
        if (entry.worldId !== sub.worldId || userId === sub.userId || !isVisible(entry)) continue;
        others.push(forSnapshot(entry.player, t));
      }
      try {
        sub.send("snapshot", { players: others });
      } catch {
        return { ok: true, unsubscribe: () => {} };
      }

      let subs = subscribers.get(sub.worldId);
      if (!subs) {
        subs = new Set();
        subscribers.set(sub.worldId, subs);
      }
      subs.add(sub);
      subscriberCount++;
      startTimer();
      return { ok: true, unsubscribe: () => removeSubscriber(sub) };
    },

    sweep,

    /** Counts, for tests and logs. */
    stats() {
      return { players: players.size, subscribers: subscriberCount, sweeping: timer !== null };
    },
  };
}

export type PresenceHub = ReturnType<typeof createPresenceHub>;

// One hub per process. Held on globalThis so a dev hot reload of this module
// doesn't start a second, empty hub beside the streams still open on the first.
const globalForPresence = globalThis as unknown as { presenceHub?: PresenceHub };

export function presenceHub(): PresenceHub {
  globalForPresence.presenceHub ??= createPresenceHub();
  return globalForPresence.presenceHub;
}
