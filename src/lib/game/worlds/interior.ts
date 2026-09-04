// Building interiors, generated from a short spec rather than hand-typed grids.
//
// An interior is an ordinary IsoWorld. It needs no new terrain kind, no engine
// branch: it names the wooden ground sheet, so `grass` paints as floorboards and
// `dirt` as stone flags, and both stay walkable. Walls are objects, which is what
// the model already implies — in iso, structures are objects, depth-sorted like
// trees.
//
// A room is a union of rectangles, not one box. That is the whole reason this
// generator exists: an L-shaped hall, a wing off a corridor, or a kitchen set
// back from a dining room are all just two or three rects, and the walls fall
// out of the resulting outline rather than being placed by hand.
//
// The outline rule is one line: a floor tile carries a wall on whichever of its
// north and west sides is not also floor, and the corner piece where both are.
// The south and east faces are left open and closed off by the surrounding
// `void`, which is the standard iso cutaway — you are looking into the room over
// its two near walls.
//
// Wall placement is not free-form. `world-object.ts` anchors a sprite at the
// bottom-centre of its opaque content and draws that on the tile centre, so a
// wall's lowest base pixel pins to the tile it sits on. Walls therefore go on the
// room's own floor tiles, never on the void outside them, or the art floats half
// a tile clear of the floor. Deriving them from the outline is what makes that
// impossible to get wrong.
//
// Interior partitions need no support here: a partition is a run of `wall_col` or
// `wall_row` in `props`, which is already solid and already depth-sorted.

import type { IsoWorld, PlacedObjectData, TerrainKind } from "../world-model";
import type { Door, Pc, Region, WorldLink } from "../types";

/** The wooden interior sheet, painted in the Forest_Tiles cell layout. */
export const INTERIOR_GROUND = "/world/tiles/interior_wood.png";

/** The id every interior gives its way out, so a building's exterior door can
 * warp in with `spawnAt: EXIT_DOOR_ID` without knowing the room's layout. */
export const EXIT_DOOR_ID = "exit";

/** One rectangle of floor, in room coordinates. Rooms start at (1,1): row 0 and
 * column 0 stay void so the north and west walls have something to stand against
 * visually. */
export interface RoomRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface InteriorSpec {
  /** `/world?place=` value and save slot. Always `<exterior door id>-inside`. */
  id: string;
  /** Shown in the region toast on arrival and as the page heading. */
  label: string;
  /** The room's shape: one rect for a plain box, more for an L or a wing. They
   * may overlap; their union is the floor. */
  floor: readonly RoomRect[];
  /** Column of the doorway. It is cut into whichever north wall covers that
   * column, so the spec never has to work out which run the door lands on. */
  doorCol: number;
  /** The `?place=` value the exit leads back to, and the door id to arrive at. */
  exit: { warpTo: string; spawnAt: string };
  /** The PC's tile. The computer sprite is placed here too, so the two can never
   * drift apart. Put it against a back wall: the screen faces south-east. */
  pc: { col: number; row: number };
  /** Where the PC's "log on" row goes. Empty means travel only. */
  pcHref: string;
  /** Wall segments painted as windows: columns on a north wall, rows on a west one. */
  windowCols?: readonly number[];
  windowRows?: readonly number[];
  /** Floor laid as stone flags instead of boards, as rects in room coordinates.
   * Clipped to the floor, so a patch may overhang the room's edge safely. */
  flagstones?: readonly RoomRect[];
  /** Furniture and interior partitions, in room coordinates. */
  props?: readonly PlacedObjectData[];
  /** Destinations the PC offers besides logging on — the rest of the network. */
  links?: readonly WorldLink[];
}

function key(col: number, row: number): string {
  return `${col},${row}`;
}

/** Every tile covered by a list of rects, as "col,row" keys. */
function tilesOf(rects: readonly RoomRect[]): Set<string> {
  const tiles = new Set<string>();
  for (const rect of rects) {
    for (let r = rect.row; r < rect.row + rect.h; r++) {
      for (let c = rect.col; c < rect.col + rect.w; c++) tiles.add(key(c, r));
    }
  }
  return tiles;
}

/** Document size: the floor's extent plus a one-tile void margin on every side.
 * The margin matters on the south and east, where it is the cutaway the camera
 * looks over. */
