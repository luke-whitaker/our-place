// Where everything sits in the grown Capital world, after Luke's hand-drawn map
// (September 28, 2026): the old 104x88 Capital in the middle, snow across the
// north, the swamp to the west, the lake to the east, autumn in the south-west,
// and the uncharted sea along the whole south. Row 0 is north.

import type { Ellipse } from "./map-builder";

export const WORLD_COLS = 312;
export const WORLD_ROWS = 264;

/** Where the old Capital map's (0, 0) sits in the grown world. Saves from
 * before the expansion shift by exactly this (see iso-save.ts). */
export const CORE_OFFSET = { col: 104, row: 80 } as const;
export const CORE_COLS = 104;
export const CORE_ROWS = 88;

/** The swamp: a walled ellipse with three ways in. */
export const SWAMP: Ellipse = { col: 54, row: 122, rx: 34, ry: 30 };
/** Angles of the swamp's openings: north, west, and south-east. */
export const SWAMP_OPENINGS = [-Math.PI / 2, Math.PI, Math.PI / 4] as const;

/** The lake: open water inside a walkable shore, walled, open on the west. */
export const LAKE: Ellipse = { col: 264, row: 114, rx: 40, ry: 36 };
/** Normalized radius where the water ends and the shore begins. */
export const LAKE_WATER = 0.78;
export const LAKE_OPENINGS = [Math.PI + 0.4, Math.PI - 0.4] as const;

/** Rough row where the snow gives way to forest; the real line wanders. */
export const SNOW_LINE = 36;
/** Rough first row of open sea; the real coast wanders a few rows. */
export const COAST_ROW = 223;

/** The island just offshore, straight south of the Capital: seen, not reached. */
export const ISLAND = { col: 156, row: 233 } as const;

/** Where a wall-opening's trail starts outside the wall and ends inside it,
 * as fractions of the ellipse's radius. */
export const OPENING_OUTER = 1.35;
export const OPENING_INNER = 0.82;
