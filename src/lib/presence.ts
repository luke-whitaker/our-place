// Live presence: who is in which world, where they stand, and who is
// listening. Everything lives in this one process's memory, which is right for
// a single Railway instance and wrong the moment a second one runs (the Redis
// note in ROADMAP.md). The hub itself does no I/O: routes feed it positions
// and subscribers, and it decides who hears what, so it is unit-tested with a
// fake clock and no HTTP.

import type { Emote, PresenceDir, PresencePlayer } from "@/lib/types";
import { recordWorldTime } from "@/lib/activity";

/** How long an emote shows. A late joiner's snapshot drops older ones. */
export const EMOTE_SHOW_MS = 3_000;
/** A player whose stream has closed leaves once no position has come for this long. */
export const LEAVE_AFTER_STREAM_MS = 10_000;
/** Any player leaves after this long with no position (the client keeps alive every 10 s). */
export const LEAVE_AFTER_SILENCE_MS = 30_000;
/** How often the background sweep runs while anyone is here. */
const SWEEP_EVERY_MS = 5_000;

/** The longest a single world visit counts for the metrics, so a phone left open on
 * the island all night adds three hours, not twelve. */
export const MAX_VISIT_SECONDS = 3 * 60 * 60;

export const MAX_PLAYERS = 500;
export const MAX_SUBSCRIBERS = 500;
export const MAX_SUBSCRIBERS_PER_USER = 3;

export type PresenceEvent = "snapshot" | "update" | "leave";

export interface PresenceSubscriber {
  userId: string;
  worldId: string;
  /** Members this subscriber is in a block with: never in their snapshot,
   * updates, or leaves. Filled from the database when the stream opens and
   * kept current by setBlocked, so a block made mid-visit applies at once. */
  hidden?: Set<string>;
  /** Deliver one event. Throwing means the connection is gone: the hub drops it. */
  send(event: PresenceEvent, data: unknown): void;
}

/** The parts of a player that come from their account, fetched once on arrival.
 * `ghost` is Ghost Mode (users.ghost): it stays on the server and never goes
 * out on the wire. */
export interface PresenceProfile {
  username: string;
  display_name: string;
  avatar: PresencePlayer["avatar"];
  hat: PresencePlayer["hat"];
  ghost: boolean;
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
  /** When this visit to the world began. Moving between worlds keeps it. */
  visitStart: number;
  /** Ghost Mode: nobody else hears anything about this player. */
  ghost: boolean;
}

export type MoveResult = "ok" | "needs-profile" | "full";
export type SubscribeResult =
  { ok: true; unsubscribe: () => void } | { ok: false; reason: "user-limit" | "full" };

export interface PresenceHubOptions {
  now?: () => number;
  /** Run the background sweep on a timer. Tests turn it off and call sweep(). */
  autoSweep?: boolean;
  /** Told how long a visit lasted when a member leaves the world, for the metrics. */
  onVisitEnd?: (userId: string, seconds: number) => void;
}

export function createPresenceHub({
  now = Date.now,
  autoSweep = true,
  onVisitEnd,
}: PresenceHubOptions = {}) {
  const players = new Map<string, PlayerEntry>();
  const subscribers = new Map<string, Set<PresenceSubscriber>>(); // by world id
  let subscriberCount = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  // Ghost Mode filters here and only here: a player this returns false for is
  // never in a snapshot, an update, or a leave, so their position and emotes
  // never leave the server.
  function isVisible(entry: PlayerEntry): boolean {
    return !entry.ghost;
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
      if (sub.userId === exceptUserId || sub.hidden?.has(exceptUserId)) continue;
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
    // A visit ends at the last sign of life, not when the sweep noticed the
    // silence, so the timeout itself never counts as time in the world.
    const seconds = Math.min(
      Math.floor((entry.lastSeen - entry.visitStart) / 1000),
      MAX_VISIT_SECONDS,
    );
    if (seconds > 0) onVisitEnd?.(userId, seconds);
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
        username: profile!.username,
        display_name: profile!.display_name,
        avatar: profile!.avatar,
        hat: profile!.hat,
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
      const ghost = existing?.ghost ?? profile!.ghost;
      const t = now();
      const entry = { worldId, player, lastSeen: t, visitStart: existing?.visitStart ?? t, ghost };
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
      entry.lastSeen = now();
      // A ghost's emote is never kept, or coming back into view within its 3 s
      // would replay it to everyone.
      if (!isVisible(entry)) return "ok";
      entry.player = { ...entry.player, emote, emote_at: now() };
      broadcast(worldId, userId, "update", entry.player);
      return "ok";
    },

    /** Turn Ghost Mode on or off for a member already here, after the route has
     * saved it. Going ghost is a `leave` to everyone else (sent while still
     * visible); coming back is an `update`, as if they'd just walked in. A
     * member not here yet reads the flag from their profile when they arrive. */
    setGhost(userId: string, ghost: boolean): void {
      const entry = players.get(userId);
      if (!entry || entry.ghost === ghost) return;
      if (ghost) broadcast(entry.worldId, userId, "leave", { user_id: userId });
      entry.ghost = ghost;
      if (!ghost) broadcast(entry.worldId, userId, "update", forSnapshot(entry.player, now()));
    },

    /** Swap a member's avatar (a new outfit) after the route has saved it, so
     * everyone nearby sees the change without waiting for them to re-enter. */
    setAvatar(userId: string, avatar: PresencePlayer["avatar"]): void {
      const entry = players.get(userId);
      if (!entry) return;
      entry.player = { ...entry.player, avatar };
      if (isVisible(entry)) broadcast(entry.worldId, userId, "update", entry.player);
    },

    /** Swap the flower on a member's head after the route has saved it, so
     * everyone nearby sees it at once. A ghost's hat is kept but never sent. */
    setHat(userId: string, hat: PresencePlayer["hat"]): void {
      const entry = players.get(userId);
      if (!entry) return;
      entry.player = { ...entry.player, hat };
      if (isVisible(entry)) broadcast(entry.worldId, userId, "update", entry.player);
    },

    /** A block made or lifted between two members, after the route has saved
     * it. Each one's open streams start or stop hearing about the other, with
     * a `leave` or an `update` so the world changes at once, not on reload. */
    setBlocked(a: string, b: string, blocked: boolean): void {
      const t = now();
      for (const [viewer, other] of [
        [a, b],
        [b, a],
      ]) {
        const entry = players.get(other);
        for (const subs of subscribers.values()) {
          for (const sub of [...subs]) {
            if (sub.userId !== viewer) continue;
            sub.hidden ??= new Set();
            if (blocked) sub.hidden.add(other);
            else sub.hidden.delete(other);
            if (!entry || entry.worldId !== sub.worldId || !isVisible(entry)) continue;
            try {
              if (blocked) sub.send("leave", { user_id: other });
              else sub.send("update", forSnapshot(entry.player, t));
            } catch {
              removeSubscriber(sub);
            }
          }
        }
      }
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
        if (sub.hidden?.has(userId)) continue;
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

// Finished visits feed the admin metrics. Visits still open when the process
// stops (a deploy or a restart) are lost, which undercounts by a few minutes
// per deploy: accepted rather than persisting open visits.
export function presenceHub(): PresenceHub {
  globalForPresence.presenceHub ??= createPresenceHub({
    onVisitEnd: (userId, seconds) => void recordWorldTime(userId, seconds),
  });
  return globalForPresence.presenceHub;
}
