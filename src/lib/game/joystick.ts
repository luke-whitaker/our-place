// Virtual joystick geometry: a stick offset (screen px from center) → the set
// of arrow keys it would hold on a keyboard. Pure so the touch component and
// its tests share one source of truth for "which way is the thumb pointing."

/** Fraction of the stick's radius that counts as centered, so a resting thumb doesn't drift. */
export const JOYSTICK_DEAD_ZONE = 0.25;

// Screen-space offset → arrow keys, one entry per 45-degree sector. Sector 0 is
// centered on +x (right); sectors advance clockwise because canvas/screen y
// points down, matching the atan2(dy, dx) convention used below and in
// vectorToDir8 (character-sheet.ts), which this mirrors for keys instead of a
// sprite facing.
const SECTOR_KEYS: readonly (readonly string[])[] = [
  ["ArrowRight"],
  ["ArrowDown", "ArrowRight"],
  ["ArrowDown"],
  ["ArrowDown", "ArrowLeft"],
  ["ArrowLeft"],
  ["ArrowUp", "ArrowLeft"],
  ["ArrowUp"],
  ["ArrowUp", "ArrowRight"],
];

/** Which arrow keys a stick offset holds: one of eight 45-degree sectors centered on the
 * cardinal and diagonal screen directions, or none inside the dead zone. dy < 0 is up. */
export function joystickKeys(dx: number, dy: number, radius: number): string[] {
  const distance = Math.hypot(dx, dy);
  if (distance < radius * JOYSTICK_DEAD_ZONE) return [];

  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  const index = ((sector % 8) + 8) % 8;
  return [...SECTOR_KEYS[index]];
}