function documentSize(floor: readonly RoomRect[]): { cols: number; rows: number } {
  let maxCol = 0;
  let maxRow = 0;
  for (const rect of floor) {
    maxCol = Math.max(maxCol, rect.col + rect.w - 1);
    maxRow = Math.max(maxRow, rect.row + rect.h - 1);
  }
  return { cols: maxCol + 2, rows: maxRow + 2 };
}

/** Void outside the room, boards inside, flags on the stone patches. */
function buildTerrain(spec: InteriorSpec, cols: number, rows: number): TerrainKind[][] {
  const floor = tilesOf(spec.floor);
  const flags = tilesOf(spec.flagstones ?? []);
  const terrain: TerrainKind[][] = [];
  for (let r = 0; r < rows; r++) {
    const line: TerrainKind[] = [];
    for (let c = 0; c < cols; c++) {
      if (!floor.has(key(c, r))) line.push("void");
      else line.push(flags.has(key(c, r)) ? "dirt" : "grass");
    }
    terrain.push(line);
  }
  return terrain;
}

/** The doorway's tile: the north-most floor tile in the door's column, which is
 * exactly the wall segment that column's wall run puts there. */
function doorTile(spec: InteriorSpec, rows: number): { col: number; row: number } {
  const floor = tilesOf(spec.floor);
  for (let r = 0; r < rows; r++) {
    if (floor.has(key(spec.doorCol, r))) return { col: spec.doorCol, row: r };
  }
  throw new Error(`interior "${spec.id}": doorCol ${spec.doorCol} has no floor`);
}

/**
 * Walls, derived from the floor outline. A floor tile takes a wall on whichever
 * of its north and west sides is not floor, and the corner piece when both are.
 * An L-shaped room gets its stepped-back walls for free; a plain rectangle gets
 * exactly the north row and west column it always did.
 */
function buildWalls(spec: InteriorSpec, cols: number, rows: number): PlacedObjectData[] {
  const floor = tilesOf(spec.floor);
  const windowCols = new Set(spec.windowCols ?? []);
  const windowRows = new Set(spec.windowRows ?? []);
  const door = doorTile(spec, rows);
  const walls: PlacedObjectData[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!floor.has(key(c, r))) continue;
      const openNorth = !floor.has(key(c, r - 1));
      const openWest = !floor.has(key(c - 1, r));
      if (openNorth && openWest) walls.push({ kind: "wall_corner", col: c, row: r });
      else if (openNorth) walls.push({ kind: northKind(c, r, door, windowCols), col: c, row: r });
      else if (openWest) {
        walls.push({ kind: windowRows.has(r) ? "wall_row_window" : "wall_row", col: c, row: r });
      }
    }
  }
  return walls;
}

function northKind(
  col: number,
  row: number,
  door: { col: number; row: number },
  windowCols: Set<number>,
): string {
  if (col === door.col && row === door.row) return "wall_col_door";
  return windowCols.has(col) ? "wall_col_window" : "wall_col";
}

/**
 * Build a room from its spec. The round trip closes itself with no new spawn
 * machinery: the exterior door warps here with `spawnAt: "exit"` and lands one
 * tile south of this room's exit door, and this exit warps back to `spec.exit`.
 * `spawnAt` already resolves against a world's doors by id (see WorldCanvas).
 */
export function buildInterior(spec: InteriorSpec): IsoWorld {
  const { cols, rows } = documentSize(spec.floor);
  const door = doorTile(spec, rows);

  const doors: Door[] = [
    {
      ...door,
      id: EXIT_DOOR_ID,
      label: "Outside",
      warpTo: spec.exit.warpTo,
      spawnAt: spec.exit.spawnAt,
    },
  ];

  const pcs: Pc[] = [{ ...spec.pc, id: "pc", label: `${spec.label} PC`, href: spec.pcHref }];

  const regions: Region[] = [
    { id: spec.id, label: spec.label, bounds: { col: 0, row: 0, w: cols, h: rows } },
  ];

  return {
    id: spec.id,
    groundSheet: INTERIOR_GROUND,
    cols,
    rows,
    // Two tiles south of the doorway: inside the room, clear of the wall.
    spawn: { col: door.col, row: door.row + 2 },
    terrain: buildTerrain(spec, cols, rows),
    objects: [
      ...buildWalls(spec, cols, rows),
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
