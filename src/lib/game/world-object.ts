// World objects: free-standing sprites (trees, bushes, rocks, houses…) that sit
// on a tile and depth-sort against the player. Each sprite is anchored at the
// bottom-centre of its opaque content — the point that rests on the ground — so
// it slots into the painter's-order sort by that anchor's screen-Y. Loaded out of
// git like the other art (see CREDITS.md).

import { tileToScreen } from "./iso";
import { newWorldImage } from "./asset-url";

export interface ObjectSprite {
  img: HTMLImageElement;
  /** Opaque-content bottom-centre, in DRAW pixels — the ground contact point. */
  anchorX: number;
  anchorY: number;
  /** On-canvas size: image size × the catalog's draw-time scale. */
  drawW: number;
  drawH: number;
}

export interface PlacedObject {
  sprite: ObjectSprite;
  col: number;
  row: number;
}

export function loadObjectSprite(src: string, scale = 1): Promise<ObjectSprite> {
  return new Promise((resolve, reject) => {
    const img = newWorldImage(src);
    img.onload = () => {
      const anchor = baseAnchor(img);
      resolve({
        img,
        anchorX: anchor.anchorX * scale,
        anchorY: anchor.anchorY * scale,
        drawW: img.width * scale,
        drawH: img.height * scale,
      });
    };
    img.onerror = () => reject(new Error(`Failed to load object sprite: ${src}`));
    img.src = src;
  });
}

// Scan the alpha channel for the opaque bounding box; anchor at its bottom-centre.
// Reads pixels via getImageData, so cross-origin art must be CORS-enabled (see
// newWorldImage) or this throws on a tainted canvas.
function baseAnchor(img: HTMLImageElement): { anchorX: number; anchorY: number } {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, img.width, img.height);

  let minX = img.width;
  let maxX = 0;
  let maxY = 0;
  let found = false;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (data[(y * img.width + x) * 4 + 3] > 8) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return { anchorX: img.width / 2, anchorY: img.height };
  return { anchorX: (minX + maxX) / 2, anchorY: maxY + 1 };
}

/** Painter's-order key: the screen-Y of the object's ground tile. */
export function objectDepth(o: PlacedObject): number {
  return tileToScreen(o.col, o.row).y;
}

/** Draw a placed object with its base anchored on its tile. */
export function drawObject(
  ctx: CanvasRenderingContext2D,
  o: PlacedObject,
  camX: number,
  camY: number,
): void {
  const s = tileToScreen(o.col, o.row);
  ctx.drawImage(
    o.sprite.img,
    Math.round(s.x - o.sprite.anchorX - camX),
    Math.round(s.y - o.sprite.anchorY - camY),
    o.sprite.drawW,
    o.sprite.drawH,
  );
}
