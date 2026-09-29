// A small toolkit for authoring the wilds around the Capital: one mutable map
// (terrain, a biome per tile, placed objects) plus the stamps every region
// module shares. Everything is deterministic: noise comes from integer hashing,
// never Math.random, so every device builds the same world.

import type { PlacedObjectData, TerrainKind } from "../../world-model";
import { OBJECT_CATALOG } from "../../world-model";
import type { TintPreset } from "../../terrain-tint";

export interface WildMap {
  cols: number;
  rows: number;
  terrain: TerrainKind[][];
  /** Index into `presets`, per tile. */
  biome: number[][];
  presets: TintPreset[];
  objects: PlacedObjectData[];
  /** Tiles an object's footprint covers, so nothing is stamped twice. */
  occupied: Set<string>;
  /** Tiles the forest scatter must leave open (clearings, openings). */
  reserved: Set<string>;
}

export function createWildMap(cols: number, rows: number, presets: TintPreset[]): WildMap {
  return {
    cols,
    rows,
    terrain: Array.from({ length: rows }, () => Array.from({ length: cols }, () => "grass")),
    biome: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0)),
    presets,
    objects: [],
    occupied: new Set(),
    reserved: new Set(),
  };
}

const key = (c: number, r: number) => `${c},${r}`;

export function inBounds(map: WildMap, c: number, r: number): boolean {
  return c >= 0 && c < map.cols && r >= 0 && r < map.rows;
}

// ── Noise ──

export function hash32(c: number, r: number, seed: number): number {
  return (Math.imul(c, 374761393) ^ Math.imul(r, 668265263) ^ Math.imul(seed, 2246822519)) >>> 0;
}

/** Hash to [0, 1). */
export function rand01(c: number, r: number, seed: number): number {
  return (hash32(c, r, seed) % 10007) / 10007;
}

/** Smooth value noise in [0, 1): hashed lattice values every `scale` tiles,
 * blended bilinearly, so neighbouring tiles agree and borders wander. */
export function noise2(c: number, r: number, scale: number, seed: number): number {
  const x = c / scale;
  const y = r / scale;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const a = rand01(x0, y0, seed);
  const b = rand01(x0 + 1, y0, seed);
  const cc = rand01(x0, y0 + 1, seed);
  const d = rand01(x0 + 1, y0 + 1, seed);
  return a + (b - a) * fx + (cc - a) * fy + (a - b - cc + d) * fx * fy;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A few tiles of signed wobble for a border along one axis. */
export function wobble(x: number, amplitude: number, seed: number): number {
  return (noise2(x, 0, 9, seed) - 0.5) * 2 * amplitude;
}

// ── Terrain and biome ──

export function setTerrain(map: WildMap, c: number, r: number, kind: TerrainKind): void {
  if (inBounds(map, c, r)) map.terrain[r][c] = kind;
}

export function setBiome(map: WildMap, c: number, r: number, preset: TintPreset): void {
  if (!inBounds(map, c, r)) return;
  const index = map.presets.indexOf(preset);
  if (index < 0) throw new Error(`map-builder: preset "${preset}" isn't in this map's list`);
  map.biome[r][c] = index;
}

/** Every tile in the map, row by row: a bounded double loop callers share. */
export function forEachTile(map: WildMap, fn: (c: number, r: number) => void): void {
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) fn(c, r);
}

/** An ellipse's normalized distance: 0 at the centre, 1 on its rim. */
export interface Ellipse {
  col: number;
  row: number;
  rx: number;
  ry: number;
}
export function ellipseDist(e: Ellipse, c: number, r: number): number {
  return Math.hypot((c - e.col) / e.rx, (r - e.row) / e.ry);
}

/** Angle of (c, r) around the ellipse's centre: 0 east, pi/2 south, -pi/2 north. */
export function ellipseAngle(e: Ellipse, c: number, r: number): number {
  return Math.atan2((r - e.row) / e.ry, (c - e.col) / e.rx);
}

export function pointOnEllipse(e: Ellipse, angle: number, dist: number): [number, number] {
  return [
    Math.round(e.col + Math.cos(angle) * e.rx * dist),
    Math.round(e.row + Math.sin(angle) * e.ry * dist),
  ];
}

// ── Objects ──

