// Actors in the iso world and the movement seam that drives them.
//
// Two deliberate splits keep this ready for multiplayer without building any of
// it yet (decided June 26):
//   • Entities are a collection. The local player is just one IsoEntity; remote
//     players are more of the same, so update/render never special-case "me".
//   • Movement is computeIntent → applyMovement. The client reads input into an
//     intent; applyMovement turns that intent into a validated, collision-resolved
//     position. A server can later run applyMovement to stay authoritative — it
//     never needs the keyboard, only the intent.

import { screenToTile } from "./iso";
import { resolveMove } from "./iso-collision";
import { vectorToDir8 } from "./character-sheet";
import type { SolidGrid } from "./iso-collision";
import type { Dir8 } from "./character-sheet";
import type { InputManager } from "./input";

/** On-screen movement speed (px/tick). Kept in screen space so velocity feels
 * constant in every direction; converted to a tile delta before it's stored. */
export const PLAYER_SPEED = 1.8;

/** A thing that lives in the world at a tile position. The local player is one of
 * these; remote players (later) share the type, so nothing downstream special-
 * cases the local one. Position is world-space — the projection never leaks in. */
export interface IsoEntity {
  id: string;
  col: number;
  row: number;
  dir: Dir8;
  moving: boolean;
  animTimer: number;
  /** Name drawn above the sprite; absent for an anonymous actor. */
  label?: string;
}

export function createEntity(id: string, col: number, row: number, label?: string): IsoEntity {
  return { id, col, row, dir: "S", moving: false, animTimer: 0, label };
}

/** What an actor wants to do this tick, as a screen-space direction. Each
 * component is in {-1,0,1}; {0,0} means "no movement". This is the unit that a
 * client would send to a server — direction only, never a raw position. */
export interface MoveIntent {
  sx: number;
  sy: number;
}

/** Read held keys into an intent. The only input-aware step; everything after it
 * works from the intent alone. */
export function computeIntent(input: Pick<InputManager, "isDown">): MoveIntent {
  let sx = 0;
  let sy = 0;
  if (input.isDown("ArrowUp") || input.isDown("KeyW")) sy -= 1;
  if (input.isDown("ArrowDown") || input.isDown("KeyS")) sy += 1;
  if (input.isDown("ArrowLeft") || input.isDown("KeyA")) sx -= 1;
  if (input.isDown("ArrowRight") || input.isDown("KeyD")) sx += 1;
  return { sx, sy };
}

/**
 * Advance an entity by an intent, resolving collision against the solid grid.
 * The intent is a screen-space direction (what feels natural at the keyboard);
 * we normalize it, scale to a constant on-screen speed, convert that screen
 * velocity to a tile-space delta (screenToTile is linear, so it maps deltas),
 * and slide against the grid. Position stays canonical in tile space. Mutates the
 * entity in place — the same call is safe to run on a server.
 */
export function applyMovement(grid: SolidGrid, entity: IsoEntity, intent: MoveIntent): void {
  const { sx, sy } = intent;
  if (sx === 0 && sy === 0) {
    entity.moving = false;
    entity.animTimer = 0;
    return;
  }

  const len = Math.hypot(sx, sy);
  const delta = screenToTile((sx / len) * PLAYER_SPEED, (sy / len) * PLAYER_SPEED);
  const moved = resolveMove(grid, entity.col, entity.row, delta.col, delta.row);

  entity.col = moved.col;
  entity.row = moved.row;
  entity.dir = vectorToDir8(sx, sy) ?? entity.dir;
  entity.moving = true;
  entity.animTimer++;
}
