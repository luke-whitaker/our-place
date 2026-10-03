// Where a flower hat sits: on the crown of whatever frame is being drawn.
// Worked out from the frame's own pixels, so it follows every facing, both
// hair styles, and the bob of the walk cycle without a table of offsets.

import type { FlowerColor } from "./plants";

/** How far the flower sinks into the hair, in world px, so it reads as worn
 * rather than balanced on top. */
export const HAT_SINK = 4;

/** Alpha above this counts as a pixel. Privacy-hardened browsers add noise to
 * canvas reads (see avatar-recolor.ts), and nearly transparent noise must
 * never be mistaken for the top of a head. */
const OPAQUE = 8;

/** How many rows below the top count as "the crown" when centring the flower.
 * A single top row can be one stray strand of hair. */
const CROWN_ROWS = 3;

/**
 * The crown of a sprite from its alpha channel (row-major, `w` by `h`): the
 * topmost row with a pixel, and the middle of the pixels in that row and the
 * next few. Null for an empty frame.
 */
export function crownFromAlpha(
  alpha: ArrayLike<number>,
  w: number,
  h: number,
): { x: number; y: number } | null {
  let top = -1;
  for (let y = 0; y < h && top < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > OPAQUE) {
        top = y;
        break;
      }
    }
  }
  if (top < 0) return null;
  let minX = w;
  let maxX = -1;
  for (let y = top; y < Math.min(h, top + CROWN_ROWS); y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] > OPAQUE) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  return { x: Math.round((minX + maxX + 1) / 2), y: top };
}

/** Crowns already found, per frame canvas. Frames live as long as their
 * sheet, so a WeakMap lets them go with it. */
const crowns = new WeakMap<HTMLCanvasElement, { x: number; y: number } | null>();

/** The crown of a frame canvas, read once and remembered. */
export function frameCrown(frame: HTMLCanvasElement): { x: number; y: number } | null {
  if (crowns.has(frame)) return crowns.get(frame) ?? null;
  let crown: { x: number; y: number } | null = null;
  const ctx = frame.getContext("2d");
  if (ctx) {
    const data = ctx.getImageData(0, 0, frame.width, frame.height).data;
    const alpha = new Uint8ClampedArray(frame.width * frame.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    crown = crownFromAlpha(alpha, frame.width, frame.height);
  }
  crowns.set(frame, crown);
  return crown;
}

/** The hat sprite path for a color. */
export function flowerHatPath(color: FlowerColor): string {
  return `/world/objects/flower_hat_${color}.png`;
}
