// 4-edge isometric blob autotiler for the Evergrow "Forest_Tiles" ground sheet
// (32×32 cells; see iso.ts for the geometry). Logical terrain is grass vs dirt;
// a grass tile shows grass toward each of its four diamond-edge neighbours that
// is also grass, and the sheet provides one cell per edge signature. The cell
// indices were derived empirically by sampling grass coverage at each tile's four
// diamond edges (see the iso-world-migration memory note).

/** Logical terrain grid, indexed [row][col]; true = grass, false = dirt. */
export type Terrain = boolean[][];

// Edge bits, keyed by the neighbour across each diamond edge. The directions come
// straight from the iso projection: -row is screen-NE, +col screen-SE, +row
// screen-SW, -col screen-NW.
export const EDGE = { NE: 1, SE: 2, SW: 4, NW: 8 } as const;

/** Sheet cell `[col, row]` (in 32px units) for each grass edge-signature code. */
export const FOREST_BLOB: Record<number, ReadonlyArray<readonly [number, number]>> = {
  0xf: [
    [0, 1],
    [1, 1],
    [3, 1],
    [4, 1],
    [5, 1],
    [6, 1],
  ], // full grass (interior) — variants
  0x7: [
    [1, 0],
    [0, 4],
    [2, 3],
  ], // dirt across NW edge (others grass)
  0xb: [
    [0, 3],
    [2, 4],
  ], // dirt across SW edge
  0xd: [
    [1, 3],
    [2, 0],
  ], // dirt across SE edge
  0xe: [
    [3, 3],
    [1, 4],
  ], // dirt across NE edge
  0xc: [
    [0, 2],
    [4, 2],
  ], // grass only on the W edges (NW+SW)
  0x3: [
    [1, 2],
    [5, 2],
  ], // grass only on the E edges (NE+SE)
  0x6: [
    [2, 2],
    [6, 2],
  ], // grass only on the S edges (SE+SW)
  0x9: [
    [3, 2],
    [0, 6],
  ], // grass only on the N edges (NE+NW)
  0x8: [[7, 2]], // grass only on the NW edge (rare)
};

/** Plain dirt cells (edge code 0). */
export const DIRT_CELLS: ReadonlyArray<readonly [number, number]> = [
  [5, 4],
  [6, 4],
  [4, 5],
  [5, 5],
];

/** Out-of-bounds reads as grass so a finite grass field has no border seam. */
export function grassAt(t: Terrain, col: number, row: number): boolean {
  if (row < 0 || row >= t.length || col < 0 || col >= t[0].length) return true;
  return t[row][col];
}

/** The 4-edge grass signature (0–15) for the grass tile at (col,row). */
export function edgeCode(t: Terrain, col: number, row: number): number {
  let code = 0;
  if (grassAt(t, col, row - 1)) code |= EDGE.NE;
  if (grassAt(t, col + 1, row)) code |= EDGE.SE;
  if (grassAt(t, col, row + 1)) code |= EDGE.SW;
  if (grassAt(t, col - 1, row)) code |= EDGE.NW;
  return code;
}

/** Deterministic per-position pick so a field varies but never flickers. */
export function pickVariant<T>(cells: ReadonlyArray<T>, col: number, row: number): T {
  const h = (Math.imul(col, 73856093) ^ Math.imul(row, 19349663)) >>> 0;
  return cells[h % cells.length];
}

/** The Forest_Tiles cell `[col, row]` to draw for the ground at (col,row). */
export function groundCell(t: Terrain, col: number, row: number): readonly [number, number] {
  if (!grassAt(t, col, row)) return pickVariant(DIRT_CELLS, col, row);
  const code = edgeCode(t, col, row);
  // Absent codes (thin grass peninsulas / diagonals) fall back to full grass —
  // designed maps keep grass regions convex so this rarely triggers.
  const cells = FOREST_BLOB[code] ?? FOREST_BLOB[0xf];
  return pickVariant(cells, col, row);
}
