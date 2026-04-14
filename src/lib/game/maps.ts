import { Tile } from "./types";
import type { GameMap, Door } from "./types";

const T = Tile;

// ── Helpers ──

/** Fill a rectangular region with a single tile. */
function fillRect(tiles: Tile[][], r1: number, c1: number, w: number, h: number, tile: Tile) {
  for (let r = r1; r < r1 + h; r++) {
    for (let c = c1; c < c1 + w; c++) {
      tiles[r][c] = tile;
    }
  }
}

/**
 * Place a 4-wide × 3-tall building.
 * Row 0: roof (left/center/center/right)
 * Row 1: wall-left / window / window / wall-right
 * Row 2: wall-left / wall / door / wall-right
 */
function placeBuilding(tiles: Tile[][], row: number, col: number) {
  // Roof
  tiles[row][col] = T.ROOF_LEFT;
  tiles[row][col + 1] = T.ROOF;
  tiles[row][col + 2] = T.ROOF;
  tiles[row][col + 3] = T.ROOF_RIGHT;
  // Windows
  tiles[row + 1][col] = T.WALL_LEFT;
  tiles[row + 1][col + 1] = T.WINDOW;
  tiles[row + 1][col + 2] = T.WINDOW;
  tiles[row + 1][col + 3] = T.WALL_RIGHT;
  // Door row
  tiles[row + 2][col] = T.WALL_LEFT;
  tiles[row + 2][col + 1] = T.WALL;
  tiles[row + 2][col + 2] = T.DOOR;
  tiles[row + 2][col + 3] = T.WALL_RIGHT;
}

/**
 * Place a 6-wide × 4-tall capital building (Welcome Center).
 * Row 0: roof
 * Row 1: windows
 * Row 2: windows
 * Row 3: walls with double door in center
 */
function placeCapitalBuilding(tiles: Tile[][], row: number, col: number) {
  // Roof row
  tiles[row][col] = T.ROOF_LEFT;
  for (let c = col + 1; c < col + 5; c++) tiles[row][c] = T.ROOF;
  tiles[row][col + 5] = T.ROOF_RIGHT;
  // Window row 1
  tiles[row + 1][col] = T.WALL_LEFT;
  tiles[row + 1][col + 1] = T.WINDOW;
  tiles[row + 1][col + 2] = T.WALL;
  tiles[row + 1][col + 3] = T.WALL;
  tiles[row + 1][col + 4] = T.WINDOW;
  tiles[row + 1][col + 5] = T.WALL_RIGHT;
  // Window row 2
  tiles[row + 2][col] = T.WALL_LEFT;
  tiles[row + 2][col + 1] = T.WINDOW;
  tiles[row + 2][col + 2] = T.WINDOW;
  tiles[row + 2][col + 3] = T.WINDOW;
  tiles[row + 2][col + 4] = T.WINDOW;
  tiles[row + 2][col + 5] = T.WALL_RIGHT;
  // Door row
  tiles[row + 3][col] = T.WALL_LEFT;
  tiles[row + 3][col + 1] = T.WALL;
  tiles[row + 3][col + 2] = T.DOOR;
  tiles[row + 3][col + 3] = T.DOOR;
  tiles[row + 3][col + 4] = T.WALL;
  tiles[row + 3][col + 5] = T.WALL_RIGHT;
}

/**
 * Place the player's house (4-wide × 3-tall with HOUSE_DOOR).
 */
function placePlayerHouse(tiles: Tile[][], row: number, col: number) {
  // Roof
  tiles[row][col] = T.ROOF_LEFT;
  tiles[row][col + 1] = T.ROOF;
  tiles[row][col + 2] = T.ROOF;
  tiles[row][col + 3] = T.ROOF_RIGHT;
  // Windows
  tiles[row + 1][col] = T.WALL_LEFT;
  tiles[row + 1][col + 1] = T.WINDOW;
  tiles[row + 1][col + 2] = T.WINDOW;
  tiles[row + 1][col + 3] = T.WALL_RIGHT;
  // Door row (blue HOUSE_DOOR)
  tiles[row + 2][col] = T.WALL_LEFT;
  tiles[row + 2][col + 1] = T.WALL;
  tiles[row + 2][col + 2] = T.HOUSE_DOOR;
  tiles[row + 2][col + 3] = T.WALL_RIGHT;
}

// ── Iowa City Map ──

function createIowaCityMap(): GameMap {
  const cols = 60;
  const rows = 40;

  // Fill with grass
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

  // ── East-side path from bridge to downtown ──
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

  // ── Path edges along E-W paths ──
  for (let c = 6; c <= 53; c++) {
    if (c >= 24 && c <= 27) continue; // skip river
    if (tiles[18][c] === T.GRASS || tiles[18][c] === T.GRASS2) tiles[18][c] = T.PATH_EDGE;
    if (tiles[21][c] === T.GRASS || tiles[21][c] === T.GRASS2) tiles[21][c] = T.PATH_EDGE;
  }

  // ── Player's house (west side, row 15, col 10-13) ──
  placePlayerHouse(tiles, 15, 10);

  // ── Small dirt yard in front of house ──
  fillRect(tiles, 18, 10, 4, 1, T.DIRT);

  // ── West-side tree clusters (parks) ──
  // Park north of house
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

  // Park south of house
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
    if (c === 12 || c === 13) continue; // gap for path
    tiles[25][c] = T.FENCE;
  }

  // ── East side: Brick pedestrian mall (rows 14-25, cols 32-53) ──
  fillRect(tiles, 14, 32, 22, 12, T.BRICK);

  // ── N-S path through mall center (cols 40-41) ──
  for (let r = 8; r <= 35; r++) {
    if (r >= 14 && r <= 25) continue; // mall covers this
    tiles[r][40] = T.PATH;
    tiles[r][41] = T.PATH;
  }

  // ── Path connecting mall to bridge ──
  // Already covered by E-W path rows 19-20

  // ── Capital building — Welcome Center (row 10, cols 38-43) ──
  placeCapitalBuilding(tiles, 10, 38);

  // ── Community buildings on the brick mall ──

  // Football Soccer — NW of plaza (row 15, col 33)
  placeBuilding(tiles, 15, 33);

  // Hip Hop House — NE of plaza (row 15, col 49)
  placeBuilding(tiles, 15, 49);

  // Language Exchange — SW of plaza (row 22, col 33)
  placeBuilding(tiles, 22, 33);

  // Food & Cooking — SE of plaza (row 22, col 49)
  placeBuilding(tiles, 22, 49);

  // ── East-side trees along river bank ──
  for (const [r, c] of [
    [4, 29],
    [8, 28],
    [14, 29],
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
    { col: 40, row: 13, id: "welcome-center", label: "Welcome Center" },
    { col: 41, row: 13, id: "welcome-center", label: "Welcome Center" },
    { col: 12, row: 17, id: "my-place", label: "My Place" },
    { col: 35, row: 17, id: "football-soccer", label: "Football (Soccer)" },
    { col: 51, row: 17, id: "hip-hop-house", label: "Hip Hop House" },
    { col: 35, row: 24, id: "language-exchange", label: "Language Exchange" },
    { col: 51, row: 24, id: "food-cooking", label: "Food & Cooking" },
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
