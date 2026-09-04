// Building interiors, generated from a short spec rather than hand-typed grids.
//
// An interior is an ordinary IsoWorld — no new terrain kind, no engine branch.
// It names the wooden ground sheet, so `grass` paints as floorboards and `dirt`
// as stone flags, and both stay walkable. Walls are objects, which is what the
// model already implies: in iso, structures are objects, depth-sorted like trees.
//
// The room is sealed without drawing the two near walls. North and west are
// solid wall objects; south and east are closed by the `void` ring the camera
// looks over. That is the standard iso cheat and it keeps the room readable.
//
// Wall placement is not free-form: `world-object.ts` anchors a sprite at the
// bottom-centre of its opaque content and draws that on the tile centre, so a
// wall's lowest base pixel pins to the tile it sits on. Walls therefore go on the
// room's own edge tiles, never on the void outside them, or the art floats half a
// tile clear of the floor.

import type { IsoWorld, PlacedObjectData, TerrainKind } from "../world-model";
import type { Door, Pc, Region, WorldLink } from "../types";

/** The wooden interior sheet, painted in the Forest_Tiles cell layout. */
export const INTERIOR_GROUND = "/world/tiles/interior_wood.png";

/** The id every interior gives its way out, so a building's exterior door can
 * warp in with `spawnAt: EXIT_DOOR_ID` without knowing the room's layout. */
export const EXIT_DOOR_ID = "exit";

/** Default room: a 13×13 document, which is a 10×10 floor once the void ring and
 * the two back walls are taken out. Big enough to furnish, small enough to read
 * without the camera clamping oddly. */
const DEFAULT_SIZE = 13;

export interface InteriorSpec {
  /** `/world?place=` value and save slot. Always `<exterior door id>-inside`. */
  id: string;
  /** Shown in the region toast on arrival and as the page heading. */
  label: string;
  cols?: number;
  rows?: number;
  /** Column of the doorway in the north wall; the exit door stands on it. */
  doorCol: number;
  /** The `?place=` value the exit leads back to, and the door id to arrive at. */
  exit: { warpTo: string; spawnAt: string };
  /** The PC's tile. The computer sprite is placed here too, so the two can never
   * drift apart. Put it against a back wall: the screen faces south-east. */
  pc: { col: number; row: number };
  /** Where the PC's "log on" row goes. Empty means travel only. */
  pcHref: string;
  /** Wall segments painted as windows: columns on the north wall, rows on the west. */
  windowCols?: readonly number[];
  windowRows?: readonly number[];
  /** Floor tiles laid as stone flags instead of boards, as [col0, row0, col1, row1]. */
  flagstones?: readonly [number, number, number, number];
  /** Furniture, in room coordinates. Anything solid blocks its tile. */
  props?: readonly PlacedObjectData[];
  /** Destinations the PC offers besides logging on — the rest of the network. */
  links?: readonly WorldLink[];
}

/** The floor rectangle: everything inside the void ring. The two back walls stand
 * on its north row and west column, so walkable floor starts one tile in. */
function floorBounds(cols: number, rows: number) {
  return { c0: 1, r0: 1, c1: cols - 2, r1: rows - 2 };
}

/** Void ring outside, boards inside, flags on the optional stone patch. */
function buildTerrain(spec: Required<Pick<InteriorSpec, "cols" | "rows">> & InteriorSpec) {
  const { cols, rows } = spec;
  const b = floorBounds(cols, rows);
  const flags = spec.flagstones;
  const terrain: TerrainKind[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: TerrainKind[] = [];
    for (let c = 0; c < cols; c++) {
      const inside = c >= b.c0 && c <= b.c1 && r >= b.r0 && r <= b.r1;
      if (!inside) {
        line.push("void");
        continue;
      }
      const flagged = !!flags && c >= flags[0] && c <= flags[2] && r >= flags[1] && r <= flags[3];
      line.push(flagged ? "dirt" : "grass");
    }
    terrain.push(line);
  }
  return terrain;
}

/** The north and west walls, plus the corner that joins them. The doorway takes
 * the door variant and the named columns/rows take the window variant. */
function buildWalls(spec: Required<Pick<InteriorSpec, "cols" | "rows">> & InteriorSpec) {
  const b = floorBounds(spec.cols, spec.rows);
  const windowCols = new Set(spec.windowCols ?? []);
  const windowRows = new Set(spec.windowRows ?? []);
  const walls: PlacedObjectData[] = [{ kind: "wall_corner", col: b.c0, row: b.r0 }];

  for (let c = b.c0 + 1; c <= b.c1; c++) {
    const kind =
      c === spec.doorCol ? "wall_col_door" : windowCols.has(c) ? "wall_col_window" : "wall_col";
    walls.push({ kind, col: c, row: b.r0 });
  }
  for (let r = b.r0 + 1; r <= b.r1; r++) {
    walls.push({ kind: windowRows.has(r) ? "wall_row_window" : "wall_row", col: b.c0, row: r });
  }
  return walls;
}

/**
 * Build a room from its spec. The round trip closes itself with no new spawn
 * machinery: the exterior door warps here with `spawnAt: "exit"` and lands one
 * tile south of this room's exit door, and this exit warps back to `spec.exit`.
 * `spawnAt` already resolves against a world's doors by id (see WorldCanvas).
 */
export function buildInterior(spec: InteriorSpec): IsoWorld {
  const cols = spec.cols ?? DEFAULT_SIZE;
  const rows = spec.rows ?? DEFAULT_SIZE;
  const full = { ...spec, cols, rows };

  const doors: Door[] = [
    {
      col: spec.doorCol,
      row: floorBounds(cols, rows).r0,
      id: EXIT_DOOR_ID,
      label: "Outside",
      warpTo: spec.exit.warpTo,
      spawnAt: spec.exit.spawnAt,
    },
  ];

  const pcs: Pc[] = [
    { col: spec.pc.col, row: spec.pc.row, id: "pc", label: `${spec.label} PC`, href: spec.pcHref },
  ];

  const regions: Region[] = [
    { id: spec.id, label: spec.label, bounds: { col: 0, row: 0, w: cols, h: rows } },
  ];

  return {
    id: spec.id,
    groundSheet: INTERIOR_GROUND,
    cols,
    rows,
    // Two tiles south of the doorway: inside the room, clear of the wall.
    spawn: { col: spec.doorCol, row: floorBounds(cols, rows).r0 + 2 },
    terrain: buildTerrain(full),
    objects: [
      ...buildWalls(full),
      { kind: "computer", col: spec.pc.col, row: spec.pc.row },
      ...(spec.props ?? []),
    ],
    doors,
    pcs,
    mushrooms: [],
    links: [...(spec.links ?? [])],
    regions,
  };
}