/** Place an object if its footprint is in bounds, on dry ground, and free. */
export function place(map: WildMap, kind: string, c: number, r: number): boolean {
  const def = OBJECT_CATALOG[kind];
  const cells = def.footprint.map((f) => ({ c: c + f.dc, r: r + f.dr }));
  for (const cell of cells) {
    if (!inBounds(map, cell.c, cell.r)) return false;
    const ground = map.terrain[cell.r][cell.c];
    if (ground === "water" || ground === "void") return false;
    if (map.occupied.has(key(cell.c, cell.r))) return false;
  }
  for (const cell of cells) map.occupied.add(key(cell.c, cell.r));
  map.objects.push({ kind, col: c, row: r });
  return true;
}

export function placeRequired(map: WildMap, kind: string, c: number, r: number): void {
  if (!place(map, kind, c, r)) {
    throw new Error(`wilds: could not place "${kind}" at (${c},${r})`);
  }
}

/** Trees, bushes, rocks: what a path or a clearing may clear away. Buildings,
 * fences, lamps, and shrines are never removed. */
function isClearable(kind: string): boolean {
  const tint = OBJECT_CATALOG[kind]?.tint;
  return tint === "nature" || tint === "evergreen";
}

/** Remove clearable objects whose footprint touches any tile in `tiles`. */
export function clearNature(map: WildMap, tiles: ReadonlySet<string>): void {
  map.objects = map.objects.filter((obj) => {
    if (!isClearable(obj.kind)) return true;
    const cells = OBJECT_CATALOG[obj.kind].footprint.map((f) =>
      key(obj.col + f.dc, obj.row + f.dr),
    );
    if (!cells.some((cell) => tiles.has(cell))) return true;
    for (const cell of cells) map.occupied.delete(cell);
    return false;
  });
}

/** Mark a disc of tiles as reserved: no forest grows there. */
export function reserveDisc(map: WildMap, col: number, row: number, radius: number): void {
  for (let r = row - radius; r <= row + radius; r++) {
    for (let c = col - radius; c <= col + radius; c++) {
      if (inBounds(map, c, r) && Math.hypot(c - col, r - row) <= radius + 0.3) {
        map.reserved.add(key(c, r));
      }
    }
  }
}

/**
 * A walkable trail through waypoints: a brush of `width` tiles swept along
 * each straight leg. Grass becomes dirt (sand and paths stay as they are),
 * trees on it are cleared, and the tiles are reserved from the forest. Water
 * is left alone, so a trail never fills a pond.
 */
export function carveTrail(
  map: WildMap,
  points: ReadonlyArray<readonly [number, number]>,
  width = 3,
  clearance = width,
): void {
  const tiles = sweep(map, points, width);
  for (const tile of tiles) {
    const [c, r] = tile.split(",").map(Number);
    if (map.terrain[r][c] === "grass") map.terrain[r][c] = "dirt";
  }
  // Trees are cleared, and kept from growing back, over a band wider than the
  // dirt: a tall canopy just downhill of a trail draws right over it.
  const cleared = clearance > width ? sweep(map, points, clearance) : tiles;
  for (const tile of cleared) map.reserved.add(tile);
  clearNature(map, cleared);
}

/** Every tile a square brush `width` tiles across touches as it moves along
 * straight legs between the points. */
function sweep(
  map: WildMap,
  points: ReadonlyArray<readonly [number, number]>,
  width: number,
): Set<string> {
  const tiles = new Set<string>();
  const half = (width - 1) / 2;
  const reach = Math.ceil(half);
  for (let i = 0; i < points.length - 1; i++) {
    const [c0, r0] = points[i];
    const [c1, r1] = points[i + 1];
    const steps = Math.max(Math.abs(c1 - c0), Math.abs(r1 - r0), 1);
    for (let s = 0; s <= steps; s++) {
      const c = Math.round(c0 + ((c1 - c0) * s) / steps);
      const r = Math.round(r0 + ((r1 - r0) * s) / steps);
      for (let dr = -reach; dr <= reach; dr++) {
        for (let dc = -reach; dc <= reach; dc++) {
          if (Math.abs(dc) > half + 0.01 || Math.abs(dr) > half + 0.01) continue;
          if (inBounds(map, c + dc, r + dr)) tiles.add(key(c + dc, r + dr));
        }
      }
    }
  }
  return tiles;
}
