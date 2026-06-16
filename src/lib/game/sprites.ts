import { TILE, PAL, DIR } from "./constants";
import type { Direction } from "./constants";
import type { AvatarConfig } from "@/lib/types";
import { DEFAULT_AVATAR } from "@/lib/types";

export function generatePlayerSprites(
  config: AvatarConfig = DEFAULT_AVATAR,
): Record<Direction, [HTMLCanvasElement, HTMLCanvasElement]> {
  function make(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    return c;
  }

  // Drawn at ~28px tall, centered in the 32px cell with the feet near the bottom —
  // big enough to read clearly at the world's zoom. Colors still come from the
  // avatar config so per-user customization is preserved.
  function drawBody(ctx: CanvasRenderingContext2D, dir: Direction, frame: 0 | 1) {
    const { hairStyle, skinTone, shirtColor, pantsColor, shoesColor } = config;
    // Hair color is a direct avatar choice; avatars saved before hairColor existed
    // fall back to the old skin-derived shade so they render unchanged.
    const hairColor = config.hairColor || darkenColor(skinTone, 0.35);
    const step = frame === 1 ? 1 : 0;

    // ── Legs + shoes (behind the torso) ──
    ctx.fillStyle = pantsColor;
    ctx.fillRect(11, 21, 4, 7 + step);
    ctx.fillRect(17, 21, 4, 7 - step);
    ctx.fillStyle = shoesColor;
    ctx.fillRect(10, 28 + step, 5, 3);
    ctx.fillRect(17, 28 - step, 5, 3);

    // ── Torso + arms (arms swing with the step) ──
    ctx.fillStyle = shirtColor;
    ctx.fillRect(10, 13, 12, 9);
    ctx.fillStyle = skinTone;
    ctx.fillRect(7, 14 + step, 3, 6);
    ctx.fillRect(22, 14 - step, 3, 6);

    // ── Head + hair ──
    ctx.fillStyle = skinTone;
    ctx.fillRect(10, 5, 12, 9);
    ctx.fillStyle = hairColor;
    ctx.fillRect(9, 2, 14, 4);
    if (hairStyle === "long") {
      ctx.fillRect(8, 4, 2, 9);
      ctx.fillRect(22, 4, 2, 9);
    }

    // ── Face (per direction) ──
    if (dir === DIR.DOWN) {
      ctx.fillStyle = PAL.darkest;
      ctx.fillRect(13, 9, 2, 2);
      ctx.fillRect(18, 9, 2, 2);
    } else if (dir === DIR.UP) {
      // Back of the head — hair covers the face
      ctx.fillStyle = hairColor;
      ctx.fillRect(10, 5, 12, 5);
    } else if (dir === DIR.LEFT) {
      ctx.fillStyle = hairColor;
      ctx.fillRect(19, 5, 4, 8);
      ctx.fillStyle = PAL.darkest;
      ctx.fillRect(12, 9, 2, 2);
    } else {
      ctx.fillStyle = hairColor;
      ctx.fillRect(9, 5, 4, 8);
      ctx.fillStyle = PAL.darkest;
      ctx.fillRect(18, 9, 2, 2);
    }
  }

  const sprites = {} as Record<Direction, [HTMLCanvasElement, HTMLCanvasElement]>;

  for (const dir of [DIR.DOWN, DIR.UP, DIR.LEFT, DIR.RIGHT]) {
    sprites[dir] = [make((ctx) => drawBody(ctx, dir, 0)), make((ctx) => drawBody(ctx, dir, 1))];
  }

  return sprites;
}

function darkenColor(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const darken = (c: number) =>
    Math.round(c * (1 - amount))
      .toString(16)
      .padStart(2, "0");
  return `#${darken(r)}${darken(g)}${darken(b)}`;
}
