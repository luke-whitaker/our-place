// Putting the map on screen: one offscreen canvas holding the whole world map
// with its fog (recomposed only when the visited chunks change), and the two
// ways it's drawn from there, the minimap crop around the player and the full
// map. Browser-only; the pixels themselves come from the pure map-image.ts.

import { buildMapPixels, composeMap, tileToMapPx, type MapPixels } from "./map-image";
import type { ChunkGrid } from "./map-chunks";
import type { IsoWorld } from "./world-model";

/** The shrine markers' color: the brand mushroom's pink. */
export const SHRINE_COLOR = "#e86fa8";
const PLAYER_COLOR = "#ffffff";
const OUTLINE = "#1d1d24";
/** What shows past the map's edges. */
const EDGE_COLOR = "#16161c";

export class MapCanvas {
  readonly world: IsoWorld;
  readonly pixels: MapPixels;
  readonly canvas: HTMLCanvasElement;
  private readonly image: ImageData;
  private composedVersion = -1;

  constructor(world: IsoWorld, grid: ChunkGrid) {
    this.world = world;
    this.pixels = buildMapPixels(world, grid);
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.pixels.width;
    this.canvas.height = this.pixels.height;
    this.image = new ImageData(this.pixels.width, this.pixels.height);
  }

  /** Re-lay the fog when the visited chunks have changed since last time. */
  refresh(visited: Uint8Array, version: number): void {
    if (version === this.composedVersion) return;
    composeMap(this.pixels, visited, this.image.data);
    this.canvas.getContext("2d")?.putImageData(this.image, 0, 0);
    this.composedVersion = version;
  }

  /** Discovered shrines in map pixels, for markers and labels. */
  shrineSpots(
    discovered: ReadonlySet<string>,
  ): { id: string; label: string; x: number; y: number }[] {
    return this.world.mushrooms
      .filter((m) => discovered.has(m.id))
      .map((m) => ({ id: m.id, label: m.label, ...tileToMapPx(this.world, m.col, m.row) }));
  }
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = OUTLINE;
  ctx.fillRect(Math.round(x - r - 1), Math.round(y - r - 1), r * 2 + 2, r * 2 + 2);
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
}

/**
 * The minimap: a crop of the map centred on the player, `zoom` device pixels
 * per map pixel. The crop moves in whole map pixels so the map stays crisp;
 * the player's dot sits at its exact spot inside it.
 */
export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  map: MapCanvas,
  player: { col: number; row: number },
  discovered: ReadonlySet<string>,
  zoom: number,
): void {
  const { width, height } = ctx.canvas;
  const at = tileToMapPx(map.world, player.col, player.row);
  const srcW = width / zoom;
  const srcH = height / zoom;
  const sx = Math.round(at.x - srcW / 2);
  const sy = Math.round(at.y - srcH / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = EDGE_COLOR;
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(
    map.canvas,
    -sx * zoom,
    -sy * zoom,
    map.canvas.width * zoom,
    map.canvas.height * zoom,
  );
  const unit = Math.max(1, Math.round(zoom / 2));
  for (const spot of map.shrineSpots(discovered)) {
    dot(ctx, (spot.x - sx) * zoom, (spot.y - sy) * zoom, unit + 1, SHRINE_COLOR);
  }
  dot(ctx, (at.x - sx) * zoom, (at.y - sy) * zoom, unit + 1, PLAYER_COLOR);
}

/** The full map, scaled `scale` device pixels per map pixel, with the
 * player's dot and a marker at each discovered shrine (the panel labels
 * them in the DOM). */
export function drawFullMap(
  ctx: CanvasRenderingContext2D,
  map: MapCanvas,
  player: { col: number; row: number },
  discovered: ReadonlySet<string>,
  scale: number,
): void {
  const { width, height } = ctx.canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(map.canvas, 0, 0, map.canvas.width * scale, map.canvas.height * scale);
  const unit = Math.max(2, Math.round(scale * 1.5));
  for (const spot of map.shrineSpots(discovered)) {
    dot(ctx, spot.x * scale, spot.y * scale, unit, SHRINE_COLOR);
  }
  const at = tileToMapPx(map.world, player.col, player.row);
  dot(ctx, at.x * scale, at.y * scale, unit, PLAYER_COLOR);
}
