// Per-device world save (localStorage): last position + discovered shrines,
// one slot per world so the Capital and a member's island never overwrite
// each other. Positions are world-space tile coords (col,row). SAVE_VERSION
// guards the shape: an older save is ignored rather than mis-read.
//
// Still a stopgap until player position is bound to identity in the DB (see
// the README roadmap) — at which point this becomes a server read/write behind
// the same shape.

import { isSolidAt, type SolidGrid } from "./iso-collision";
import { CORE_OFFSET } from "./worlds/wilds/layout";

const SAVE_KEY_PREFIX = "ourplace.world.save:";
/** The pre-islands single-slot key; removed on sight so it never lingers. */
const LEGACY_SAVE_KEY = "ourplace.world.save";
const SAVE_VERSION = 4;

/** Version 3 saves predate the Capital growing into a bigger map (September
 * 2026), which moved the old Capital by CORE_OFFSET. A version 3 save for a
 * world listed here shifts by its offset; any other version 3 save (islands,
 * houses, rooms) is still exactly right as it is. */
const V3_SHIFT: Record<string, { col: number; row: number }> = { capital: CORE_OFFSET };

export interface IsoSave {
  version: number;
  col: number;
  row: number;
  discovered: string[];
}

function saveKey(worldId: string): string {
  return `${SAVE_KEY_PREFIX}${worldId}`;
}

export function loadIsoSave(worldId: string): IsoSave | null {
  if (typeof window === "undefined") return null;
  try {
    window.localStorage.removeItem(LEGACY_SAVE_KEY);
    const raw = window.localStorage.getItem(saveKey(worldId));
    if (!raw) return null;
    const save = JSON.parse(raw) as IsoSave;
    if (typeof save.col !== "number" || typeof save.row !== "number") return null;
    if (!Array.isArray(save.discovered)) return null;
    if (save.version === SAVE_VERSION) return save;
    if (save.version !== 3) return null;
    const shift = V3_SHIFT[worldId] ?? { col: 0, row: 0 };
    return { ...save, version: SAVE_VERSION, col: save.col + shift.col, row: save.row + shift.row };
  } catch {
    return null;
  }
}

export function persistIsoSave(
  worldId: string,
  col: number,
  row: number,
  discovered: Set<string>,
): void {
  if (typeof window === "undefined") return;
  try {
    const save: IsoSave = { version: SAVE_VERSION, col, row, discovered: [...discovered] };
    window.localStorage.setItem(saveKey(worldId), JSON.stringify(save));
  } catch {
    // Storage full or unavailable — losing the save is acceptable.
  }
}

/** A saved position is usable only if it lands in-bounds on a walkable tile
 * (isSolidAt treats out-of-bounds as solid, so this covers both checks). */
export function isValidIsoPosition(solid: SolidGrid, col: number, row: number): boolean {
  return !isSolidAt(solid, col, row);
}
