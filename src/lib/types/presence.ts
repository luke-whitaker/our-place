import type { FlowerColor } from "@/lib/game/plants";
import type { AvatarConfig } from "./game";

// The wire contract for live presence: members in the same world see each
// other move and emote. Positions go up as small POSTs; everyone else's come
// down one Server-Sent Events stream per world.
//
//   POST /api/presence          PresenceMoveBody   -> 200 { ok: true }
//   POST /api/presence/emote    PresenceEmoteBody  -> 200 { ok: true }
//   GET  /api/presence/stream?world=<world id>     -> text/event-stream
//
// Stream events (the SSE `event:` name, then JSON `data:`):
//   snapshot  { players: PresencePlayer[] }  first, everyone else already here
//   update    PresencePlayer                 someone arrived, moved, or emoted
//   leave     { user_id: string }            someone left this world
//
// A stream never includes the viewer's own player.

/** The emotes a member can show, in the order the picker lists them. */
export const EMOTES = ["heart", "laugh", "mushroom", "wow", "question", "sparkle"] as const;
export type Emote = (typeof EMOTES)[number];

/** The eight facings, matching the engine's Dir8. */
export const PRESENCE_DIRS = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"] as const;
export type PresenceDir = (typeof PRESENCE_DIRS)[number];

/** One member as other members in the same world see them. */
export interface PresencePlayer {
  user_id: string;
  username: string;
  display_name: string;
  avatar: AvatarConfig | null;
  /** The flower on their head, or null. */
  hat: FlowerColor | null;
  col: number;
  row: number;
  dir: PresenceDir;
  moving: boolean;
  /** The emote showing now, or null. */
  emote: Emote | null;
  /** When the emote was sent, in server epoch ms, so a late joiner can tell
   * whether it's still showing. Null with no emote. */
  emote_at: number | null;
}

export interface PresenceMoveBody {
  world_id: string;
  col: number;
  row: number;
  dir: PresenceDir;
  moving: boolean;
}

export interface PresenceEmoteBody {
  world_id: string;
  emote: Emote;
}

export interface PresenceSnapshotEvent {
  players: PresencePlayer[];
}

export interface PresenceLeaveEvent {
  user_id: string;
}
