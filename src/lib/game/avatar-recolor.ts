// Palette-swap recoloring for the BossNelNel character sheets.
//
// The sheet paints each body part with its own small color ramp (measured from
// long.png — 20 opaque colors total). Recoloring maps every ramp step onto the
// user's chosen color scaled by that step's luminance ratio to the ramp's base,
// so the pixel-art shading survives any target color. Black outlines and eye
// whites are not in any ramp and never change.

import type { AvatarConfig } from "@/lib/types";

type RecolorablePart = "hair" | "skin" | "shirt" | "pants" | "shoes";

/**
 * Source ramp per part, exactly as painted in the sheet. The first entry is
 * the part's dominant paint (most pixels) — it becomes the ramp base, so the
 * color the user picks is the color they mostly see. Shadow steps scale
 * darker, highlight steps slightly brighter (clamped).
 */
const SHEET_RAMPS: Record<RecolorablePart, readonly string[]> = {
  hair: ["#592d07", "#280b03", "#390d01", "#824c1e", "#b56732", "#621904"],
  skin: ["#ecd9b8", "#d39b5f", "#ffd5bf"],
  // #eabcd6 is absent on purpose: it was the cheek blush, and listing it here
  // once made blush track the shirt colour — pick a blue shirt, get blue
  // cheeks. Our copies of both sheets now have the blush painted out to the
  // base skin color, so there is no cheek color left to recolor; keep it out
  // of every ramp so it can't come back if an unedited sheet ever lands here.
  shirt: ["#e9a5e2", "#bf7bd3", "#885dc1", "#cebccb"],
  pants: ["#3654bf", "#0f0996"],
  shoes: ["#4d4d4d", "#2d2c2c", "#574949"],
};

const PART_FIELD: Record<RecolorablePart, keyof AvatarConfig> = {
  hair: "hairColor",
  skin: "skinTone",
  shirt: "shirtColor",
  pants: "pantsColor",
  shoes: "shoesColor",
};

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function luminance([r, g, b]: Rgb): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function packRgb([r, g, b]: Rgb): number {
  return (r << 16) | (g << 8) | b;
}

/**
 * Source-color → target-color lookup for one avatar config, keyed by packed
 * 24-bit RGB. Pure. A part with an unparseable color is left out of the map,
 * so those pixels keep the sheet's original paint.
 */
export function buildRecolorMap(config: AvatarConfig): Map<number, Rgb> {
  const map = new Map<number, Rgb>();
  for (const part of Object.keys(SHEET_RAMPS) as RecolorablePart[]) {
    const target = hexToRgb(String(config[PART_FIELD[part]]));
    if (!target) continue;
    const ramp = SHEET_RAMPS[part].map((c) => hexToRgb(c) as Rgb);
    const baseLum = luminance(ramp[0]) || 1;
    for (const src of ramp) {
      const k = luminance(src) / baseLum;
      map.set(packRgb(src), [
        Math.min(255, Math.round(target[0] * k)),
        Math.min(255, Math.round(target[1] * k)),
        Math.min(255, Math.round(target[2] * k)),
      ]);
    }
  }
  return map;
}

/**
 * Whether a stored `users.avatar` JSON blob is a usable AvatarConfig. Every
 * avatar was written through updateAvatarSchema, but the column is untyped
 * JSON — verify before trusting it at a render boundary.
 */
export function isAvatarConfig(value: unknown): value is AvatarConfig {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return Object.values(PART_FIELD).every(
    (field) => typeof record[field] === "string" && hexToRgb(record[field] as string) !== null,
  );
}

/** Every color the sheets paint with: the ramps, plus outline black and the
 * shoe highlight white, which never change. */
const SHEET_PALETTE: readonly Rgb[] = [...Object.values(SHEET_RAMPS).flat(), "#000000", "#ffffff"]
  .map(hexToRgb)
  .filter((c): c is Rgb => c !== null);

/**
 * How far a read-back pixel may stray from a palette color and still count as
 * it. Anti-fingerprinting protection (Firefox's, Brave's, Safari's) adds noise
 * to canvas reads: in Luke's Firefox about 12% of pixels came back one step
 * off, so an exact lookup missed them and they kept the sheet's pink shirt and
 * blue pants. The palette's closest pair (two shoe shades) is 10 apart, so a
 * margin of 2 can never mistake one paint for another.
 */
export const READBACK_TOLERANCE = 2;

/** Above this share of unrecognizable pixels the read is noise (a browser that
 * scrambles canvas reads outright), not the sheet. */
const MAX_UNKNOWN_SHARE = 0.01;

/** The palette color within READBACK_TOLERANCE of a read-back pixel, or null. */
function snapToPalette(r: number, g: number, b: number): Rgb | null {
  for (const c of SHEET_PALETTE) {
    const d = Math.max(Math.abs(c[0] - r), Math.abs(c[1] - g), Math.abs(c[2] - b));
    if (d <= READBACK_TOLERANCE) return c;
  }
  return null;
}

/**
 * Recolor RGBA pixels in place and report how many opaque pixels matched no
 * palette color. Pure, so it's tested without a canvas. The sheets have no
 * partial alpha, so alpha snaps to 0 or 255: noise that lifts a transparent
 * pixel to alpha 1 would otherwise be written back as a faint speck. Every
 * matched pixel is written as a clean palette or target color, so no noise
 * survives into the baked sheet.
 */
export function recolorPixels(px: Uint8ClampedArray, map: Map<number, Rgb>): number {
  // Keyed by the packed read color; noise makes at most a few hundred variants.
  const resolved = new Map<number, Rgb | null>();
  let unknown = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 128) {
      px.fill(0, i, i + 4);
      continue;
    }
    px[i + 3] = 255;
    const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
    let out = resolved.get(key);
    if (out === undefined) {
      const clean = snapToPalette(px[i], px[i + 1], px[i + 2]);
      out = clean ? (map.get(packRgb(clean)) ?? clean) : null;
      resolved.set(key, out);
    }
    if (out === null) {
      unknown++;
      continue;
    }
    px[i] = out[0];
    px[i + 1] = out[1];
    px[i + 2] = out[2];
  }
  return unknown;
}

/**
 * Bake a recolored copy of a character sheet. One pass over the sheet's pixels
 * at load time; the game loop never pays for this. Throws when the read-back
 * pixels are mostly noise, so loadCharacterSheet falls back to drawing the
 * sheet in its own colors rather than baking static into the character.
 */
export function recolorSheet(img: HTMLImageElement, config: AvatarConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const unknown = recolorPixels(imageData.data, buildRecolorMap(config));
  if (unknown > (imageData.data.length / 4) * MAX_UNKNOWN_SHARE) {
    throw new Error(`Canvas read-back is noise (${unknown} unrecognized pixels)`);
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
