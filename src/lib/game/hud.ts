// Overworld HUD chrome — the interaction prompt, the region/discovery toast, and
// the warp menu — drawn at native resolution (not the zoomed world layer) so text
// stays crisp. The iso engine draws through here; engine.ts keeps its own copies
// until it retires (Phase 4), at which point this is the single home for the
// chrome. Lifted verbatim from engine.ts so the look is pixel-identical.
//
// These are generic: they take strings/entries, not a game-state type, so any
// engine can call them with its own state shape.

import { CANVAS_W, CANVAS_H, PAL } from "./constants";

/** Bottom-centre "Press Enter — …" interaction prompt. */
export function drawPrompt(ctx: CanvasRenderingContext2D, text: string): void {
  const textW = text.length * 5.5 + 16;
  const boxX = Math.round(CANVAS_W / 2 - textW / 2);
  const boxY = CANVAS_H - 28;

  ctx.fillStyle = PAL.textBg;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(boxX, boxY, textW, 20);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textW, 20);

  ctx.fillStyle = PAL.textColor;
  ctx.font = "10px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, CANVAS_W / 2, boxY + 10);
  ctx.textAlign = "start";
}

/** A member's name floating above their sprite: light text with a dark outline
 * so it reads over grass, water, and roofs alike. (x, y) is the tag's
 * bottom-centre in native pixels. */
export function drawNameTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = "bold 11px monospace";
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
): void {
  // Fade out over the final half second.
  const alpha = Math.min(1, toast.ticksLeft / 30);
  const textW = toast.text.length * 7 + 28;
  const boxX = Math.round(CANVAS_W / 2 - textW / 2);
  const boxY = 16;

  ctx.globalAlpha = alpha * 0.85;
  ctx.fillStyle = PAL.textBg;
  ctx.fillRect(boxX, boxY, textW, 26);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX, boxY, textW, 26);

  ctx.fillStyle = PAL.textColor;
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(toast.text, CANVAS_W / 2, boxY + 13);
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
): void {
  const rowH = 22;
  const titleH = 30;
  const padding = 12;
  const longest = Math.max(title.length, ...entries.map((e) => e.length));
  const boxW = longest * 7 + padding * 2 + 20;
  const boxH = titleH + entries.length * rowH + padding;
  const boxX = Math.round(CANVAS_W / 2 - boxW / 2);
  const boxY = Math.round(CANVAS_H / 2 - boxH / 2);

  // Dim the world behind the menu.
  ctx.fillStyle = PAL.darkest;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = PAL.textBg;
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = PAL.textBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  ctx.fillStyle = PAL.lightest;
  ctx.font = "bold 12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(title, CANVAS_W / 2, boxY + titleH / 2 + 2);

  ctx.font = "11px monospace";
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
