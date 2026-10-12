// Keepsake Mushrooms, the pure rules shared by the server (which gives them)
// and the world client (which asks when a guest comes near): which color comes
// next, and which Event Mushrooms a player standing somewhere is close to.

import { KEEPSAKE_COLORS, type KeepsakeColor } from "./plants";

/** How close, in tiles, a guest must come to the Event Mushroom. */
export const KEEPSAKE_REACH_TILES = 4;

/** The next keepsake's color: a coin flip for the first, then the other
 * color from the one before. `random` returns [0, 1), so tests can pin it. */
export function nextKeepsakeColor(
  previous: string | null,
  random: () => number = Math.random,
): KeepsakeColor {
  if (previous === null) return random() < 0.5 ? KEEPSAKE_COLORS[0] : KEEPSAKE_COLORS[1];
  return previous === KEEPSAKE_COLORS[0] ? KEEPSAKE_COLORS[1] : KEEPSAKE_COLORS[0];
}

/** The gatherings whose mushroom stands within reach of (col, row), that this
 * player may open, and that aren't waiting: `waitUntil` holds when each one
 * already asked about may be asked again (Infinity once settled). */
export function keepsakesInReach(
  mushrooms: readonly { gatheringId: string; col: number; row: number; invited: boolean }[],
  col: number,
  row: number,
  waitUntil: ReadonlyMap<string, number>,
  now: number,
): string[] {
  return mushrooms
    .filter(
      (m) =>
        m.invited &&
        (waitUntil.get(m.gatheringId) ?? 0) <= now &&
        Math.hypot(m.col - col, m.row - row) <= KEEPSAKE_REACH_TILES,
    )
    .map((m) => m.gatheringId);
}
