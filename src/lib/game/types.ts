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

// ── Game Map ──

export interface GameMap {
  cols: number;
  rows: number;
  tiles: Tile[][];
  spawnCol: number;
  spawnRow: number;
  doors: Door[];
}

// ── Game Mode ──

export type GameMode = "overworld" | "dialogue" | "fading";

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
}
