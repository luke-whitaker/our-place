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

// ── Named regions (for entry toasts) ──

export interface Region {
  id: string;
  label: string;
  bounds: { col: number; row: number; w: number; h: number };
}

// ── Game Mode ──

export type GameMode = "overworld" | "dialogue" | "fading" | "warp-menu";
