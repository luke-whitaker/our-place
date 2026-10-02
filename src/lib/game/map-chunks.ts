// Where a member has been, as 1 bit per 8x8-tile chunk, row-major. Shared by
// the server (which stores and merges it) and the world client (which marks
// it as you walk and fogs the map with it). Small on purpose: the grown
// Capital is 39x33 chunks, 161 bytes.

/** Tiles per chunk side. */
export const CHUNK_TILES = 8;

/** How far around the player counts as seen, in tiles: about what a phone
 * screen shows, so the map clears what you could actually see. */
export const REVEAL_RADIUS = 10;

export interface ChunkGrid {
  /** Chunks across (columns) and down (rows). */
  cw: number;
  ch: number;
  /** Bitmap length in bytes. */
  bytes: number;
}

export function chunkGrid(cols: number, rows: number): ChunkGrid {
  const cw = Math.ceil(cols / CHUNK_TILES);
  const ch = Math.ceil(rows / CHUNK_TILES);
  return { cw, ch, bytes: Math.ceil((cw * ch) / 8) };
}

export function emptyVisited(grid: ChunkGrid): Uint8Array<ArrayBuffer> {
  return new Uint8Array(grid.bytes);
}

/** The chunk a tile falls in, or -1 off the map. */
export function chunkOf(grid: ChunkGrid, col: number, row: number): number {
  const cx = Math.floor(col / CHUNK_TILES);
  const cy = Math.floor(row / CHUNK_TILES);
  if (cx < 0 || cy < 0 || cx >= grid.cw || cy >= grid.ch) return -1;
  return cy * grid.cw + cx;
}

export function isVisited(visited: Uint8Array, chunk: number): boolean {
  if (chunk < 0) return false;
  return (visited[chunk >> 3] & (1 << (chunk & 7))) !== 0;
}

/**
 * Mark every chunk within REVEAL_RADIUS tiles of (col, row) as visited, in
 * place. Returns whether any bit changed, so a caller saves only when there's
 * something new. Bounded: at most a (2R/8 + 2)^2 square of chunks.
 */
export function markAround(
  grid: ChunkGrid,
  visited: Uint8Array,
  col: number,
  row: number,
  radius: number = REVEAL_RADIUS,
): boolean {
  let changed = false;
  const minCx = Math.max(0, Math.floor((col - radius) / CHUNK_TILES));
  const maxCx = Math.min(grid.cw - 1, Math.floor((col + radius) / CHUNK_TILES));
  const minCy = Math.max(0, Math.floor((row - radius) / CHUNK_TILES));
  const maxCy = Math.min(grid.ch - 1, Math.floor((row + radius) / CHUNK_TILES));
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      // Distance from the point to the nearest spot in this chunk's square:
      // a chunk counts once any part of it is within the radius.
      const nearCol = Math.max(cx * CHUNK_TILES, Math.min(col, (cx + 1) * CHUNK_TILES - 1));
      const nearRow = Math.max(cy * CHUNK_TILES, Math.min(row, (cy + 1) * CHUNK_TILES - 1));
      if ((nearCol - col) ** 2 + (nearRow - row) ** 2 > radius * radius) continue;
      const chunk = cy * grid.cw + cx;
      const bit = 1 << (chunk & 7);
      if ((visited[chunk >> 3] & bit) === 0) {
        visited[chunk >> 3] |= bit;
        changed = true;
      }
    }
  }
  return changed;
}

/** Bitwise OR of two bitmaps of the same length: the union of where both say
 * you've been. Merging in any order gives the same answer. */
export function orVisited(a: Uint8Array, b: Uint8Array): Uint8Array<ArrayBuffer> {
  if (a.length !== b.length) throw new Error(`Bitmaps differ in length: ${a.length}, ${b.length}`);
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] | b[i];
  return out;
}

/** Base64 for the wire. btoa/atob exist in browsers and in Node 16+. */
export function encodeVisited(visited: Uint8Array): string {
  return btoa(String.fromCharCode(...visited));
}

/** Null when the text isn't base64 or decodes to the wrong length. */
export function decodeVisited(text: string, grid: ChunkGrid): Uint8Array<ArrayBuffer> | null {
  let raw: string;
  try {
    raw = atob(text);
  } catch {
    return null;
  }
  if (raw.length !== grid.bytes) return null;
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}
