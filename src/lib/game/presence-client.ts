// The wire half of live presence on the client: reading the stream of other
// members, and sending our own position. See src/lib/types/presence.ts for the
// contract. Nothing here touches the engine; use-presence.ts wires it in.

import { z } from "zod";
import { EMOTES, PRESENCE_DIRS } from "@/lib/types";
import type { PresenceMoveBody, PresencePlayer } from "@/lib/types";
import { isAvatarConfig } from "./avatar-recolor";

// ── Reading the stream ──

const playerSchema = z.object({
  user_id: z.string().min(1),
  username: z.string(),
  display_name: z.string(),
  avatar: z.unknown(),
  col: z.number().finite(),
  row: z.number().finite(),
  dir: z.enum(PRESENCE_DIRS),
  moving: z.boolean(),
  emote: z.enum(EMOTES).nullable(),
  emote_at: z.number().finite().nullable(),
});

/** A stream event this client understands. */
export type PresenceEvent =
  | { type: "snapshot"; players: PresencePlayer[] }
  | { type: "update"; player: PresencePlayer }
  | { type: "leave"; userId: string };

function toPlayer(raw: z.infer<typeof playerSchema>): PresencePlayer {
  // An avatar that isn't a valid config draws in the default colors rather
  // than failing the whole event.
  return { ...raw, avatar: isAvatarConfig(raw.avatar) ? raw.avatar : null };
}

/**
 * Parse one SSE event, or null when it's malformed or of an unknown type. The
 * stream keeps going either way: one bad event must never cost the rest.
 */
export function parsePresenceEvent(type: string, data: string): PresenceEvent | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  if (type === "snapshot") {
    const parsed = z.object({ players: z.array(z.unknown()) }).safeParse(json);
    if (!parsed.success) return null;
    // Keep every well-formed player even if one in the list is broken.
    const players = parsed.data.players.flatMap((p) => {
      const one = playerSchema.safeParse(p);
      return one.success ? [toPlayer(one.data)] : [];
    });
    return { type: "snapshot", players };
  }
  if (type === "update") {
    const parsed = playerSchema.safeParse(json);
    return parsed.success ? { type: "update", player: toPlayer(parsed.data) } : null;
  }
  if (type === "leave") {
    const parsed = z.object({ user_id: z.string().min(1) }).safeParse(json);
    return parsed.success ? { type: "leave", userId: parsed.data.user_id } : null;
  }
  return null;
}

/** How long the stream may stay down before we tell the member, in ms. */
export const DOWN_NOTICE_MS = 15_000;
/** Delay before our own reconnect once EventSource gives up for good (it does
 * on an HTTP error, rather than retrying), doubling up to the cap. */
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30_000;
/** Our own reconnect attempts per visit to a world. Past this the stream stays
 * closed until the member moves to another world or reloads. */
const MAX_RECONNECTS = 10;

export interface PresenceStreamHandlers {
  onEvent: (event: PresenceEvent) => void;
  /** Fired once when the stream has been down DOWN_NOTICE_MS, and once when it
   * comes back after that. Short blips say nothing. */
  onStatus: (up: boolean) => void;
}

/**
 * Open the presence stream for one world and keep it open. EventSource retries
 * dropped connections by itself; it gives up only on an HTTP error, so we
 * retry those ourselves with a capped backoff. Returns a close function.
 */
export function connectPresence(worldId: string, handlers: PresenceStreamHandlers): () => void {
  const url = `/api/presence/stream?world=${encodeURIComponent(worldId)}`;
  let source: EventSource | null = null;
  let closed = false;
  let reconnects = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let downTimer: ReturnType<typeof setTimeout> | null = null;
  let announcedDown = false;

  function markDown() {
    if (downTimer || announcedDown) return;
    downTimer = setTimeout(() => {
      downTimer = null;
      announcedDown = true;
      handlers.onStatus(false);
    }, DOWN_NOTICE_MS);
  }

  function markUp() {
    if (downTimer) clearTimeout(downTimer);
    downTimer = null;
    reconnects = 0;
    if (announcedDown) {
      announcedDown = false;
      handlers.onStatus(true);
    }
  }

  function listen(type: string) {
    source?.addEventListener(type, (e) => {
      const event = parsePresenceEvent(type, (e as MessageEvent<string>).data);
      if (event) handlers.onEvent(event);
    });
  }

  function open() {
    if (closed) return;
    source = new EventSource(url);
    source.onopen = markUp;
    source.onerror = () => {
      markDown();
      if (source?.readyState !== EventSource.CLOSED || closed) return;
      // EventSource won't retry this one (an HTTP error, e.g. a 403 or a
      // deploy restarting the server), so schedule our own attempt.
      source = null;
      if (reconnects >= MAX_RECONNECTS) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnects, RECONNECT_MAX_MS);
      reconnects++;
      reconnectTimer = setTimeout(open, delay);
    };
    listen("snapshot");
    listen("update");
    listen("leave");
  }

  open();
  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (downTimer) clearTimeout(downTimer);
    source?.close();
    source = null;
  };
}

// ── Sending our position ──

/** Minimum gap between position posts, in ms. */
export const SEND_INTERVAL_MS = 150;
/** Post even when nothing changed this often, so the server knows we're here. */
export const KEEPALIVE_MS = 10_000;

export interface PresenceSender {
  /** Call every frame with the local player's state; posts when it should. */
  tick: (body: PresenceMoveBody) => void;
  /** Posts that failed since the last success. */
  failures: () => number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sameMove(a: PresenceMoveBody, b: PresenceMoveBody): boolean {
  return (
    a.world_id === b.world_id &&
    a.col === b.col &&
    a.row === b.row &&
    a.dir === b.dir &&
    a.moving === b.moving
  );
}

/**
 * Throttle position posts: at most one every SEND_INTERVAL_MS and only on a
 * change, plus a keepalive every KEEPALIVE_MS. A post never overlaps another;
 * a tick that lands mid-flight is dropped, not queued, and the next tick
 * sends whatever is current. Stopping is itself a change (moving turns
 * false), so the final standing position always goes out.
 */
export function createPresenceSender(
  post: (body: PresenceMoveBody) => Promise<unknown>,
  now: () => number,
): PresenceSender {
  let inFlight = false;
  let lastSent: PresenceMoveBody | null = null;
  let lastSentAt = -Infinity;
  let failures = 0;

  return {
    tick(raw) {
      if (inFlight) return;
      const body = { ...raw, col: round2(raw.col), row: round2(raw.row) };
      const t = now();
      const changed = !lastSent || !sameMove(body, lastSent);
      if (changed ? t - lastSentAt < SEND_INTERVAL_MS : t - lastSentAt < KEEPALIVE_MS) return;
      inFlight = true;
      lastSent = body;
      lastSentAt = t;
      post(body)
        .then(() => {
          failures = 0;
        })
        .catch(() => {
          // Counted, not thrown: the stream's down notice tells the member.
          // Forgetting what we sent makes the next tick try again.
          failures++;
          lastSent = null;
        })
        .finally(() => {
          inFlight = false;
        });
    },
    failures: () => failures,
  };
}
