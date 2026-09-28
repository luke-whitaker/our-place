// Emote bubbles: a small pixel icon in a white speech bubble over a member's
// head. Drawn for Our Place as ASCII maps (one character per pixel), ported
// from ~/Desktop/pixel_art/tools/emotes.py; keep the two in step. They're
// painted with fillRect in the HUD layer, so there's no image to load or upload.

import type { Emote } from "@/lib/types";

const PAL: Record<string, string> = {
  o: "#2a2230", // outline, and the laugh's eyes and mouth
  k: "#2a2230",
  w: "#ffffff",
  r: "#e03c5a",
  h: "#ffb8c8",
  y: "#f6d04a",
  g: "#d89818",
  Y: "#fff4b0",
  p: "#e880b0",
  P: "#a84a8a",
  q: "#f3c89a",
  b: "#4a7ad8",
};

const ICONS: Record<Emote, readonly string[]> = {
  heart: [
    "..oo...oo..",
    ".orro.orro.",
    "orhrrorrrro",
    "orrrrrrrrro",
    "orrrrrrrrro",
    ".orrrrrrro.",
    "..orrrrro..",
    "...orrro...",
    "....oro....",
    ".....o.....",
  ],
  laugh: [
    "...ooooo...",
    "..oyyyyyo..",
    ".oyyyyyyyo.",
    "oyykyyykyyo",
    "oyykyyykyyo",
    "oyyyyyyyyyo",
    "oykkkkkkkyo",
    ".oykrrrkyo.",
    "..oykkkyo..",
    "...ooooo...",
  ],
  mushroom: [
    "...ooooo...",
    ".oopppppoo.",
    "ophpppppPPo",
    "opppppppPPo",
    "oyyyyyyyyyo",
    ".oooqqqooo.",
    "...oqqqo...",
    "...oqqqo...",
    "...oqqqo...",
    "...ooooo...",
  ],
  wow: [
    "..ooo..",
    "..oro..",
    "..oro..",
    "..oro..",
    "..oro..",
    "..ooo..",
    ".......",
    "..ooo..",
    "..oro..",
    "..ooo..",
  ],
  question: [
    "..ooooo..",
    ".obbbbbo.",
    "obbooobbo",
    "ooo..obbo",
    "....obbo.",
    "...obbo..",
    "...ooo...",
    "...ooo...",
    "...obo...",
    "...ooo...",
  ],
  sparkle: [
    "...g.......",
    "..gYg......",
    ".gYYYg...g.",
    "..gYg...gYg",
    "...g.....g.",
    "......g....",
    ".....gyg...",
    "....gyYyg..",
    ".....gyg...",
    "......g....",
  ],
};

/** A bubble as a grid of colors (null = transparent), built once per emote. */
export interface BubbleArt {
  w: number;
  h: number;
  /** Row-major, w * h entries. */
  pixels: (string | null)[];
}

const PAD = 2;
// Rows the tail adds below the bubble: one white, then its point.
const TAIL = 2;

/**
 * The bubble around an icon: white, a 1 px dark outline with clipped corners,
 * and a small tail pointing down at the member's head, as in emotes.py.
 */
export function bubbleArt(emote: Emote): BubbleArt {
  const icon = ICONS[emote];
  const iconW = Math.max(...icon.map((r) => r.length));
  const bw = iconW + PAD * 2 + 2;
  const bh = icon.length + PAD * 2 + 2;
  const w = bw;
  const h = bh + TAIL;
  const pixels: (string | null)[] = new Array(w * h).fill(null);
  const set = (x: number, y: number, c: string | null) => {
    pixels[y * w + x] = c;
  };
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const corner = (x === 0 || x === bw - 1) && (y === 0 || y === bh - 1);
      if (corner) continue;
      const edge =
        x === 0 ||
        x === bw - 1 ||
        y === 0 ||
        y === bh - 1 ||
        ((x === 1 || x === bw - 2) && (y === 1 || y === bh - 2));
      set(x, y, edge ? PAL.o : PAL.w);
    }
  }
  // The tail, narrowing as it drops: two white rows inside an outline, then a point.
  const cx = Math.floor(bw / 2);
  [2, 1, 0].forEach((half, i) => {
    for (let x = cx - half - 1; x <= cx + half + 1; x++) {
      const inside = x >= cx - half && x <= cx + half;
      set(x, bh - 1 + i, inside && i < 2 ? PAL.w : PAL.o);
    }
  });
  icon.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PAL[row[x]];
      if (c) set(PAD + 1 + x, PAD + 1 + y, c);
    }
  });
  return { w, h, pixels };
}

const ART_CACHE = new Map<Emote, BubbleArt>();

function cachedArt(emote: Emote): BubbleArt {
  let art = ART_CACHE.get(emote);
  if (!art) {
    art = bubbleArt(emote);
    ART_CACHE.set(emote, art);
  }
  return art;
}

/** CSS px per art pixel in the HUD layer. */
export const EMOTE_SCALE = 2;
/** The pop-in and fade-out, in ms. */
const POP_MS = 150;
const FADE_MS = 300;

/**
 * Paint a bubble with its tail's tip at (x, bottom), in the HUD's CSS-px
 * layer. `age` and `lifetime` drive a quick pop (a short rise and fade in)
 * and a fade out at the end. Horizontal runs of one color share a fillRect.
 */
export function drawEmoteBubble(
  ctx: CanvasRenderingContext2D,
  emote: Emote,
  x: number,
  bottom: number,
  age: number,
  lifetime: number,
): void {
  const art = cachedArt(emote);
  const s = EMOTE_SCALE;
  const pop = Math.min(1, age / POP_MS);
  const alpha = Math.min(pop, Math.max(0, (lifetime - age) / FADE_MS), 1);
  const left = Math.round(x - (art.w * s) / 2);
  const top = Math.round(bottom - art.h * s + (1 - pop) * 6);
  ctx.globalAlpha = alpha;
  for (let y = 0; y < art.h; y++) {
    let x0 = 0;
    while (x0 < art.w) {
      const c = art.pixels[y * art.w + x0];
      let x1 = x0 + 1;
      while (x1 < art.w && art.pixels[y * art.w + x1] === c) x1++;
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(left + x0 * s, top + y * s, (x1 - x0) * s, s);
      }
      x0 = x1;
    }
  }
  ctx.globalAlpha = 1;
}
