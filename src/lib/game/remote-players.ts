// Other members in the same world, as this client sees them: a roster built
// from the presence stream, and the smoothing that turns a few position
// updates a second into steady movement on a 60 fps canvas.
//
// Positions arrive 5 to 10 times a second. Drawn as they land, other players
// would jump in visible steps, which reads as broken rather than laggy. So
// every sample is stamped with the time it arrived, and each frame draws a
// player where they were INTERP_DELAY_MS ago, interpolating between the two
// samples on either side of that moment. The delay is the price of never
// having to guess ahead: by then the next sample has usually arrived.
//
// Pure: no DOM, no network, clocks passed in. The presence hook feeds it.

import type { FlowerColor } from "./plants";
import type { AvatarConfig, Emote, PresencePlayer } from "@/lib/types";
import type { Dir8 } from "./character-sheet";

/** How far in the past remote players are drawn, in ms. */
export const INTERP_DELAY_MS = 120;
/** Samples kept per player: a fixed ring, oldest dropped first. */
export const MAX_SAMPLES = 8;
/** A jump longer than this (tiles) is a door, a shrine, or a reconnect: snap to
 * it instead of gliding across the map. */
export const SNAP_TILES = 3;
/** With no new sample for this long, a player still marked moving is drawn
 * standing, so a dropped connection never leaves someone walking in place. */
export const STALE_MS = 1000;
/** How long an emote bubble shows, in ms. */
export const EMOTE_MS = 3000;
/** The most other members a roster holds. Far above any world's real crowd;
 * it only stops a misbehaving stream from growing memory without bound. */
export const MAX_REMOTE_PLAYERS = 200;

export interface RemoteSample {
  /** Client clock (ms) when the sample arrived. */
  t: number;
  col: number;
  row: number;
  dir: Dir8;
  moving: boolean;
}

export interface RemotePlayer {
  userId: string;
  label: string;
  avatar: AvatarConfig | null;
  /** The flower on their head, or null. */
  hat: FlowerColor | null;
  /** Oldest first, at most MAX_SAMPLES. */
  samples: RemoteSample[];
  /** The emote showing, with when it started on this client's clock. */
  emote: { kind: Emote; startedAt: number } | null;
  /** The server's emote_at for the last emote seen, so a repeat of the same
   * emote (carried on every later move update) never restarts the bubble. */
  lastEmoteAt: number | null;
}

export type Roster = Map<string, RemotePlayer>;

export interface RemotePose {
  col: number;
  row: number;
  dir: Dir8;
  moving: boolean;
}

export function createRoster(): Roster {
  return new Map();
}

/**
 * Record one player's state from a snapshot or an update. `now` is the client
 * clock for interpolation; `wallNow` is epoch ms, compared with the server's
 * emote_at to decide whether an emote is still showing.
 */
export function applyPlayer(roster: Roster, p: PresencePlayer, now: number, wallNow: number): void {
  const sample: RemoteSample = { t: now, col: p.col, row: p.row, dir: p.dir, moving: p.moving };
  let player = roster.get(p.user_id);
  if (!player) {
    if (roster.size >= MAX_REMOTE_PLAYERS) return;
    player = {
      userId: p.user_id,
      label: p.display_name,
      avatar: p.avatar,
      hat: p.hat,
      samples: [],
      emote: null,
      lastEmoteAt: null,
    };
    roster.set(p.user_id, player);
  }
  player.label = p.display_name;
  player.avatar = p.avatar;
  player.hat = p.hat;
  pushSample(player, sample);
  applyEmote(player, p, now, wallNow);
}

function pushSample(player: RemotePlayer, sample: RemoteSample): void {
  const last = player.samples[player.samples.length - 1];
  if (last && Math.hypot(sample.col - last.col, sample.row - last.row) > SNAP_TILES) {
    // A teleport: drop the history so nothing interpolates across the jump.
    player.samples = [sample];
    return;
  }
  player.samples.push(sample);
  if (player.samples.length > MAX_SAMPLES) player.samples.shift();
}

function applyEmote(player: RemotePlayer, p: PresencePlayer, now: number, wallNow: number): void {
  if (!p.emote || p.emote_at === null || p.emote_at === player.lastEmoteAt) return;
  player.lastEmoteAt = p.emote_at;
  // A clock behind the server's reads as a negative age: treat it as brand new.
  const age = Math.max(0, wallNow - p.emote_at);
  if (age >= EMOTE_MS) return;
  player.emote = { kind: p.emote, startedAt: now - age };
}

export function removePlayer(roster: Roster, userId: string): void {
  roster.delete(userId);
}

/** Where to draw a player at client time `now`, or null with no samples. */
export function poseAt(player: RemotePlayer, now: number): RemotePose | null {
  const { samples } = player;
  if (samples.length === 0) return null;
  const at = now - INTERP_DELAY_MS;
  const first = samples[0];
  if (at <= first.t) return poseOf(first, false);
  const last = samples[samples.length - 1];
  if (at >= last.t) return poseOf(last, now - last.t > STALE_MS);
  // Bounded by MAX_SAMPLES: find the pair either side of `at`.
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    if (b.t < at) continue;
    const a = samples[i - 1];
    const k = b.t === a.t ? 1 : (at - a.t) / (b.t - a.t);
    return {
      col: a.col + (b.col - a.col) * k,
      row: a.row + (b.row - a.row) * k,
      dir: b.dir,
      moving: a.moving || b.moving,
    };
  }
  return poseOf(last, false);
}

function poseOf(sample: RemoteSample, stale: boolean): RemotePose {
  return { col: sample.col, row: sample.row, dir: sample.dir, moving: sample.moving && !stale };
}

/** The emote a player shows at `now`, with its age in ms, or null once it ends. */
export function emoteAt(
  emote: { kind: Emote; startedAt: number } | null,
  now: number,
): { kind: Emote; age: number } | null {
  if (!emote) return null;
  const age = now - emote.startedAt;
  return age >= 0 && age < EMOTE_MS ? { kind: emote.kind, age } : null;
}
