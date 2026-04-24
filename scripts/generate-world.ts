/**
 * World Generator — 500×500 frontier expansion around the sacred 60×40 capital.
 *
 * Produces:
 *   public/world/world.bin       — Uint8Array of tile bytes (row-major, cols×rows)
 *   public/world/world.meta.json — spawn, doors, node bounds, mushroom network
 *
 * Run: `npm run world:generate`
 *
 * Regenerate-safe. The capital (60×40) is stamped verbatim from the existing
 * IOWA_CITY_MAP; everything outside that footprint is procedural wilderness,
 * themed nodes, meandering passages, rivers, and a mushroom warp network.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { IOWA_CITY_MAP } from "../src/lib/game/maps";
import { Tile } from "../src/lib/game/types";
import type { MushroomWarp, NodeTheme } from "../src/lib/game/types";

// ──────────────────────────────────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────────────────────────────────

const WORLD_W = 500;
const WORLD_H = 500;
const SEED = 20260424;

const CAPITAL_ANCHOR = { col: 220, row: 230 };
const CAPITAL_W = IOWA_CITY_MAP.cols;
const CAPITAL_H = IOWA_CITY_MAP.rows;
const CAPITAL_CENTER = {
  col: CAPITAL_ANCHOR.col + Math.floor(CAPITAL_W / 2),
  row: CAPITAL_ANCHOR.row + Math.floor(CAPITAL_H / 2),
};

interface NodeSpec {
  id: string;
  label: string;
  theme: NodeTheme;
  center: { col: number; row: number };
  size: number;
  reachableOnFoot: boolean;
}

const NODES: NodeSpec[] = [
  {
    id: "flower-meadow",
    label: "Flower Meadow",
    theme: "flower-meadow",
    center: { col: 250, row: 80 },
    size: 100,
    reachableOnFoot: true,
  },
  {
    id: "misty-grove",
    label: "Misty Grove",
    theme: "misty-grove",
    center: { col: 90, row: 140 },
    size: 100,
    reachableOnFoot: true,
  },
  {
    id: "mountain-valley",
    label: "Mountain Valley",
    theme: "mountain-valley",
    center: { col: 410, row: 140 },
    size: 100,
    reachableOnFoot: true,
  },
  {
    id: "ancient-ruins",
    label: "Ancient Ruins",
    theme: "ancient-ruins",
    center: { col: 90, row: 380 },
    size: 100,
    reachableOnFoot: true,
  },
  {
    id: "beach",
    label: "Sun Beach",
    theme: "beach",
    center: { col: 400, row: 390 },
    size: 100,
    reachableOnFoot: true,
  },
  {
    id: "island",
    label: "Mushroom Isle",
    theme: "island",
    center: { col: 250, row: 440 },
    size: 80,
    reachableOnFoot: false,
  },
];

interface PassageSpec {
  from: string;
  to: string;
  meander: number;
}

const PASSAGES: PassageSpec[] = [
  { from: "capital", to: "flower-meadow", meander: 3 },
  { from: "capital", to: "misty-grove", meander: 4 },
  { from: "capital", to: "mountain-valley", meander: 4 },
  { from: "capital", to: "ancient-ruins", meander: 4 },
  { from: "capital", to: "beach", meander: 4 },
  { from: "flower-meadow", to: "mountain-valley", meander: 3 },
  { from: "misty-grove", to: "ancient-ruins", meander: 3 },
  { from: "ancient-ruins", to: "beach", meander: 3 },
];

interface RiverSpec {
  name: string;
  points: Array<[number, number]>;
  width: number;
}

const RIVERS: RiverSpec[] = [
  // Iowa River north extension: capital → small lake near north edge
  {
    name: "iowa-north",
    points: [
      [245, 230],
      [238, 195],
      [222, 155],
      [200, 110],
      [185, 65],
      [180, 40],
    ],
    width: 3,
  },
  // Iowa River south extension: capital → southern ocean
  {
    name: "iowa-south",
    points: [
      [246, 270],
      [250, 315],
      [248, 360],
      [252, 405],
    ],
    width: 3,
  },
  // Mountain stream (west→east through the valley)
  {
    name: "mountain-stream",
    points: [
      [355, 150],
      [390, 148],
      [430, 144],
      [470, 140],
    ],
    width: 2,
  },
  // Misty grove stream (west edge)
  {
    name: "misty-stream",
    points: [
      [135, 140],
      [95, 145],
      [55, 155],
      [20, 165],
    ],
    width: 2,
  },
];

interface LakeSpec {
  name: string;
  center: [number, number];
  rx: number;
  ry: number;
}

const LAKES: LakeSpec[] = [
  // North lake — terminus of iowa-north
  { name: "north-lake", center: [180, 38], rx: 22, ry: 14 },
  // Southern ocean (contains the island, reaches the beach)
  { name: "south-ocean", center: [290, 450], rx: 160, ry: 42 },
];

// ──────────────────────────────────────────────────────────────────────────
// PRNG (mulberry32 — deterministic, fast, no deps)
// ──────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

// ──────────────────────────────────────────────────────────────────────────
// World (Uint8Array-backed tile grid + parallel claim mask)
// ──────────────────────────────────────────────────────────────────────────

// Claim kinds — higher values win when resolving overrides
const CLAIM_NONE = 0;
const CLAIM_PASSAGE = 1;
const CLAIM_WATER = 2;
const CLAIM_NODE = 3;
const CLAIM_CAPITAL = 4;

class World {
  tiles: Uint8Array;
  claim: Uint8Array;

  constructor(
    public cols: number,
    public rows: number,
  ) {
    this.tiles = new Uint8Array(cols * rows);
    this.claim = new Uint8Array(cols * rows);
  }

  idx(col: number, row: number): number {
    return row * this.cols + col;
  }

  inBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  get(col: number, row: number): Tile {
    if (!this.inBounds(col, row)) return Tile.TREE_TOP;
    return this.tiles[this.idx(col, row)] as Tile;
  }

  set(col: number, row: number, tile: Tile, claim: number = CLAIM_NONE): void {
    if (!this.inBounds(col, row)) return;
    const i = this.idx(col, row);
    // Respect higher-priority existing claim (don't let water erase the capital, etc.)
    if (claim < this.claim[i]) return;
    this.tiles[i] = tile;
    if (claim > this.claim[i]) this.claim[i] = claim;
  }

  /** Force a tile + claim regardless of priority (use sparingly). */
  force(col: number, row: number, tile: Tile, claim: number): void {
    if (!this.inBounds(col, row)) return;
    const i = this.idx(col, row);
    this.tiles[i] = tile;
    this.claim[i] = claim;
  }

  getClaim(col: number, row: number): number {
    if (!this.inBounds(col, row)) return CLAIM_NONE;
    return this.claim[this.idx(col, row)];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function getNode(id: string): NodeSpec {
  const n = NODES.find((x) => x.id === id);
  if (!n) throw new Error(`Unknown node: ${id}`);
  return n;
}

function endpoint(id: string): { col: number; row: number } {
  if (id === "capital") return CAPITAL_CENTER;
  return getNode(id).center;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function chance(p: number): boolean {
  return rand() < p;
}

/** Smooth large-scale noise: sum of sines. Range ≈ [-3, 3]. */
function noise(col: number, row: number, freq = 0.08): number {
  return (
    Math.sin(col * freq) +
    Math.sin(row * freq * 1.1) +
    Math.sin((col + row) * freq * 0.7)
  );
}

function flowerColor(): Tile {
  const r = rand();
  if (r < 0.4) return Tile.FLOWER_YELLOW;
  if (r < 0.75) return Tile.FLOWER_RED;
  return Tile.FLOWER_PURPLE;
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 1: base fill
// ──────────────────────────────────────────────────────────────────────────

function fillBase(w: World) {
  w.tiles.fill(Tile.GRASS);
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 2: passages (20-wide corridors, tree walls outer, grass/tall-grass inner)
// ──────────────────────────────────────────────────────────────────────────

function carvePassage(
  w: World,
  from: { col: number; row: number },
  to: { col: number; row: number },
  meander: number,
) {
  const dx = to.col - from.col;
  const dy = to.row - from.row;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular unit
  const px = -uy;
  const py = ux;

  const halfWidth = 10; // total width = 20
  const wallThick = 3; // outer 3 tiles on each side are tree walls
  const steps = Math.ceil(len * 2);

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    // Meander: 1.5 waves along the passage length
    const phase = t * Math.PI * 3;
    const perturb = Math.sin(phase) * meander;

    const cx = from.col + ux * len * t + px * perturb;
    const cy = from.row + uy * len * t + py * perturb;

    for (let off = -halfWidth; off <= halfWidth; off++) {
      const col = Math.round(cx + px * off);
      const row = Math.round(cy + py * off);
      if (!w.inBounds(col, row)) continue;

      const absOff = Math.abs(off);
      if (absOff > halfWidth - wallThick) {
        // Tree wall — solid canopy
        w.set(col, row, Tile.TREE_TOP, CLAIM_PASSAGE);
      } else {
        // Walkable interior: smooth noise drives tall-grass patches
        const patchNoise =
          Math.sin(col * 0.18) +
          Math.sin(row * 0.22) +
          Math.sin((col + row) * 0.13);
        if (patchNoise > 0.6) {
          w.set(col, row, Tile.TALL_GRASS, CLAIM_PASSAGE);
        } else if (chance(0.05)) {
          w.set(col, row, Tile.GRASS2, CLAIM_PASSAGE);
        } else if (chance(0.015)) {
          w.set(col, row, flowerColor(), CLAIM_PASSAGE);
        } else {
          w.set(col, row, Tile.GRASS, CLAIM_PASSAGE);
        }
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 3: themed nodes
// ──────────────────────────────────────────────────────────────────────────

function claimNodeRegion(w: World, node: NodeSpec) {
  const half = Math.floor(node.size / 2);
  const c0 = node.center.col - half;
  const r0 = node.center.row - half;
  for (let r = r0; r < r0 + node.size; r++) {
    for (let c = c0; c < c0 + node.size; c++) {
      if (w.inBounds(c, r)) w.claim[w.idx(c, r)] = CLAIM_NODE;
    }
  }
}

function forEachNodeTile(
  node: NodeSpec,
  fn: (c: number, r: number, relC: number, relR: number) => void,
) {
  const half = Math.floor(node.size / 2);
  const c0 = node.center.col - half;
  const r0 = node.center.row - half;
  for (let r = r0; r < r0 + node.size; r++) {
    for (let c = c0; c < c0 + node.size; c++) {
      fn(c, r, c - c0, r - r0);
    }
  }
}

function carveFlowerMeadow(w: World, node: NodeSpec) {
  forEachNodeTile(node, (c, r) => {
    // Base: grass with occasional GRASS2 tufts
    let tile: Tile = chance(0.15) ? Tile.GRASS2 : Tile.GRASS;

    // Dense flower coverage — 35% of tiles
    if (chance(0.35)) tile = flowerColor();

    // Very occasional tall-grass island
    if (noise(c, r, 0.18) > 1.6) tile = Tile.TALL_GRASS;

    w.force(c, r, tile, CLAIM_NODE);
  });

  // A small circular pond
  const pc = node.center.col - 25;
  const pr = node.center.row + 20;
  stampEllipse(w, pc, pr, 4, 3, Tile.WATER, CLAIM_NODE);

  // A few trees scattered toward the edges
  scatterTrees(w, node, 0.03, "edges");
}

function carveBeach(w: World, node: NodeSpec) {
  forEachNodeTile(node, (c, r, _relC, relR) => {
    // Vertical bands: grass → sand → water, with wavy transitions
    const grassBand = 32 + Math.sin(c * 0.12) * 4;
    const sandBand = 60 + Math.sin(c * 0.1) * 5;

    let tile: Tile;
    if (relR < grassBand) {
      tile = chance(0.08) ? Tile.FLOWER_YELLOW : chance(0.1) ? Tile.GRASS2 : Tile.GRASS;
    } else if (relR < sandBand) {
      tile = Tile.SAND;
    } else {
      tile = chance(0.3) ? Tile.WATER2 : Tile.WATER;
    }
    w.force(c, r, tile, CLAIM_NODE);
  });

  // A few palms (trees) on the sandy band
  for (let i = 0; i < 6; i++) {
    const c = node.center.col - 40 + Math.floor(rand() * 80);
    const r = node.center.row - 15 + Math.floor(rand() * 15);
    if (w.get(c, r) === Tile.SAND || w.get(c, r) === Tile.GRASS) {
      w.force(c, r, Tile.TREE_TOP, CLAIM_NODE);
      if (w.get(c, r + 1) === Tile.SAND) w.force(c, r + 1, Tile.TREE_TRUNK, CLAIM_NODE);
    }
  }
}

function carveMountainValley(w: World, node: NodeSpec) {
  forEachNodeTile(node, (c, r, _relC, relR) => {
    // Northern and southern 18 rows = mountain walls (with wavy edge)
    const northWall = 18 + Math.sin(c * 0.15) * 3;
    const southWall = node.size - 18 + Math.sin(c * 0.15) * 3;

    let tile: Tile;
    if (relR < northWall || relR >= southWall) {
      tile = chance(0.1) ? Tile.MOUNTAIN : Tile.MOUNTAIN;
    } else {
      tile = chance(0.08) ? Tile.GRASS2 : Tile.GRASS;
      if (chance(0.02)) tile = Tile.FLOWER_YELLOW;
    }
    w.force(c, r, tile, CLAIM_NODE);
  });

  // Mountain stream along the valley center
  const streamRow = node.center.row;
  const half = Math.floor(node.size / 2);
  for (let c = node.center.col - half; c < node.center.col + half; c++) {
    const wobble = Math.round(Math.sin(c * 0.12) * 2);
    for (let dr = -1; dr <= 1; dr++) {
      const r = streamRow + wobble + dr;
      if (w.get(c, r) === Tile.GRASS || w.get(c, r) === Tile.GRASS2) {
        w.force(c, r, dr === 0 ? Tile.WATER : Tile.WATER2, CLAIM_NODE);
      }
    }
  }

  // Boulders (extra MOUNTAIN tiles) scattered in valley floor
  for (let i = 0; i < 12; i++) {
    const c = node.center.col - half + 10 + Math.floor(rand() * (node.size - 20));
    const r = node.center.row - 15 + Math.floor(rand() * 30);
    if (w.get(c, r) === Tile.GRASS) w.force(c, r, Tile.MOUNTAIN, CLAIM_NODE);
  }
}

function carveIsland(w: World, node: NodeSpec) {
  const cx = node.center.col;
  const cy = node.center.row;
  const half = Math.floor(node.size / 2);
  const innerR = half - 22; // grass core
  const beachR = half - 16; // sand ring

  forEachNodeTile(node, (c, r) => {
    const dx = c - cx;
    const dy = r - cy;
    // Slight elliptical, irregular edge
    const d = Math.hypot(dx, dy * 1.15) + Math.sin(c * 0.2 + r * 0.22) * 1.5;

    let tile: Tile;
    if (d < innerR) {
      tile = chance(0.2) ? Tile.GRASS2 : Tile.GRASS;
      if (chance(0.04)) tile = Tile.FLOWER_PURPLE;
    } else if (d < beachR) {
      tile = Tile.SAND;
    } else {
      tile = chance(0.3) ? Tile.WATER2 : Tile.WATER;
    }
    w.force(c, r, tile, CLAIM_NODE);
  });

  // 4 trees on the island
  for (let i = 0; i < 4; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = rand() * (innerR - 5);
    const c = Math.round(cx + Math.cos(angle) * dist);
    const r = Math.round(cy + Math.sin(angle) * dist);
    if (w.get(c, r) === Tile.GRASS) {
      w.force(c, r, Tile.TREE_TOP, CLAIM_NODE);
      if (w.get(c, r + 1) === Tile.GRASS) w.force(c, r + 1, Tile.TREE_TRUNK, CLAIM_NODE);
    }
  }
}

function carveMistyGrove(w: World, node: NodeSpec) {
  forEachNodeTile(node, (c, r) => {
    let tile: Tile = chance(0.28) ? Tile.GRASS2 : Tile.GRASS;
    if (chance(0.1)) tile = Tile.FLOWER_PURPLE;
    if (noise(c, r, 0.2) > 1.4) tile = Tile.TALL_GRASS;
    w.force(c, r, tile, CLAIM_NODE);
  });

  // Dense scattered trees — ~20% density, in clusters (noise-driven)
  forEachNodeTile(node, (c, r) => {
    const densityNoise = noise(c, r, 0.14);
    if (densityNoise > 0.8 && chance(0.55)) {
      w.force(c, r, Tile.TREE_TOP, CLAIM_NODE);
    }
  });

  // Small pond off-center
  stampEllipse(
    w,
    node.center.col + 15,
    node.center.row - 10,
    5,
    3,
    Tile.WATER,
    CLAIM_NODE,
  );
}

function carveAncientRuins(w: World, node: NodeSpec) {
  forEachNodeTile(node, (c, r) => {
    let tile: Tile = chance(0.22) ? Tile.GRASS2 : Tile.GRASS;
    if (chance(0.03)) tile = Tile.FLOWER_YELLOW;
    w.force(c, r, tile, CLAIM_NODE);
  });

  const half = Math.floor(node.size / 2);
  const c0 = node.center.col - half;
  const r0 = node.center.row - half;

  // Four rough fallen-wall rectangles — perimeter only, with ruined gaps
  const walls: Array<{ c: number; r: number; w: number; h: number }> = [
    { c: c0 + 18, r: r0 + 18, w: 22, h: 14 },
    { c: c0 + 48, r: r0 + 25, w: 18, h: 28 },
    { c: c0 + 22, r: r0 + 52, w: 26, h: 14 },
    { c: c0 + 55, r: r0 + 62, w: 20, h: 22 },
  ];

  for (const wall of walls) {
    // Perimeter
    for (let c = wall.c; c < wall.c + wall.w; c++) {
      if (chance(0.65)) w.force(c, wall.r, Tile.STONE_RUIN, CLAIM_NODE);
      if (chance(0.65)) w.force(c, wall.r + wall.h - 1, Tile.STONE_RUIN, CLAIM_NODE);
    }
    for (let r = wall.r; r < wall.r + wall.h; r++) {
      if (chance(0.65)) w.force(wall.c, r, Tile.STONE_RUIN, CLAIM_NODE);
      if (chance(0.65)) w.force(wall.c + wall.w - 1, r, Tile.STONE_RUIN, CLAIM_NODE);
    }
    // Interior floor — scattered BRICK
    for (let r = wall.r + 1; r < wall.r + wall.h - 1; r++) {
      for (let c = wall.c + 1; c < wall.c + wall.w - 1; c++) {
        if (chance(0.25)) w.force(c, r, Tile.BRICK, CLAIM_NODE);
      }
    }
  }

  // 3 trees growing through the ruins
  for (let i = 0; i < 3; i++) {
    const c = c0 + 10 + Math.floor(rand() * (node.size - 20));
    const r = r0 + 10 + Math.floor(rand() * (node.size - 20));
    if (w.get(c, r) === Tile.GRASS || w.get(c, r) === Tile.GRASS2) {
      w.force(c, r, Tile.TREE_TOP, CLAIM_NODE);
      const t2 = w.get(c, r + 1);
      if (t2 === Tile.GRASS || t2 === Tile.GRASS2) {
        w.force(c, r + 1, Tile.TREE_TRUNK, CLAIM_NODE);
      }
    }
  }
}

function scatterTrees(
  w: World,
  node: NodeSpec,
  density: number,
  where: "edges" | "anywhere",
) {
  const half = Math.floor(node.size / 2);
  const c0 = node.center.col - half;
  const r0 = node.center.row - half;
  for (let r = r0; r < r0 + node.size; r++) {
    for (let c = c0; c < c0 + node.size; c++) {
      if (where === "edges") {
        const edgeDist = Math.min(c - c0, c0 + node.size - c, r - r0, r0 + node.size - r);
        if (edgeDist > 15) continue;
      }
      if (chance(density) && w.get(c, r) !== Tile.TREE_TOP) {
        w.force(c, r, Tile.TREE_TOP, CLAIM_NODE);
        const t2 = w.get(c, r + 1);
        if (t2 !== Tile.TREE_TOP && t2 !== Tile.TREE_TRUNK) {
          w.force(c, r + 1, Tile.TREE_TRUNK, CLAIM_NODE);
        }
      }
    }
  }
}

function carveNode(w: World, node: NodeSpec) {
  // Mark the whole region as CLAIM_NODE so wilderness trees don't leak in.
  claimNodeRegion(w, node);

  switch (node.theme) {
    case "flower-meadow":
      carveFlowerMeadow(w, node);
      break;
    case "beach":
      carveBeach(w, node);
      break;
    case "mountain-valley":
      carveMountainValley(w, node);
      break;
    case "island":
      carveIsland(w, node);
      break;
    case "misty-grove":
      carveMistyGrove(w, node);
      break;
    case "ancient-ruins":
      carveAncientRuins(w, node);
      break;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 4: water (rivers + lakes)
// ──────────────────────────────────────────────────────────────────────────

function stampDisc(w: World, cx: number, cy: number, radius: number, tile: Tile, claim: number) {
  const r0 = Math.floor(cy - radius);
  const r1 = Math.ceil(cy + radius);
  const c0 = Math.floor(cx - radius);
  const c1 = Math.ceil(cx + radius);
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      const dx = c - cx;
      const dy = r - cy;
      if (dx * dx + dy * dy <= radius * radius) {
        w.set(c, r, tile, claim);
      }
    }
  }
}

function stampEllipse(
  w: World,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tile: Tile,
  claim: number,
) {
  for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r++) {
    for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c++) {
      const dx = (c - cx) / rx;
      const dy = (r - cy) / ry;
      if (dx * dx + dy * dy <= 1) w.set(c, r, tile, claim);
    }
  }
}

function carveRiver(w: World, spec: RiverSpec) {
  const pts = spec.points;
  for (let i = 0; i < pts.length - 1; i++) {
    const [c1, r1] = pts[i];
    const [c2, r2] = pts[i + 1];
    const len = Math.hypot(c2 - c1, r2 - r1);
    const steps = Math.ceil(len * 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = c1 + (c2 - c1) * t;
      const cy = r1 + (r2 - r1) * t;
      stampDisc(w, cx, cy, spec.width, Tile.WATER, CLAIM_WATER);
    }
  }
  // Speckle with WATER2 for variety
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) {
      if (w.tiles[w.idx(c, r)] === Tile.WATER && chance(0.25)) {
        w.tiles[w.idx(c, r)] = Tile.WATER2;
      }
    }
  }
}

function carveLake(w: World, spec: LakeSpec) {
  // Irregular elliptical blob
  for (let r = Math.floor(spec.center[1] - spec.ry - 3); r <= Math.ceil(spec.center[1] + spec.ry + 3); r++) {
    for (let c = Math.floor(spec.center[0] - spec.rx - 3); c <= Math.ceil(spec.center[0] + spec.rx + 3); c++) {
      const dx = (c - spec.center[0]) / spec.rx;
      const dy = (r - spec.center[1]) / spec.ry;
      const distSq = dx * dx + dy * dy;
      // Organic edge via noise (wobbles the effective radius)
      const edgeNoise =
        Math.sin(c * 0.15) * 0.06 + Math.sin(r * 0.17) * 0.06 + Math.sin((c + r) * 0.1) * 0.04;
      if (distSq + edgeNoise < 1.0) {
        w.set(c, r, chance(0.3) ? Tile.WATER2 : Tile.WATER, CLAIM_WATER);
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 5: capital stamp (sacred — overrides everything in its bounds)
// ──────────────────────────────────────────────────────────────────────────

function stampCapital(w: World) {
  for (let r = 0; r < IOWA_CITY_MAP.rows; r++) {
    for (let c = 0; c < IOWA_CITY_MAP.cols; c++) {
      const wc = c + CAPITAL_ANCHOR.col;
      const wr = r + CAPITAL_ANCHOR.row;
      w.force(wc, wr, IOWA_CITY_MAP.tiles[r][c], CLAIM_CAPITAL);
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 6: wilderness fill (everything unclaimed becomes varied forest)
// ──────────────────────────────────────────────────────────────────────────

function fillWilderness(w: World) {
  // Macro density determines whether an area is dense forest or clearing
  for (let r = 0; r < w.rows; r++) {
    for (let c = 0; c < w.cols; c++) {
      if (w.claim[w.idx(c, r)] !== CLAIM_NONE) continue;

      const macro = noise(c, r, 0.035); // large patches
      const micro = noise(c, r, 0.18); // small detail

      if (macro > 0.2) {
        // Dense forest
        if (micro > -0.3 && chance(0.78)) {
          w.force(c, r, Tile.TREE_TOP, CLAIM_NONE);
        } else if (chance(0.5)) {
          w.force(c, r, chance(0.5) ? Tile.GRASS2 : Tile.GRASS, CLAIM_NONE);
        } else if (chance(0.1)) {
          w.force(c, r, Tile.TALL_GRASS, CLAIM_NONE);
        } else {
          w.force(c, r, Tile.GRASS, CLAIM_NONE);
        }
      } else {
        // Clearing — sparse trees, some tall grass, occasional flowers
        if (chance(0.08)) {
          w.force(c, r, Tile.TREE_TOP, CLAIM_NONE);
        } else if (chance(0.06)) {
          w.force(c, r, Tile.TALL_GRASS, CLAIM_NONE);
        } else if (chance(0.04)) {
          w.force(c, r, Tile.GRASS2, CLAIM_NONE);
        } else if (chance(0.012)) {
          w.force(c, r, flowerColor(), CLAIM_NONE);
        }
        // else: leave as GRASS (from fillBase)
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 7: border (always solid trees)
// ──────────────────────────────────────────────────────────────────────────

function addBorder(w: World) {
  for (let c = 0; c < w.cols; c++) {
    w.force(c, 0, Tile.TREE_TOP, CLAIM_CAPITAL);
    w.force(c, 1, Tile.TREE_TRUNK, CLAIM_CAPITAL);
    w.force(c, w.rows - 2, Tile.TREE_TOP, CLAIM_CAPITAL);
    w.force(c, w.rows - 1, Tile.TREE_TRUNK, CLAIM_CAPITAL);
  }
  for (let r = 0; r < w.rows; r++) {
    w.force(0, r, Tile.TREE_TOP, CLAIM_CAPITAL);
    w.force(1, r, Tile.TREE_TRUNK, CLAIM_CAPITAL);
    w.force(w.cols - 2, r, Tile.TREE_TOP, CLAIM_CAPITAL);
    w.force(w.cols - 1, r, Tile.TREE_TRUNK, CLAIM_CAPITAL);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stage 8: mushrooms (mycelium warp network)
// ──────────────────────────────────────────────────────────────────────────

function placeMushrooms(w: World): MushroomWarp[] {
  const mushrooms: MushroomWarp[] = [];

  // Capital gate — just above the northern edge of the capital (still in frontier)
  const gateCol = 250;
  const gateRow = CAPITAL_ANCHOR.row - 5;
  w.force(gateCol, gateRow, Tile.MUSHROOM, CLAIM_CAPITAL);
  mushrooms.push({
    id: "mushroom-capital-gate",
    col: gateCol,
    row: gateRow,
    label: "Capital Gate",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  });

  // One mushroom per node (at center)
  for (const node of NODES) {
    w.force(node.center.col, node.center.row, Tile.MUSHROOM, CLAIM_NODE);
    mushrooms.push({
      id: `mushroom-${node.id}`,
      col: node.center.col,
      row: node.center.row,
      label: `${node.label} Shrine`,
      nodeId: node.id,
      connections: "all",
      reachableOnFoot: node.reachableOnFoot,
    });
  }

  return mushrooms;
}

// ──────────────────────────────────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────────────────────────────────

function writeOutput(w: World, mushrooms: MushroomWarp[]) {
  const projectRoot = join(__dirname, "..");
  const outDir = join(projectRoot, "public", "world");
  mkdirSync(outDir, { recursive: true });

  // Binary tile data
  writeFileSync(join(outDir, "world.bin"), Buffer.from(w.tiles));

  // Translate capital doors to world coordinates
  const doors = IOWA_CITY_MAP.doors.map((d) => ({
    col: d.col + CAPITAL_ANCHOR.col,
    row: d.row + CAPITAL_ANCHOR.row,
    id: d.id,
    label: d.label,
  }));

  const spawnCol = IOWA_CITY_MAP.spawnCol + CAPITAL_ANCHOR.col;
  const spawnRow = IOWA_CITY_MAP.spawnRow + CAPITAL_ANCHOR.row;

  const meta = {
    cols: WORLD_W,
    rows: WORLD_H,
    spawnCol,
    spawnRow,
    seed: SEED,
    generatedAt: new Date().toISOString(),
    capital: {
      anchor: CAPITAL_ANCHOR,
      cols: CAPITAL_W,
      rows: CAPITAL_H,
    },
    nodes: NODES.map((n) => ({
      id: n.id,
      label: n.label,
      theme: n.theme,
      center: n.center,
      bounds: {
        col: n.center.col - Math.floor(n.size / 2),
        row: n.center.row - Math.floor(n.size / 2),
        w: n.size,
        h: n.size,
      },
      reachableOnFoot: n.reachableOnFoot,
    })),
    passages: PASSAGES.map((p) => ({
      from: p.from,
      to: p.to,
      fromPoint: endpoint(p.from),
      toPoint: endpoint(p.to),
    })),
    doors,
    mushrooms,
  };
  writeFileSync(join(outDir, "world.meta.json"), JSON.stringify(meta, null, 2));

  return { outDir, meta };
}

// ──────────────────────────────────────────────────────────────────────────
// Text preview (downsampled)
// ──────────────────────────────────────────────────────────────────────────

function tileChar(t: Tile): string {
  switch (t) {
    case Tile.GRASS:
      return ".";
    case Tile.GRASS2:
      return ",";
    case Tile.TALL_GRASS:
      return '"';
    case Tile.PATH:
    case Tile.PATH_EDGE:
      return " ";
    case Tile.WATER:
    case Tile.WATER2:
      return "~";
    case Tile.TREE_TOP:
    case Tile.TREE_TRUNK:
      return "#";
    case Tile.WALL:
    case Tile.WALL_LEFT:
    case Tile.WALL_RIGHT:
    case Tile.ROOF:
    case Tile.ROOF_LEFT:
    case Tile.ROOF_RIGHT:
      return "H";
    case Tile.DOOR:
    case Tile.HOUSE_DOOR:
      return "D";
    case Tile.WINDOW:
      return "W";
    case Tile.FENCE:
      return "-";
    case Tile.DIRT:
      return ":";
    case Tile.BRICK:
      return "b";
    case Tile.BRIDGE:
    case Tile.BRIDGE_RAIL:
      return "=";
    case Tile.FLOWER_RED:
    case Tile.FLOWER_YELLOW:
    case Tile.FLOWER_PURPLE:
      return "*";
    case Tile.SAND:
      return "_";
    case Tile.MOUNTAIN:
      return "^";
    case Tile.MUSHROOM:
      return "&";
    case Tile.STONE_RUIN:
      return "R";
    default:
      return "?";
  }
}

function printPreview(w: World) {
  const previewW = 100;
  const previewH = 100;
  const scaleC = w.cols / previewW;
  const scaleR = w.rows / previewH;

  console.log("");
  console.log("Preview (100×100 downsample; 1 char ≈ 5×5 tiles):");
  console.log("  . = grass   , = grass2   \" = tall grass   ~ = water   # = tree");
  console.log("  H = wall    D = door     W = window       b = brick   _ = sand");
  console.log("  ^ = mountain * = flower   & = mushroom     R = ruin    = = bridge");
  console.log("");

  for (let pr = 0; pr < previewH; pr++) {
    let line = "";
    for (let pc = 0; pc < previewW; pc++) {
      const c = Math.floor(pc * scaleC + scaleC / 2);
      const r = Math.floor(pr * scaleR + scaleR / 2);
      line += tileChar(w.get(c, r));
    }
    console.log(line);
  }
  console.log("");
}

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

function main() {
  console.log(`Generating ${WORLD_W}×${WORLD_H} world (seed ${SEED})…`);
  const w = new World(WORLD_W, WORLD_H);

  fillBase(w);

  for (const passage of PASSAGES) {
    carvePassage(w, endpoint(passage.from), endpoint(passage.to), passage.meander);
  }

  for (const lake of LAKES) carveLake(w, lake);
  for (const river of RIVERS) carveRiver(w, river);

  for (const node of NODES) carveNode(w, node);

  stampCapital(w);

  fillWilderness(w);

  addBorder(w);

  const mushrooms = placeMushrooms(w);

  const { outDir, meta } = writeOutput(w, mushrooms);

  // Summary
  const totalTiles = WORLD_W * WORLD_H;
  const counts: Record<string, number> = {};
  for (let i = 0; i < w.tiles.length; i++) {
    const name = Tile[w.tiles[i]] ?? String(w.tiles[i]);
    counts[name] = (counts[name] ?? 0) + 1;
  }

  console.log("");
  console.log(`Wrote ${join(outDir, "world.bin")} (${w.tiles.byteLength} bytes)`);
  console.log(`Wrote ${join(outDir, "world.meta.json")}`);
  console.log("");
  console.log(`Total tiles: ${totalTiles.toLocaleString()}`);
  console.log("Tile breakdown:");
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  for (const [name, n] of sorted) {
    const pct = ((n / totalTiles) * 100).toFixed(1);
    console.log(`  ${name.padEnd(14)} ${n.toString().padStart(7)}  (${pct}%)`);
  }
  console.log("");
  console.log(`Spawn: (${meta.spawnCol}, ${meta.spawnRow})`);
  console.log(`Nodes: ${meta.nodes.length}, Passages: ${meta.passages.length}, Mushrooms: ${meta.mushrooms.length}`);

  printPreview(w);
}

main();
