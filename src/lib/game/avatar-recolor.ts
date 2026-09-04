// Palette-swap recoloring for the BossNelNel character sheets.
//
// The sheet paints each body part with its own small color ramp (measured from
// long.png — 21 opaque colors total). Recoloring maps every ramp step onto the
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
  // #eabcd6 is deliberately absent: it is painted only on cheeks (216 px, none
  // on a torso), so listing it here made blush track the shirt colour — pick a
  // blue shirt, get blue cheeks. Off every ramp it is never recoloured, which
  // leaves cheeks pink for everyone. Moving it to `skin` would not work: a ramp
  // forces hue to the target, so it would become a plain skin shade.
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

/**
 * Bake a recolored copy of a character sheet. One pass over the sheet's pixels
 * at load time; the game loop never pays for this.
 */
export function recolorSheet(img: HTMLImageElement, config: AvatarConfig): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);

  const map = buildRecolorMap(config);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imageData.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const target = map.get((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
    if (target) {
      px[i] = target[0];
      px[i + 1] = target[1];
      px[i + 2] = target[2];
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
