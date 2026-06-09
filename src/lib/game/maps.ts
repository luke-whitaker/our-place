import { Tile } from "./types";
import type { GameMap, Door } from "./types";

const T = Tile;

function fillRect(tiles: Tile[][], r1: number, c1: number, w: number, h: number, tile: Tile) {
  for (let r = r1; r < r1 + h; r++) {
    for (let c = c1; c < c1 + w; c++) {
      tiles[r][c] = tile;
    }
  }
}

/** 4-wide × 3-tall building. Door tile at col+2, row+2. */
function placeBuilding(tiles: Tile[][], row: number, col: number) {
  tiles[row][col] = T.ROOF_LEFT;
  tiles[row][col + 1] = T.ROOF;
  tiles[row][col + 2] = T.ROOF;
  tiles[row][col + 3] = T.ROOF_RIGHT;
  tiles[row + 1][col] = T.WALL_LEFT;
  tiles[row + 1][col + 1] = T.WINDOW;
  tiles[row + 1][col + 2] = T.WINDOW;
  tiles[row + 1][col + 3] = T.WALL_RIGHT;
  tiles[row + 2][col] = T.WALL_LEFT;
  tiles[row + 2][col + 1] = T.WALL;
  tiles[row + 2][col + 2] = T.DOOR;
  tiles[row + 2][col + 3] = T.WALL_RIGHT;
}

/** Player house — same footprint as placeBuilding but uses HOUSE_DOOR. */
function placePlayerHouse(tiles: Tile[][], row: number, col: number) {
  tiles[row][col] = T.ROOF_LEFT;
  tiles[row][col + 1] = T.ROOF;
  tiles[row][col + 2] = T.ROOF;
  tiles[row][col + 3] = T.ROOF_RIGHT;
  tiles[row + 1][col] = T.WALL_LEFT;
  tiles[row + 1][col + 1] = T.WINDOW;
  tiles[row + 1][col + 2] = T.WINDOW;
  tiles[row + 1][col + 3] = T.WALL_RIGHT;
  tiles[row + 2][col] = T.WALL_LEFT;
  tiles[row + 2][col + 1] = T.WALL;
  tiles[row + 2][col + 2] = T.HOUSE_DOOR;
  tiles[row + 2][col + 3] = T.WALL_RIGHT;
}

