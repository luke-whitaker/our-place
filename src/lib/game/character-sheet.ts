// 8-directional character sprite sheets (BossNelNel "8-Direction Top-Down
// Character Sprites" format). These replace the procedural player in `sprites.ts`
// once the isometric renderer lands; the geometry below is measured from the
// 209×326 source sheet and is shared by every character (long hair, short hair…).
//
// Sheet layout: a 9×9 grid of 23×36 cells (2px gutters) holding 21×34 sprites.
//   • Column 0      → the idle frame
//   • Columns 1–8   → the 8-frame walk cycle
//   • Rows 0–7      → the 8 compass facings (clockwise from South — see DIR8_ROW)
//   • Row 8         → a spare front frame; ignored
//
// Licensing: the raw sheets are not committed (see CREDITS.md / .gitignore); the
// runtime loads a copy served out of git (R2 in prod, a local dev copy under
// public/world/characters/).

export const SHEET = {
  cols: 9,
  rows: 9,
  cellW: 23,
  cellH: 36,
  originX: 2,
  originY: 2,
  frameW: 21,
  frameH: 34,
  idleCol: 0,
  walkCols: [1, 2, 3, 4, 5, 6, 7, 8],
} as const;

export const WALK_FRAME_COUNT = SHEET.walkCols.length; // 8

// ── Facings ──

/** The 8 compass facings, matching the iso movement diagonals. */
export type Dir8 = "S" | "SE" | "E" | "NE" | "N" | "NW" | "W" | "SW";

export const DIR8_ALL: readonly Dir8[] = ["S", "SE", "E", "NE", "N", "NW", "W", "SW"];

/**
 * Sheet row for each facing. Verified against the source art: the sheet rotates
 * clockwise from South, so row 2's profile faces East (right) and row 6's faces
 * West (left). The 4 diagonals (SE/NE/NW/SW) are the load-bearing facings for a
 * 2:1 iso grid; the cardinals fill out 8-way movement.
 */
export const DIR8_ROW: Record<Dir8, number> = {
  S: 0,
  SE: 1,
  E: 2,
  NE: 3,
  N: 4,
  NW: 5,
  W: 6,
  SW: 7,
};

// Screen-space velocity → facing. Angle increases clockwise because canvas Y
// points down, so the sectors read E, SE, S, SW, W, NW, N, NE.
const SECTOR_DIRS: readonly Dir8[] = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];

/**
 * Map a movement vector (screen space: +x right, +y down) to the nearest of the
 * 8 facings. Returns null for a zero vector (caller keeps the last facing).
 */
export function vectorToDir8(dx: number, dy: number): Dir8 | null {
  if (dx === 0 && dy === 0) return null;
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return SECTOR_DIRS[((sector % 8) + 8) % 8];
}

/** Which walk frame to show, given how long the player has been moving. */
export function walkFrameIndex(
  animTimer: number,
  ticksPerFrame: number,
  frameCount: number = WALK_FRAME_COUNT,
): number {
  return Math.floor(animTimer / ticksPerFrame) % frameCount;
}

// ── Loading & slicing ──

/** Baked, ready-to-draw frames for one character sheet, keyed by facing. */
export interface CharacterSprites {
  frameW: number;
  frameH: number;
  idle: Record<Dir8, HTMLCanvasElement>;
  walk: Record<Dir8, HTMLCanvasElement[]>;
}

/** Pick the frame to draw for the current player state. */
export function pickFrame(
  sprites: CharacterSprites,
  dir: Dir8,
  moving: boolean,
  animTimer: number,
  ticksPerFrame: number,
): HTMLCanvasElement {
  if (!moving) return sprites.idle[dir];
  return sprites.walk[dir][walkFrameIndex(animTimer, ticksPerFrame)];
}

/** Load a character sheet image and slice it into per-facing idle/walk frames. */
export function loadCharacterSheet(url: string): Promise<CharacterSprites> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(sliceSheet(img));
    img.onerror = () => reject(new Error(`Failed to load character sheet: ${url}`));
    img.src = url;
  });
}

function cut(img: HTMLImageElement, col: number, row: number): HTMLCanvasElement {
  const sx = SHEET.originX + col * SHEET.cellW;
  const sy = SHEET.originY + row * SHEET.cellH;
  const canvas = document.createElement("canvas");
  canvas.width = SHEET.frameW;
  canvas.height = SHEET.frameH;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, sx, sy, SHEET.frameW, SHEET.frameH, 0, 0, SHEET.frameW, SHEET.frameH);
  return canvas;
}

function sliceSheet(img: HTMLImageElement): CharacterSprites {
  const idle = {} as Record<Dir8, HTMLCanvasElement>;
  const walk = {} as Record<Dir8, HTMLCanvasElement[]>;

  for (const dir of DIR8_ALL) {
    const row = DIR8_ROW[dir];
    idle[dir] = cut(img, SHEET.idleCol, row);
    walk[dir] = SHEET.walkCols.map((col) => cut(img, col, row));
  }

  return { frameW: SHEET.frameW, frameH: SHEET.frameH, idle, walk };
}
