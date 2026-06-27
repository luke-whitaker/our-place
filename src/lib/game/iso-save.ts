// Per-device world save (localStorage): last position + discovered shrines, for
// the iso world. The iso analog of world-save.ts — same idea, but positions are
// world-space tile coords (col,row), not top-down pixels. SAVE_VERSION is bumped
// to 2 so any old top-down save is ignored cleanly rather than mis-read.
//
// Still a stopgap until player position is bound to identity in the DB (see the
// README roadmap) — at which point this becomes a server read/write behind the
// same shape.

import { isSolidAt, type SolidGrid } from "./iso-collision";

const SAVE_KEY = "ourplace.world.save";
const SAVE_VERSION = 2;

export interface IsoSave {
  version: number;
  col: number;
  row: number;
  discovered: string[];
}

export function loadIsoSave(): IsoSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as IsoSave;
    if (save.version !== SAVE_VERSION) return null;
    if (typeof save.col !== "number" || typeof save.row !== "number") return null;
    if (!Array.isArray(save.discovered)) return null;
    return save;
  } catch {
    return null;
  }
}

export function persistIsoSave(col: number, row: number, discovered: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const save: IsoSave = { version: SAVE_VERSION, col, row, discovered: [...discovered] };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or unavailable — losing the save is acceptable.
  }
}

/** A saved position is usable only if it lands in-bounds on a walkable tile
 * (isSolidAt treats out-of-bounds as solid, so this covers both checks). */
export function isValidIsoPosition(solid: SolidGrid, col: number, row: number): boolean {
  return !isSolidAt(solid, col, row);
}
