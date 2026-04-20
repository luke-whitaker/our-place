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

  function drawBody(ctx: CanvasRenderingContext2D, dir: Direction, frame: 0 | 1) {
    const { hairStyle, skinTone, shirtColor, pantsColor, shoesColor } = config;
    const hairColor = darkenColor(skinTone, 0.35);

    // Head / hair
    ctx.fillStyle = hairColor;
    ctx.fillRect(4, 0, 8, 4);

    if (hairStyle === "long") {
      ctx.fillRect(3, 3, 2, 5);
      ctx.fillRect(11, 3, 2, 5);
    }

    // Face
    ctx.fillStyle = skinTone;
    if (dir === DIR.DOWN) {
      ctx.fillRect(5, 3, 6, 4);
      ctx.fillStyle = PAL.darkest;
      ctx.fillRect(6, 4, 1, 1);
      ctx.fillRect(9, 4, 1, 1);
    } else if (dir === DIR.UP) {
      ctx.fillRect(5, 3, 6, 3);
      ctx.fillStyle = hairColor;
      ctx.fillRect(5, 3, 6, 1);
    } else if (dir === DIR.LEFT) {
      ctx.fillRect(4, 3, 5, 4);
      ctx.fillStyle = PAL.darkest;
      ctx.fillRect(5, 4, 1, 1);
    } else {
      ctx.fillRect(7, 3, 5, 4);
      ctx.fillStyle = PAL.darkest;
      ctx.fillRect(10, 4, 1, 1);
    }

    // Shirt
    ctx.fillStyle = shirtColor;
    ctx.fillRect(4, 7, 8, 4);

    // Arms
    const armShift = frame === 1 ? 1 : 0;
    ctx.fillStyle = skinTone;
    ctx.fillRect(3, 7 + armShift, 1, 3);
    ctx.fillRect(12, 8 - armShift, 1, 3);

    // Pants
    ctx.fillStyle = pantsColor;
    ctx.fillRect(5, 11, 3, 3);
    ctx.fillRect(8, 11, 3, 3);

    // Shoes
    ctx.fillStyle = shoesColor;
    if (frame === 0) {
      ctx.fillRect(5, 14, 3, 2);
      ctx.fillRect(8, 14, 3, 2);
    } else {
      ctx.fillRect(4, 14, 3, 2);
      ctx.fillRect(9, 14, 3, 2);
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