function createIowaCityMap(): GameMap {
  const cols = 60;
  const rows = 40;

  const tiles: Tile[][] = Array.from({ length: rows }, () => Array(cols).fill(T.GRASS));

  // ── Grass variety ──
  const grass2Spots = [
    [3, 5],
    [6, 14],
    [10, 3],
    [14, 8],
    [22, 6],
    [28, 12],
    [33, 3],
    [37, 10],
    [5, 18],
    [12, 20],
    [30, 18],
    [36, 7],
    [8, 48],
    [15, 55],
    [25, 56],
    [32, 50],
    [37, 45],
    [6, 36],
    [29, 42],
    [35, 54],
  ];
  for (const [r, c] of grass2Spots) {
    if (r < rows && c < cols) tiles[r][c] = T.GRASS2;
  }

  // ── Border: trees ──
  for (let c = 0; c < cols; c++) {
    tiles[0][c] = T.TREE_TOP;
    tiles[1][c] = T.TREE_TRUNK;
    tiles[rows - 2][c] = T.TREE_TOP;
    tiles[rows - 1][c] = T.TREE_TRUNK;
  }
  for (let r = 0; r < rows; r++) {
    tiles[r][0] = T.TREE_TOP;
    tiles[r][1] = T.TREE_TRUNK;
    tiles[r][cols - 2] = T.TREE_TOP;
    tiles[r][cols - 1] = T.TREE_TRUNK;
  }

  // ── Iowa River (cols 24-27, full height) ──
  for (let r = 0; r < rows; r++) {
    tiles[r][24] = T.WATER;
    tiles[r][25] = T.WATER2;
    tiles[r][26] = T.WATER2;
    tiles[r][27] = T.WATER;
  }

  // ── Bridge (rows 18-21 across river) ──
  for (let c = 24; c <= 27; c++) {
    tiles[18][c] = T.BRIDGE_RAIL;
    tiles[19][c] = T.BRIDGE;
    tiles[20][c] = T.BRIDGE;
    tiles[21][c] = T.BRIDGE_RAIL;
  }

  // ── West-side path to bridge ──
  for (let c = 6; c <= 23; c++) {
    tiles[19][c] = T.PATH;
    tiles[20][c] = T.PATH;
  }

  // ── East-side main E-W path from bridge (connects to building grid) ──
  for (let c = 28; c <= 53; c++) {
    tiles[19][c] = T.PATH;
    tiles[20][c] = T.PATH;
  }

  // ── North-south path on west side (col 12-13) ──
  for (let r = 5; r <= 35; r++) {
    tiles[r][12] = T.PATH;
    tiles[r][13] = T.PATH;
  }

  // ── Path edges along west N-S path ──
  for (let r = 5; r <= 35; r++) {
    if (tiles[r][11] === T.GRASS || tiles[r][11] === T.GRASS2) tiles[r][11] = T.PATH_EDGE;
    if (tiles[r][14] === T.GRASS || tiles[r][14] === T.GRASS2) tiles[r][14] = T.PATH_EDGE;
  }

  // ── Path edges along main E-W path ──
  for (let c = 6; c <= 53; c++) {
    if (c >= 24 && c <= 27) continue;
    if (tiles[18][c] === T.GRASS || tiles[18][c] === T.GRASS2) tiles[18][c] = T.PATH_EDGE;
    if (tiles[21][c] === T.GRASS || tiles[21][c] === T.GRASS2) tiles[21][c] = T.PATH_EDGE;
  }

  // ── Player's house (west side, row 15, col 10-13) ──
  placePlayerHouse(tiles, 15, 10);
  fillRect(tiles, 18, 10, 4, 1, T.DIRT);

  // ── West-side tree clusters ──
  for (const [r, c] of [
    [5, 4],
    [5, 6],
    [5, 8],
    [7, 5],
    [7, 9],
  ] as [number, number][]) {
    tiles[r][c] = T.TREE_TOP;
    tiles[r + 1][c] = T.TREE_TRUNK;
  }
  for (const [r, c] of [
    [28, 4],
    [28, 7],
    [30, 5],
    [30, 9],
  ] as [number, number][]) {
    tiles[r][c] = T.TREE_TOP;
    tiles[r + 1][c] = T.TREE_TRUNK;
  }

  // ── West-side pond (rows 33-35, cols 15-18) ──
  fillRect(tiles, 33, 15, 4, 3, T.WATER);
  tiles[33][16] = T.WATER2;
  tiles[34][17] = T.WATER2;

  // ── West-side fence (row 25, cols 4-20) ──
  for (let c = 4; c <= 20; c++) {
    if (c === 12 || c === 13) continue;
    tiles[25][c] = T.FENCE;
  }

  // ── 3×3 Community Building Grid ──
  //
  //  Col starts:  left=31  center=39  right=47
  //  Row starts:  top=5   middle=13  bottom=25
  //
  //  [Creative]         [Community Support]  [Technology]
  //  [Health]           [Welcome Center]     [Music]
  //  [Food]             [Gaming]             [Sports]

  // Top row
  placeBuilding(tiles, 5, 31); // Creative
  placeBuilding(tiles, 5, 39); // Community Support
  placeBuilding(tiles, 5, 47); // Technology

  // Middle row
  placeBuilding(tiles, 13, 31); // Health
  placeBuilding(tiles, 13, 39); // Welcome Center
  placeBuilding(tiles, 13, 47); // Music

  // Bottom row
  placeBuilding(tiles, 25, 31); // Food
  placeBuilding(tiles, 25, 39); // Gaming
  placeBuilding(tiles, 25, 47); // Sports

  // ── Grid paths ──

  // Horizontal path between top and middle rows (rows 9-10)
  for (let c = 29; c <= 53; c++) {
    tiles[9][c] = T.PATH;
    tiles[10][c] = T.PATH;
  }

  // Horizontal path between main E-W path and bottom row (rows 22-23)
  for (let c = 29; c <= 53; c++) {
    tiles[22][c] = T.PATH;
    tiles[23][c] = T.PATH;
  }

  // Vertical path between left and center columns (cols 36-37)
  for (let r = 2; r <= 37; r++) {
    if (tiles[r][36] === T.GRASS || tiles[r][36] === T.GRASS2) tiles[r][36] = T.PATH;
    if (tiles[r][37] === T.GRASS || tiles[r][37] === T.GRASS2) tiles[r][37] = T.PATH;
  }

  // Vertical path between center and right columns (cols 44-45)
  for (let r = 2; r <= 37; r++) {
    if (tiles[r][44] === T.GRASS || tiles[r][44] === T.GRASS2) tiles[r][44] = T.PATH;
    if (tiles[r][45] === T.GRASS || tiles[r][45] === T.GRASS2) tiles[r][45] = T.PATH;
  }

  // ── East-side trees along river bank ──
  for (const [r, c] of [
    [4, 29],
    [28, 28],
    [32, 29],
    [36, 28],
  ] as [number, number][]) {
    if (tiles[r][c] === T.GRASS || tiles[r][c] === T.GRASS2) {
      tiles[r][c] = T.TREE_TOP;
      if (r + 1 < rows) tiles[r + 1][c] = T.TREE_TRUNK;
    }
  }

  // ── East-side trees along far edge ──
  for (const [r, c] of [
    [4, 55],
    [10, 56],
    [26, 55],
    [32, 56],
    [36, 55],
  ] as [number, number][]) {
    if (r < rows - 2 && c < cols - 2) {
      tiles[r][c] = T.TREE_TOP;
      tiles[r + 1][c] = T.TREE_TRUNK;
    }
  }

  // ── Doors ──
  const doors: Door[] = [
    // Player's house
    { col: 12, row: 17, id: "my-place", label: "My Place" },
    // Top row (door row = 5 + 2 = 7)
    { col: 33, row: 7, id: "creative", label: "Creative" },
    { col: 41, row: 7, id: "community-support", label: "Community Support" },
    { col: 49, row: 7, id: "technology", label: "Technology" },
    // Middle row (door row = 13 + 2 = 15)
    { col: 33, row: 15, id: "health", label: "Health" },
    { col: 41, row: 15, id: "welcome-center", label: "Welcome Center" },
    { col: 49, row: 15, id: "music", label: "Music" },
    // Bottom row (door row = 25 + 2 = 27)
    { col: 33, row: 27, id: "food", label: "Food" },
    { col: 41, row: 27, id: "gaming", label: "Gaming" },
    { col: 49, row: 27, id: "sports", label: "Sports" },
  ];

  return {
    cols,
    rows,
    tiles,
    spawnCol: 12,
    spawnRow: 20,
    doors,
  };
}

export const IOWA_CITY_MAP = createIowaCityMap();

/** Alias so existing imports still work. */
export const TEST_MAP = IOWA_CITY_MAP;
