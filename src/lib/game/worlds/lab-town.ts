// The /iso-lab fixture, promoted from IsoLab's hardcoded SCENE into a real
// IsoWorld document. This is a *dev fixture* for exercising the schema, collision,
// and movement — NOT the real starter town (that gets composed deliberately in
// Phase 4). It keeps the lab's layout (a cottage, a tree scatter, a dirt clearing)
// and adds a door + a warp shrine so every part of the model is represented.

import type { IsoWorld, TerrainKind } from "../world-model";
import type { Door, MushroomWarp, Region } from "../types";

const COLS = 24;
const ROWS = 24;

function buildTerrain(): TerrainKind[][] {
  const terrain: TerrainKind[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => "grass" as TerrainKind),
  );
  // A bare dirt clearing the cottage sits on.
  for (let r = 6; r <= 9; r++) {
    for (let c = 7; c <= 11; c++) {
      terrain[r][c] = "dirt";
    }
  }
  return terrain;
}

const doors: Door[] = [
  // South of the cottage's footprint (rows 6–7) — a walkable approach tile.
  { col: 9, row: 8, id: "welcome-center", label: "Welcome Center" },
];

const mushrooms: MushroomWarp[] = [
  {
    id: "mushroom-lab-grove",
    col: 9,
    row: 13,
    label: "Grove Shrine",
    nodeId: "capital",
    connections: "all",
    reachableOnFoot: true,
  },
];

const regions: Region[] = [
  { id: "lab-town", label: "Lab Town", bounds: { col: 0, row: 0, w: COLS, h: ROWS } },
];

export const LAB_TOWN: IsoWorld = {
  cols: COLS,
  rows: ROWS,
  spawn: { col: 12, row: 12 },
  terrain: buildTerrain(),
  objects: [
    { kind: "house", col: 9, row: 7 },
    { kind: "oak_big", col: 4, row: 5 },
    { kind: "oak1", col: 6, row: 14 },
    { kind: "pine1", col: 9, row: 16 },
    { kind: "oak2", col: 16, row: 9 },
    { kind: "pine2", col: 18, row: 13 },
    { kind: "oak1", col: 14, row: 18 },
    { kind: "pine1", col: 20, row: 17 },
    { kind: "oak2", col: 5, row: 18 },
    { kind: "bush_large", col: 16, row: 14 },
    { kind: "bush", col: 10, row: 15 },
    { kind: "rock", col: 15, row: 11 },
    { kind: "mushroom", col: 9, row: 13 },
  ],
  doors,
  mushrooms,
  regions,
};
