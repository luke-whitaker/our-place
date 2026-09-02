// Biome variants by recoloring the Evergrow art at load time.
//
// The pack ships one forest palette. Instead of buying a sheet per biome, a
// preset shifts pixels in HSL space. Pixel color alone cannot tell a tree from
// a wall (Evergrow paints foliage and building shadows in the same cool,
// desaturated teal-greens), so the caller says what kind of art it is tinting:
//
//   ground    the terrain sheets: the yellow-green grass band recolors, the
//             dirt skirt and water get the gentler "rest" adjustment
//   nature    trees, bushes, rocks, shrines: the cool foliage band recolors,
//             trunks and rocks get "rest"; evergreens can opt out of a biome's
//             foliage change (pines stay green in autumn)
//   building  houses: only the preset's scene lighting, so a red roof is still
//             red in autumn and only darkens at dusk
//
// Like avatar-recolor.ts this is one pass per image at load; the game loop
// never pays for it. The presets are a starting palette: tune by eye.

export type TintPreset = "forest" | "autumn" | "snow" | "dusk" | "swamp" | "scorched";

export const TINT_PRESETS: readonly TintPreset[] = [
  "forest",
  "autumn",
  "snow",
  "dusk",
  "swamp",
  "scorched",
];

export type TintTarget = "ground" | "nature" | "evergreen" | "building";

/**
 * One HSL adjustment. `hue` shifts in degrees; `setHue` instead pins the hue
 * to a target, keeping a fraction (`spread`) of each pixel's distance from the
 * band centre so shading still varies. `sat`/`light` multiply, the *Add
 * fields add, results clamp to [0, 1].
 */
interface Adjust {
  hue?: number;
  setHue?: number;
  spread?: number;
  sat?: number;
  satAdd?: number;
  light?: number;
  lightAdd?: number;
}

interface TintSpec {
  grass: Adjust;
  foliage: Adjust;
  /** Foliage adjustment for evergreens; defaults to `foliage`. */
  evergreen?: Adjust;
  rest: Adjust;
  /** Global lighting applied to buildings (and nothing else). */
  scene: Adjust;
}

const IDENTITY: Adjust = {};

// Measured from the sheets: ground grass sits at hue 75–110 with saturation
// 0.27–0.55; foliage at hue 120–220 with saturation 0.12–0.23; trunks, dirt,
// and roofs at hue 0–40; rocks and outlines are near-gray.
const GRASS = { min: 50, max: 170, centre: 95, minSat: 0.18 };
const FOLIAGE = { min: 90, max: 235, centre: 170, minSat: 0.08 };

const SPECS: Record<TintPreset, TintSpec> = {
  forest: { grass: IDENTITY, foliage: IDENTITY, rest: IDENTITY, scene: IDENTITY },
  // Golden-orange ground, orange-red canopies, pines untouched, dirt a touch warmer.
  autumn: {
    grass: { hue: -55, sat: 0.95 },
    foliage: { setHue: 24, spread: 0.3, sat: 2.6, satAdd: 0.12, light: 1.08 },
    evergreen: IDENTITY,
    rest: { hue: -5, light: 0.97 },
    scene: IDENTITY,
  },
  // Pale blue-white ground, frosted canopies, everything else washed out.
  snow: {
    grass: { setHue: 210, spread: 0.2, sat: 0.12, lightAdd: 0.38 },
    foliage: { sat: 0.6, light: 1.1, lightAdd: 0.08 },
    rest: { sat: 0.55, lightAdd: 0.14 },
    scene: { sat: 0.92, lightAdd: 0.03 },
  },
  // The whole scene cooler and darker: evening in the same place.
  dusk: {
    grass: { hue: 25, sat: 0.8, light: 0.7 },
    foliage: { hue: 25, sat: 0.8, light: 0.7 },
    rest: { hue: 25, sat: 0.75, light: 0.7 },
    scene: { hue: 25, sat: 0.75, light: 0.7 },
  },
  // Olive, murky, a little dim.
  swamp: {
    grass: { hue: -30, sat: 0.65, light: 0.78 },
    foliage: { setHue: 95, spread: 0.3, sat: 1.6, light: 0.85 },
    rest: { hue: 5, sat: 0.65, light: 0.85 },
    scene: IDENTITY,
  },
  // Dead grass, dusty ground, dry brown leaves on every tree.
  scorched: {
    grass: { hue: -75, sat: 0.4, light: 0.7 },
    foliage: { setHue: 32, spread: 0.3, sat: 1.5, light: 0.72 },
    rest: { sat: 0.6, light: 0.8 },
    scene: IDENTITY,
  },
};

