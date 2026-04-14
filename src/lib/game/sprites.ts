import { TILE, PAL, DIR } from "./constants";
import type { Direction } from "./constants";

/**
 * Generate player sprite sheet: 4 directions × 2 walk frames = 8 canvases.
 * Accessed as sprites[direction][frame].
 */
export function generatePlayerSprites(): Record<Direction, [HTMLCanvasElement, HTMLCanvasElement]> {
  function make(draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = TILE;
    c.height = TILE;
    const ctx = c.getContext("2d")!;
    draw(ctx);
    return c;
  }

  function drawBody(ctx: CanvasRenderingContext2D, dir: Direction, frame: 0 | 1) {
    // Head / hair
    ctx.fillStyle = PAL.hair;
    ctx.fillRect(4, 0, 8, 4);

    // Face
    ctx.fillStyle = PAL.skin;
    if (dir === DIR.DOWN) {
      ctx.fillRect(5, 3, 6, 4);
      // Eyes
      ctx.fillStyle = PAL.darkest;
      ctx.fillRect(6, 4, 1, 1);
      ctx.fillRect(9, 4, 1, 1);
    } else if (dir === DIR.UP) {
      ctx.fillRect(5, 3, 6, 3);
      // Hair covers face
      ctx.fillStyle = PAL.hair;
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
    ctx.fillStyle = PAL.shirt;
    ctx.fillRect(4, 7, 8, 4);

    // Arms (shift with walk frame)
    const armShift = frame === 1 ? 1 : 0;
    ctx.fillStyle = PAL.skin;
    ctx.fillRect(3, 7 + armShift, 1, 3);
    ctx.fillRect(12, 8 - armShift, 1, 3);

    // Pants
    ctx.fillStyle = PAL.pants;
    ctx.fillRect(5, 11, 3, 3);
    ctx.fillRect(8, 11, 3, 3);

    // Legs (alternate with walk frame)
    ctx.fillStyle = PAL.shoes;
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
