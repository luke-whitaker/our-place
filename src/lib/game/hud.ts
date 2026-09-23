// Overworld HUD chrome — the interaction prompt, the region/discovery toast, and
// the warp menu — drawn in the HUD's CSS-px layer (not the zoomed world layer)
// so text stays crisp at any screen size. Each function takes the canvas's CSS
// size instead of reading a fixed constant, since WorldCanvas resizes the
// canvas to fit the screen.
//
// These are generic: they take strings/entries, not a game-state type, so any
// engine can call them with its own state shape.

import { PAL } from "./constants";

/** Canvas size in CSS px, the space every HUD element lays out in. */
export interface HudSize {
  w: number;
  h: number;
}

/** Bottom-centre "Press Enter — …" interaction prompt. */
export function drawPrompt(ctx: CanvasRenderingContext2D, text: string, size: HudSize): void {
  ctx.font = "10px monospace";
  const textW = ctx.measureText(text).width + 16;
  const boxX = Math.round(size.w / 2 - textW / 2);
  const boxY = size.h - 28;

  ctx.fillStyle = PAL.textBg;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(boxX, boxY, textW, 20);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textW, 20);

  ctx.fillStyle = PAL.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, size.w / 2, boxY + 10);
  ctx.textAlign = "start";
}

/** A member's name floating above their sprite: light text with a dark outline
 * so it reads over grass, water, and roofs alike. (x, y) is the tag's
 * bottom-centre in CSS px. */
export function drawNameTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.lineJoin = "round";
  ctx.lineWidth = 3;
  ctx.strokeStyle = PAL.textBg;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = PAL.white;
  ctx.fillText(text, x, y);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}

/** Top-centre banner (region entries, shrine discoveries, warp arrivals). */
export function drawToast(
  ctx: CanvasRenderingContext2D,
  toast: { text: string; ticksLeft: number },
  size: HudSize,
): void {
  // Fade out over the final half second.
  const alpha = Math.min(1, toast.ticksLeft / 30);
  ctx.font = "bold 14px monospace";
  const textW = ctx.measureText(toast.text).width + 28;
  const boxX = Math.round(size.w / 2 - textW / 2);
  const boxY = 16;
  const boxH = 30;

  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = PAL.textBg;
  ctx.fillRect(boxX, boxY, textW, boxH);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textW, boxH);

  ctx.fillStyle = PAL.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(toast.text, size.w / 2, boxY + boxH / 2 + 1);
  ctx.textAlign = "start";
  ctx.globalAlpha = 1;
}

/** Centered modal list (the mushroom warp network). Entries are pre-computed by
 * the caller — the last one is conventionally "Cancel". */
export function drawWarpMenu(
  ctx: CanvasRenderingContext2D,
  title: string,
  entries: string[],
  selectedIndex: number,
  size: HudSize,
): void {
  const rowH = 24;
  const titleH = 32;
  const padding = 12;
  ctx.font = "bold 14px monospace";
  const titleW = ctx.measureText(title).width;
  ctx.font = "13px monospace";
  const longestRow = Math.max(...entries.map((e) => ctx.measureText(`▶ ${e}`).width));
  const boxW = Math.round(Math.max(titleW, longestRow) + padding * 2 + 8);
  const boxH = titleH + entries.length * rowH + padding;
  const boxX = Math.round(size.w / 2 - boxW / 2);
  const boxY = Math.round(size.h / 2 - boxH / 2);

  // Dim the world behind the menu.
  ctx.fillStyle = PAL.darkest;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, size.w, size.h);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = PAL.textBg;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = PAL.lightest;
  ctx.font = "bold 14px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, size.w / 2, boxY + titleH / 2 + 2);

  ctx.font = "13px monospace";
  ctx.textAlign = "start";
  entries.forEach((label, i) => {
    const y = boxY + titleH + i * rowH + rowH / 2;
    const selected = i === selectedIndex;
    if (selected) {
      ctx.fillStyle = PAL.textBorder;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(boxX + 6, y - rowH / 2 + 2, boxW - 12, rowH - 4);
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = selected ? PAL.white : PAL.light;
    ctx.fillText(`${selected ? "▶ " : "  "}${label}`, boxX + padding, y);
  });
  ctx.textBaseline = "alphabetic";
}
