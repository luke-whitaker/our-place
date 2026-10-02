// The world map's pixels, worked out from the world document alone (no art):
// each tile becomes a 2x1 pixel run in the same isometric orientation as the
// screen, so up on the map is up on screen. Pure: it fills typed arrays, and
// the components put them on a canvas. Built once per world load; fog is laid
// over it with composeMap whenever the member's visited chunks change.

import { biomeAt } from "./biomes";
import { chunkOf, isVisited, type ChunkGrid } from "./map-chunks";
import { OBJECT_CATALOG, type IsoWorld } from "./world-model";
import type { TintPreset } from "./terrain-tint";

/** What a map pixel shows. Small solid props (lamps, crates) and shrines are
 * left out: the ground under them reads better at this size, and shrines get
 * their own markers once discovered. */
export type MapTile = "none" | "water" | "sand" | "path" | "dirt" | "grass" | "tree" | "building";

type Rgb = readonly [number, number, number];

const FIXED_COLORS: Record<Exclude<MapTile, "grass" | "tree" | "none">, Rgb> = {
  water: [58, 110, 168],
  sand: [227, 207, 151],
  path: [196, 168, 118],
  dirt: [138, 106, 72],
  building: [176, 112, 96],
};

/** Ground and trees by biome, so the snowy north and the autumn south-west
 * read as different places at a glance. */
const BIOME_COLORS: Record<TintPreset, { grass: Rgb; tree: Rgb }> = {
  forest: { grass: [92, 138, 66], tree: [44, 82, 40] },
  autumn: { grass: [168, 122, 62], tree: [128, 66, 34] },
  snow: { grass: [222, 230, 236], tree: [94, 124, 112] },
  dusk: { grass: [70, 88, 108], tree: [40, 52, 68] },
  swamp: { grass: [86, 98, 58], tree: [46, 58, 36] },
  scorched: { grass: [112, 80, 56], tree: [66, 44, 30] },
};

export function tileColor(tile: Exclude<MapTile, "none">, biome: TintPreset): Rgb {
  if (tile === "grass" || tile === "tree") return BIOME_COLORS[biome][tile];
  return FIXED_COLORS[tile];
}

/** Fogged ground: the same picture, grey and dim, so unexplored places keep
 * their shape but give nothing away. */
export function fogColor([r, g, b]: Rgb): Rgb {
  const grey = Math.round((0.3 * r + 0.59 * g + 0.11 * b) * 0.35 + 30);
  return [grey, grey, grey + 6];
}

/** Every tile's class, row-major. Buildings cover their whole footprint;
 * trees and logs their own tile. Bounded by the world's tiles and objects. */
export function classifyTiles(world: IsoWorld): MapTile[] {
  const tiles: MapTile[] = [];
  for (let row = 0; row < world.rows; row++) {
    for (let col = 0; col < world.cols; col++) {
      const terrain = world.terrain[row][col];
      tiles.push(terrain === "void" ? "none" : terrain);
    }
  }
  for (const obj of world.objects) {
    const def = OBJECT_CATALOG[obj.kind];
    if (!def?.solid) continue;
    const isTree = def.tint === "nature" || def.tint === "evergreen";
    const isBuilding = def.tint === "building" && def.footprint.length > 1;
    if (!isTree && !isBuilding) continue;
    for (const { dc, dr } of def.footprint) {
      const col = obj.col + dc;
      const row = obj.row + dr;
      if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) continue;
      const i = row * world.cols + col;
      if (tiles[i] !== "none" && tiles[i] !== "water") tiles[i] = isTree ? "tree" : "building";
    }
  }
  return tiles;
}

export function mapSize(world: Pick<IsoWorld, "cols" | "rows">): { width: number; height: number } {
  return { width: world.cols + world.rows, height: Math.ceil((world.cols + world.rows) / 2) };
}

/** A tile's centre in map pixels: the screen's 2:1 projection at 1/16 scale.
 * Continuous, so a walking player's dot glides; the quarter-pixel offset keeps
 * every whole tile inside the pixel row buildMapPixels paints it on. */
export function tileToMapPx(
  world: Pick<IsoWorld, "rows">,
  col: number,
  row: number,
): { x: number; y: number } {
  return { x: col - row + world.rows, y: (col + row) / 2 + 0.25 };
}

export interface MapPixels {
  width: number;
  height: number;
  /** RGBA, explored look. */
  base: Uint8ClampedArray;
  /** RGBA, fogged look. */
  fog: Uint8ClampedArray;
  /** Which chunk each pixel shows, or -1 where there is no ground. */
  chunkAt: Int32Array;
}

/** Paint every tile as a 2x1 run at its projected spot, in row-major order.
 * Neighbouring runs overlap by a pixel, which closes every gap. */
export function buildMapPixels(world: IsoWorld, grid: ChunkGrid): MapPixels {
  const { width, height } = mapSize(world);
  const base = new Uint8ClampedArray(width * height * 4);
  const fog = new Uint8ClampedArray(width * height * 4);
  const chunkAt = new Int32Array(width * height).fill(-1);
  const tiles = classifyTiles(world);
  for (let row = 0; row < world.rows; row++) {
    for (let col = 0; col < world.cols; col++) {
      const tile = tiles[row * world.cols + col];
      if (tile === "none") continue;
      const color = tileColor(tile, biomeAt(world, col, row));
      const fogged = fogColor(color);
      const x0 = col - row + world.rows - 1;
      const y = Math.floor((col + row) / 2);
      const chunk = chunkOf(grid, col, row);
      for (let x = x0; x <= x0 + 1; x++) {
        const p = y * width + x;
        base.set([color[0], color[1], color[2], 255], p * 4);
        fog.set([fogged[0], fogged[1], fogged[2], 255], p * 4);
        chunkAt[p] = chunk;
      }
    }
  }
  return { width, height, base, fog, chunkAt };
}

/** The map as the member sees it: explored pixels from `base`, the rest from
 * `fog`, written into `out` (RGBA, same size). Runs only when the visited
 * chunks change, not every frame. */
export function composeMap(pixels: MapPixels, visited: Uint8Array, out: Uint8ClampedArray): void {
  const { base, fog, chunkAt } = pixels;
  for (let p = 0; p < chunkAt.length; p++) {
    const src = isVisited(visited, chunkAt[p]) ? base : fog;
    const i = p * 4;
    out[i] = src[i];
    out[i + 1] = src[i + 1];
    out[i + 2] = src[i + 2];
    out[i + 3] = src[i + 3];
  }
}
