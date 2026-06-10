import { TILE } from "./constants";
import { SOLID_TILES } from "./types";
import type { GameMap } from "./types";

/**
 * Per-device world save (localStorage): last position + discovered shrines.
 * A stopgap until player position is bound to identity in the DB
 * (see README roadmap). Versioned so the shape can change safely.
 */

const SAVE_KEY = "ourplace.world.save";
const SAVE_VERSION = 1;

export interface WorldSave {
  version: number;
  x: number;
  y: number;
  discovered: string[];
}

export function loadWorldSave(): WorldSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as WorldSave;
    if (save.version !== SAVE_VERSION) return null;
    if (typeof save.x !== "number" || typeof save.y !== "number") return null;
    if (!Array.isArray(save.discovered)) return null;
    return save;
  } catch {
    return null;
  }
}

export function persistWorldSave(x: number, y: number, discovered: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    const save: WorldSave = {
      version: SAVE_VERSION,
      x,
      y,
      discovered: [...discovered],
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage full or unavailable — losing the save is acceptable
  }
}

/** A saved position is only usable if it lands in-bounds on a walkable tile. */
export function isValidPosition(map: GameMap, x: number, y: number): boolean {
  const col = Math.floor((x + TILE / 2) / TILE);
  const row = Math.floor((y + TILE / 2) / TILE);
  if (col < 0 || col >= map.cols || row < 0 || row >= map.rows) return false;
  return !SOLID_TILES.has(map.tiles[row][col]);
}
