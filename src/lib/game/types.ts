import type { Direction } from "./constants";

// ── Tile IDs ──

export enum Tile {
  GRASS = 0,
  GRASS2 = 1,
  PATH = 2,
  WATER = 3,
  WATER2 = 4,
  TREE_TOP = 5,
  TREE_TRUNK = 6,
  WALL = 7,
  ROOF = 8,
  FENCE = 9,
  DOOR = 10,
  WINDOW = 11,
  ROOF_LEFT = 12,
  ROOF_RIGHT = 13,
  WALL_LEFT = 14,
  WALL_RIGHT = 15,
  PATH_EDGE = 16,
  DIRT = 17,
  BRICK = 18,
  BRIDGE = 19,
  BRIDGE_RAIL = 20,
  HOUSE_DOOR = 21,
  // ── Frontier tiles (wilderness expansion) ──
  TALL_GRASS = 22,
  FLOWER_RED = 23,
  FLOWER_YELLOW = 24,
  FLOWER_PURPLE = 25,
  SAND = 26,
  MOUNTAIN = 27,
  MUSHROOM = 28,
  STONE_RUIN = 29,
}

// Tiles the player cannot walk through
export const SOLID_TILES = new Set<Tile>([
  Tile.WATER,
  Tile.WATER2,
  Tile.TREE_TOP,
  Tile.TREE_TRUNK,
  Tile.WALL,
  Tile.ROOF,
  Tile.FENCE,
  Tile.WINDOW,
  Tile.ROOF_LEFT,
  Tile.ROOF_RIGHT,
  Tile.WALL_LEFT,
  Tile.WALL_RIGHT,
  Tile.MOUNTAIN,
  Tile.MUSHROOM,
  Tile.STONE_RUIN,
]);

// ── Player ──

export interface Player {
  x: number;
  y: number;
  dir: Direction;
  frame: 0 | 1;
  animTimer: number;
  moving: boolean;
}

// ── Camera ──

export interface Camera {
  x: number;
  y: number;
}

// ── Doors & Interactions ──

export interface Door {
  col: number;
  row: number;
  /** Identifier passed to the onInteract callback (e.g., community slug) */
  id: string;
  label: string;
}

// ── Mushroom warp network (mycelium fast-travel) ──

export interface MushroomWarp {
  id: string;
  col: number;
  row: number;
  label: string;
  /** Which node this mushroom belongs to (or "capital") */
  nodeId: string;
  /** IDs of other mushrooms reachable from this one. "all" = full mesh. */
  connections: string[] | "all";
  /** Whether this mushroom can be reached on foot at world-gen time. */
  reachableOnFoot: boolean;
}

// ── Node regions (themed clearings in the frontier) ──

export type NodeTheme =
  | "flower-meadow"
  | "beach"
  | "mountain-valley"
  | "island"
  | "misty-grove"
  | "ancient-ruins";

export interface NodeRegion {
  id: string;
  label: string;
  theme: NodeTheme;
  /** Axis-aligned bounding box of the 100×100 (or smaller) clearing */
  bounds: { col: number; row: number; w: number; h: number };
  /** Center coordinates (for mushroom placement, minimap markers, etc.) */
  center: { col: number; row: number };
}

// ── Named regions (for entry toasts: the 6 nodes + the capital) ──

export interface Region {
  id: string;
  label: string;
  bounds: { col: number; row: number; w: number; h: number };
}

// ── Game Map ──

export interface GameMap {
  cols: number;
  rows: number;
  tiles: Tile[][];
  spawnCol: number;
  spawnRow: number;
  doors: Door[];
  /** Mushroom warp shrines (absent on maps without fast travel) */
  mushrooms?: MushroomWarp[];
  /** Named regions for entry toasts (absent on maps without them) */
  regions?: Region[];
}

// ── Game Mode ──

export type GameMode = "overworld" | "dialogue" | "fading" | "warp-menu";

// ── Game State ──

export interface GameState {
  mode: GameMode;
  currentMap: string;
  player: Player;
  camera: Camera;
  frameTick: number;
  fade: number;
  fadeDir: -1 | 0 | 1;
  /** Door the player is currently near (for prompt display) */
  nearbyDoor: Door | null;
  /** Door that triggered a fade transition (action fires at peak) */
  pendingDoor: Door | null;
  /** Warp shrine the player is currently near (for prompt display) */
  nearbyMushroom: MushroomWarp | null;
  /** Warp destination teleported to at peak of fade */
  pendingWarp: MushroomWarp | null;
  /** IDs of shrines the player has discovered (warp menu entries) */
  discovered: Set<string>;
  /** Currently highlighted entry in the warp menu */
  warpMenuIndex: number;
  /** Region the player is currently inside (for entry-toast edge detection) */
  currentRegionId: string | null;
  /** Banner text + remaining ticks (region entries, shrine discoveries) */
  toast: { text: string; ticksLeft: number } | null;
}
