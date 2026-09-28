// One member's live presence in one world: the roster of everyone else, the
// stream that feeds it, the throttled posts of our own position, and the
// character art other members are drawn in. Plain TypeScript; use-presence.ts
// gives it a React lifecycle, and the game loop calls `frame` once per frame.

import type { AvatarConfig, Emote, PresenceMoveBody } from "@/lib/types";
import { apiFetch } from "@/lib/api-client";
import { TICK_RATE } from "./constants";
import { characterSheetPath, loadCharacterSheet, type CharacterSprites } from "./character-sheet";
import { worldAsset } from "./asset-url";
import { createEntity } from "./iso-actor";
import { getLocalEntity, showToast, type IsoState, type PresenceFrame } from "./iso-engine";
import { connectPresence, createPresenceSender, type PresenceEvent } from "./presence-client";
import {
  applyPlayer,
  createRoster,
  emoteAt,
  poseAt,
  removePlayer,
  type Roster,
} from "./remote-players";

/** Entity ids for other members, so they can never collide with "local". */
const REMOTE_PREFIX = "remote:";

// ── Other members' character art ──
// Every member wears their own colors and hair, which means a palette-swapped
// sheet per distinct avatar. Kept across worlds (a door shouldn't reload
// everyone), bounded, and evicted oldest-first.

const MAX_SHEETS = 32;
const sheets = new Map<string, { sprites: CharacterSprites | null }>();

/** The sheet for an avatar once loaded, else null (draw the default meanwhile).
 * The first call starts the load; a failed load stays null, so that member
 * keeps the default art rather than retrying every frame. */
function sheetFor(avatar: AvatarConfig): CharacterSprites | null {
  const key = JSON.stringify(avatar);
  const hit = sheets.get(key);
  if (hit) return hit.sprites;
  if (sheets.size >= MAX_SHEETS) {
    const oldest = sheets.keys().next().value;
    if (oldest !== undefined) sheets.delete(oldest);
  }
  const entry: { sprites: CharacterSprites | null } = { sprites: null };
  sheets.set(key, entry);
  loadCharacterSheet(worldAsset(characterSheetPath(avatar.hairStyle)), avatar)
    .then((sprites) => {
      entry.sprites = sprites;
    })
    .catch((err) => {
      // The member stays in the default art, which is a visible, harmless state.
      console.error("Presence sheet load error:", err);
    });
  return null;
}

// ── The session ──

export interface PresenceSession {
  /** Sync other members into the state and post our own position. Returns what
   * the renderer needs this frame. */
  frame: (state: IsoState, now: number) => PresenceFrame;
  /** Show an emote over the local player now, and tell everyone else. */
  emote: (kind: Emote, state: IsoState | null) => void;
  close: () => void;
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    // A lapsed session shouldn't yank a member out of the world mid-walk; the
    // stream's down notice covers it, and the next page load asks them to log in.
    redirectOnUnauthorized: false,
  });
}

/**
 * Start presence in a world. `getState` reads the engine's current state (it
 * is rebuilt on arrival), so stream notices land on whatever is showing.
 */
export function startPresence(worldId: string, getState: () => IsoState | null): PresenceSession {
  const roster: Roster = createRoster();
  const sprites = new Map<string, CharacterSprites>();
  const emotes = new Map<string, { kind: Emote; age: number }>();
  let localEmote: { kind: Emote; startedAt: number } | null = null;
  let lastFrameAt: number | null = null;

  const sender = createPresenceSender(
    (body: PresenceMoveBody) => postJson("/api/presence", body),
    () => performance.now(),
  );

  function onEvent(event: PresenceEvent) {
    const now = performance.now();
    const wallNow = Date.now();
    if (event.type === "snapshot") {
      // A snapshot is the whole picture: anyone missing from it has gone.
      roster.clear();
      for (const p of event.players) applyPlayer(roster, p, now, wallNow);
    } else if (event.type === "update") {
      applyPlayer(roster, event.player, now, wallNow);
    } else {
      removePlayer(roster, event.userId);
    }
  }

  const close = connectPresence(worldId, {
    onEvent,
    onStatus: (up) => {
      const state = getState();
      if (!state) return;
      showToast(
        state,
        up ? "Back in touch with other members" : "Lost touch with other members for now",
      );
    },
  });

  function syncRemotes(state: IsoState, now: number, dt: number) {
    const seen = new Set<string>();
    for (const player of roster.values()) {
      const pose = poseAt(player, now);
      if (!pose) continue;
      const id = REMOTE_PREFIX + player.userId;
      seen.add(id);
      let entity = state.entities.find((e) => e.id === id);
      if (!entity) {
        entity = createEntity(id, pose.col, pose.row, player.label);
        state.entities.push(entity);
      }
      entity.col = pose.col;
      entity.row = pose.row;
      entity.dir = pose.dir;
      entity.label = player.label;
      // Frames advance on the simulation's clock, as the local walk cycle does.
      entity.animTimer = pose.moving ? entity.animTimer + dt / TICK_RATE : 0;
      entity.moving = pose.moving;
      const sheet = player.avatar ? sheetFor(player.avatar) : null;
      if (sheet) sprites.set(id, sheet);
      else sprites.delete(id);
      const shown = emoteAt(player.emote, now);
      if (shown) emotes.set(id, shown);
      else emotes.delete(id);
    }
    // Drop anyone who left, in place, only when someone actually did.
    const stale = state.entities.some((e) => e.id.startsWith(REMOTE_PREFIX) && !seen.has(e.id));
    if (stale) {
      state.entities = state.entities.filter(
        (e) => !e.id.startsWith(REMOTE_PREFIX) || seen.has(e.id),
      );
      for (const id of sprites.keys()) if (!seen.has(id)) sprites.delete(id);
      for (const id of emotes.keys()) if (id !== state.localId && !seen.has(id)) emotes.delete(id);
    }
  }

  return {
    frame(state, now) {
      const dt = lastFrameAt === null ? 0 : now - lastFrameAt;
      lastFrameAt = now;
      const local = getLocalEntity(state);
      sender.tick({
        world_id: worldId,
        col: local.col,
        row: local.row,
        dir: local.dir,
        moving: local.moving,
      });
      syncRemotes(state, now, dt);
      const mine = emoteAt(localEmote, now);
      if (mine) emotes.set(state.localId, mine);
      else emotes.delete(state.localId);
      return { sprites, emotes };
    },
    emote(kind, state) {
      localEmote = { kind, startedAt: performance.now() };
      postJson("/api/presence/emote", { world_id: worldId, emote: kind }).catch(() => {
        // Everyone else missed it; say so where the member is looking.
        if (state) showToast(state, "Couldn't send that emote");
      });
    },
    close,
  };
}