export function isTintPreset(value: unknown): value is TintPreset {
  return typeof value === "string" && (TINT_PRESETS as readonly string[]).includes(value);
}

/** RGB 0–255 → HSL with hue in degrees [0, 360) and sat/light in [0, 1]. */
export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const light = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return [0, 0, light];

  const sat = delta / (1 - Math.abs(2 * light - 1));
  let hue: number;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return [hue, sat, light];
}

/** Inverse of {@link rgbToHsl}; output channels are rounded to 0–255. */
export function hslToRgb(hue: number, sat: number, light: number): [number, number, number] {
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const hp = (((hue % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hp < 1) [rn, gn, bn] = [c, x, 0];
  else if (hp < 2) [rn, gn, bn] = [x, c, 0];
  else if (hp < 3) [rn, gn, bn] = [0, c, x];
  else if (hp < 4) [rn, gn, bn] = [0, x, c];
  else if (hp < 5) [rn, gn, bn] = [x, 0, c];
  else [rn, gn, bn] = [c, 0, x];
  const m = light - c / 2;
  return [Math.round((rn + m) * 255), Math.round((gn + m) * 255), Math.round((bn + m) * 255)];
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

type Band = { min: number; max: number; centre: number; minSat: number };

function inBand(band: Band, hue: number, sat: number): boolean {
  return hue >= band.min && hue <= band.max && sat >= band.minSat;
}

function applyAdjust(
  adjust: Adjust,
  band: Band | null,
  hue: number,
  sat: number,
  light: number,
): [number, number, number] {
  const newHue =
    adjust.setHue !== undefined
      ? adjust.setHue + (hue - (band?.centre ?? hue)) * (adjust.spread ?? 0)
      : hue + (adjust.hue ?? 0);
  return hslToRgb(
    newHue,
    clamp01(sat * (adjust.sat ?? 1) + (adjust.satAdd ?? 0)),
    clamp01(light * (adjust.light ?? 1) + (adjust.lightAdd ?? 0)),
  );
}

/** Which adjustment and band a pixel gets for a target. */
function pick(spec: TintSpec, target: TintTarget, hue: number, sat: number): [Adjust, Band | null] {
  if (target === "building") return [spec.scene, null];
  if (target === "ground") {
    return inBand(GRASS, hue, sat) ? [spec.grass, GRASS] : [spec.rest, null];
  }
  if (!inBand(FOLIAGE, hue, sat)) return [spec.rest, null];
  const foliage = target === "evergreen" ? (spec.evergreen ?? spec.foliage) : spec.foliage;
  return [foliage, FOLIAGE];
}

/**
 * Apply a preset to RGBA pixel data in place. Pure over the array, so it is
 * unit-tested without a canvas. Fully transparent pixels are left alone.
 */
export function tintPixels(px: Uint8ClampedArray, preset: TintPreset, target: TintTarget): void {
  if (preset === "forest") return;
  const spec = SPECS[preset];
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const [hue, sat, light] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    const [adjust, band] = pick(spec, target, hue, sat);
    const [r, g, b] = applyAdjust(adjust, band, hue, sat, light);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
}

/**
 * A tinted copy of an image as a canvas, or the image itself for the forest
 * preset so the untouched path stays exactly what ships today.
 */
export function tintImage(
  img: HTMLImageElement,
  preset: TintPreset,
  target: TintTarget,
): HTMLImageElement | HTMLCanvasElement {
  if (preset === "forest") return img;
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  tintPixels(imageData.data, preset, target);
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Like {@link tintImage}, but resolves to an <img>, for callers typed to
 * HTMLImageElement (the engine's sheet assets). The round trip through a data
 * URL happens once at load.
 */
export function tintToImage(
  img: HTMLImageElement,
  preset: TintPreset,
  target: TintTarget,
): Promise<HTMLImageElement> {
  const source = tintImage(img, preset, target);
  if (source instanceof HTMLImageElement) return Promise.resolve(source);
  return new Promise((resolve, reject) => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.onerror = () => reject(new Error("Tinted sheet failed to load"));
    out.src = source.toDataURL();
  });
}
