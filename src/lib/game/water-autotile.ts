// Water blob autotiler for the Evergrow "Water_Tiles_Grass" sheet — the water
// analog of forest-autotile.ts. A water tile shows grass toward each of its four
// diamond-edge neighbours that is LAND; the sheet provides one cell per land-edge
// signature. The cell indices were derived by pixel-sampling the sheet (a 4-wide
// blob block, repeated across 5 horizontal animation frames — the same shape with
// rippling water; the renderer cycles them). A tile-space diamond pond uses
// exactly the codes present here (interior 0, sides 3/6/9/c, tips 7/b/d/e).

import { pickVariant } from "./forest-autotile";
import type { TerrainKind } from "./world-model";

export type TerrainGrid = TerrainKind[][];

/** The 4-wide blob block repeats across this many horizontal ripple frames. */
export const WATER_FRAMES = 5;
export const WATER_FRAME_COLS = 4;

// Land-edge signature → sheet cell [col, row] within frame 0 (cols 0–3, rows 0–9).
// Bits: NE=1, SE=2, SW=4, NW=8, set when that diamond neighbour is land (not water).
export const WATER_BLOB: Record<number, ReadonlyArray<readonly [number, number]>> = {
  0x0: [
    [1, 0],
    [3, 0],
  ], // open water — every neighbour is water
  0x3: [[2, 1]], // land NE+SE
  0x6: [[0, 6]], // land SE+SW
  0x9: [[2, 0]], // land NE+NW
  0xc: [[1, 1]], // land SW+NW
  0x7: [[3, 2]], // land NE+SE+SW (tip)
  0xb: [[3, 3]], // land NE+SE+NW (tip)
  0xd: [[1, 2]], // land NE+SW+NW (tip)
  0xe: [[0, 8]], // land SE+SW+NW (tip)
  0x4: [[3, 1]], // land SW only
};

/** Out-of-bounds reads as land, so a pond at the map edge stays bordered. */
export function isWaterAt(t: TerrainGrid, col: number, row: number): boolean {
  if (row < 0 || row >= t.length || col < 0 || col >= t[0].length) return false;
  return t[row][col] === "water";
}

/** Land-edge signature — which of the four diamond neighbours are NOT water. */
export function waterEdgeCode(t: TerrainGrid, col: number, row: number): number {
  let code = 0;
  if (!isWaterAt(t, col, row - 1)) code |= 1; // NE
  if (!isWaterAt(t, col + 1, row)) code |= 2; // SE
  if (!isWaterAt(t, col, row + 1)) code |= 4; // SW
  if (!isWaterAt(t, col - 1, row)) code |= 8; // NW
  return code;
}

/** Frame-0 sheet cell [col, row] for the water tile at (col,row). The renderer
 * offsets the column by the current ripple frame. Unmapped codes (a non-convex
 * shore) fall back to open water. */
export function waterCell(t: TerrainGrid, col: number, row: number): readonly [number, number] {
  const cells = WATER_BLOB[waterEdgeCode(t, col, row)] ?? WATER_BLOB[0x0];
  return pickVariant(cells, col, row);
}
