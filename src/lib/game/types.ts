// Shared game types for the iso world: doors, warp shrines, regions, and the
// game-mode enum. The top-down tile/map/player/state types were retired with the
// top-down engine in the iso migration — the iso world model lives in
// world-model.ts and its runtime state in iso-engine.ts.

// ── Doors & Interactions ──

export interface Door {
  col: number;
  row: number;
  /** Identifier passed to the onInteract callback (e.g., community slug). */
  id: string;
  label: string;
  /** When set, Enter warps into this world (a `/world?place=` value) instead of
   * porting to the forum view. Mirrors WorldLink's shape. */
  warpTo?: string;
  /** Where to arrive there: a door or shrine id in the destination world. */
  spawnAt?: string;
}

// ── PCs (the Ports terminals) ──

/** A computer inside a building. Interacting opens a menu with one "log on" row
 * that ports to the forum view of the place it stands in, plus the world's links
 * as PC-to-PC destinations. The third interaction kind, beside doors and shrines. */
export interface Pc {
  col: number;
  row: number;
  id: string;
  label: string;
  /** Where "log on" goes. Empty means this PC only offers travel. */
  href: string;
}

// ── Mushroom warp network (mycelium fast-travel) ──

export interface MushroomWarp {
  id: string;
  col: number;
  row: number;
  label: string;
  /** Which node this mushroom belongs to (or "capital"). */
  nodeId: string;
  /** IDs of other mushrooms reachable from this one. "all" = full mesh. */
  connections: string[] | "all";
  /** Whether this shrine can be reached on foot (vs. warp-only). */
  reachableOnFoot: boolean;
}

// ── World links (the mycelium network between places) ──

/** A warp-menu entry that leaves this world for another place. Always listed,
 * never needs discovering: Home from the Capital, the Capital from an island.
 * `place` is the `/world?place=` value; `spawnAt` a door or shrine id there. */
export interface WorldLink {
  id: string;
  label: string;
  place: string;
  spawnAt?: string;
}

// ── Named regions (for entry toasts) ──

export interface Region {
  id: string;
  label: string;
  bounds: { col: number; row: number; w: number; h: number };
}

// ── Game Mode ──

export type GameMode = "overworld" | "dialogue" | "fading" | "warp-menu" | "pc-menu";
