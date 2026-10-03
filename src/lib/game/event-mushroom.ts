// Event Mushrooms: where a world gathering's host may plant its mushroom, and
// how planted mushrooms join a world. Pure tile math over the world document,
// shared by the plant route (which is authoritative) and the world client
// (which only uses it to offer "Plant here" where the server will agree).

import { tileToScreen } from "./iso";
import { buildSolidGrid, type SolidGrid } from "./iso-collision";
import { fixtureFootprint, type IsoWorld } from "./world-model";
import type { Dir8 } from "./character-sheet";
import type { EventMushroomFixture } from "./types";

/** `?at=gathering-<id>` lands beside that gathering's mushroom. */
const SPAWN_PREFIX = "gathering-";

export function gatheringSpawnId(gatheringId: string): string {
  return `${SPAWN_PREFIX}${gatheringId}`;
}

/** The gathering id an `at` names, or null when it names something else. */
export function gatheringIdFromSpawn(spawnAt: string | undefined): string | null {
  if (!spawnAt?.startsWith(SPAWN_PREFIX)) return null;
  const id = spawnAt.slice(SPAWN_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** A planted mushroom as the world needs it. */
export interface PlantedMushroom {
  gatheringId: string;
  col: number;
  row: number;
  /** The host's username. */
  host: string;
  /** Whether this viewer may open the gathering. */
  invited: boolean;
}

export function eventMushroomFixture(m: PlantedMushroom): EventMushroomFixture {
  return {
    id: gatheringSpawnId(m.gatheringId),
    kind: "event_mushroom",
    col: m.col,
    row: m.row,
    label: m.invited ? "Open gathering" : "Look at the mushroom",
    owner: m.host,
    gatheringId: m.gatheringId,
    invited: m.invited,
  };
}

/** The world with its planted mushrooms added as fixtures, so reach,
 * collision, the prompt, and drawing treat them like any other furniture.
 * Returns `world` itself when there are none, so memoized consumers keep
 * their identity. */
export function withEventMushrooms(world: IsoWorld, planted: readonly PlantedMushroom[]): IsoWorld {
  if (planted.length === 0) return world;
  return { ...world, fixtures: [...(world.fixtures ?? []), ...planted.map(eventMushroomFixture)] };
}

/** How far a mushroom keeps from anything people use: the engine's reach
 * (INTERACT_TILES), so a prompt never has to choose between the mushroom and
 * a door, shrine, PC, NPC, or fixture. Kept equal by a unit test rather than
 * imported, so the server doesn't load the renderer. */
export const PLANT_CLEARANCE = 1.5;

/** Every tile someone could interact with, the mushroom's neighbours included. */
function interactionTiles(world: IsoWorld): { col: number; row: number }[] {
  const fixtures = (world.fixtures ?? []).flatMap((f) =>
    fixtureFootprint(f).map(({ dc, dr }) => ({ col: f.col + dc, row: f.row + dr })),
  );
  return [
    ...world.doors,
    ...world.mushrooms,
    ...(world.pcs ?? []),
    ...(world.npcs ?? []),
    ...fixtures,
  ];
}

/** How many walkable tiles are reachable from the world's spawn. Bounded by
 * the grid: every tile is visited at most once. */
function reachableCount(grid: SolidGrid, start: { col: number; row: number }): number {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (grid[start.row]?.[start.col] !== false) return 0;
  const seen = new Uint8Array(rows * cols);
  const queue = [start.row * cols + start.col];
  seen[queue[0]] = 1;
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head];
    const r = Math.floor(at / cols);
    const c = at % cols;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const next = nr * cols + nc;
      if (seen[next] || grid[nr][nc]) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return queue.length;
}

/**
 * Why a mushroom can't stand on (col, row), or null when it can. `world`
 * already holds every other planted mushroom (withEventMushrooms). The tile
 * must be open ground reachable from the world's spawn, clear of everything
 * people use, and planting there must not cut anyone off: a gathering's
 * mushroom stays put for up to a week, so it may never seal a path.
 */
export function plantProblem(world: IsoWorld, col: number, row: number): string | null {
  if (!Number.isInteger(col) || !Number.isInteger(row)) return "That isn't a spot in this place.";
  if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) {
    return "That isn't a spot in this place.";
  }
  const grid = buildSolidGrid(world);
  if (grid[row][col]) return "Something's already there. Try open ground.";
  const crowded = interactionTiles(world).some(
    (t) => Math.hypot(t.col - col, t.row - row) < PLANT_CLEARANCE,
  );
  if (crowded) return "Too close to something people use. Try a few steps away.";

  const spawn = { col: Math.floor(world.spawn.col), row: Math.floor(world.spawn.row) };
  const before = reachableCount(grid, spawn);
  grid[row][col] = true;
  const after = reachableCount(grid, spawn);
  // Reachable before means the count drops by exactly this tile; anything
  // more means the mushroom closed off somewhere people could walk.
  if (after !== before - 1) return "It would block the way through. Try a more open spot.";
  return null;
}

/** Screen-space direction of each facing, y down. */
const FACING_VECTORS: Record<Dir8, { x: number; y: number }> = {
  S: { x: 0, y: 1 },
  SE: { x: 1, y: 1 },
  E: { x: 1, y: 0 },
  NE: { x: 1, y: -1 },
  N: { x: 0, y: -1 },
  NW: { x: -1, y: -1 },
  W: { x: -1, y: 0 },
  SW: { x: -1, y: 1 },
};

/** How far ahead of the player's feet, in screen pixels, a planted thing
 * should land: half a tile, so it sits just in front rather than a full tile
 * width away (the neighbour straight left or right on screen is that far). */
const PLANT_AHEAD_PX = 16;

/** The neighbouring tile in front of a player at (col, row) facing `dir`: of
 * the eight around their own tile, the one whose centre is nearest a point
 * half a tile ahead of their feet on screen. A tie goes to the tile lower on
 * screen, which draws in front of the player instead of behind them. Never
 * their own tile, so planting can't stand a solid mushroom on top of them. */
export function frontTile(col: number, row: number, dir: Dir8): { col: number; row: number } {
  const here = { col: Math.floor(col), row: Math.floor(row) };
  const want = FACING_VECTORS[dir];
  const scale = PLANT_AHEAD_PX / Math.hypot(want.x, want.y);
  const target = { x: want.x * scale, y: want.y * scale };
  let best = { col: here.col, row: here.row + 1 };
  let bestDist = Infinity;
  let bestDepth = -Infinity;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dc === 0 && dr === 0) continue;
      const tile = { col: here.col + dc, row: here.row + dr };
      // From the player's exact position to the tile's centre, on screen.
      const v = tileToScreen(tile.col + 0.5 - col, tile.row + 0.5 - row);
      const dist = Math.hypot(v.x - target.x, v.y - target.y);
      const nearer = dist < bestDist - 0.001;
      const tiedButInFront = Math.abs(dist - bestDist) <= 0.001 && v.y > bestDepth;
      if (nearer || tiedButInFront) {
        best = tile;
        bestDist = dist;
        bestDepth = v.y;
      }
    }
  }
  return best;
}

/** Where arriving at a mushroom lands you: the first open tile around it,
 * south first like a shrine, or null if it's boxed in. */
export function mushroomLanding(
  solid: SolidGrid,
  col: number,
  row: number,
): { col: number; row: number } | null {
  const around = [
    [0, 1],
    [1, 0],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (const [dc, dr] of around) {
    const tile = { col: col + dc, row: row + dr };
    if (solid[tile.row]?.[tile.col] === false) return tile;
  }
  return null;
}
