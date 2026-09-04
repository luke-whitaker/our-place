// The nine community building interiors, and the PC network that links them.
//
// Each room is one short spec (see interior.ts); the generator lays the floor,
// the two back walls, the doorway, and the computer. Rooms differ by size, by
// where the light falls (windows), by the stone patch on the floor, and by what
// is standing in them — a music hall reads as a music hall because of its chairs
// and its stage crates, not because its geometry is special.
//
// Room size follows the building's exterior footprint, so the hall you walk into
// is the size the hall outside promised.

import type { WorldLink } from "../types";
import type { IsoWorld } from "../world-model";
import { buildInterior, EXIT_DOOR_ID, type InteriorSpec } from "./interior";

/** The id of the single PC in every interior. Also the `at=` value that lands you
 * standing at it, so a PC-to-PC warp arrives where it should. */
export const PC_ID = "pc";

/** `<slug>-inside` — the `?place=` value for a building's room. The exterior
 * door warps here, and the room's exit warps back to `<slug>` in the Capital. */
export function interiorPlace(slug: string): string {
  return `${slug}-inside`;
}

/** The room specs, minus the network links — those are woven in below, because
 * every room needs to name all the others. */
const ROOMS: ReadonlyArray<Omit<InteriorSpec, "id" | "exit" | "pcHref" | "links">> = [
  {
    label: "Welcome Center",
    cols: 15,
    rows: 15,
    doorCol: 9,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5, 11, 12],
    windowRows: [5, 6, 9, 10],
    flagstones: [6, 5, 9, 8],
    props: [
      { kind: "chair", col: 3, row: 3 },
      { kind: "flower_box1", col: 2, row: 6 },
      { kind: "flower_box2", col: 2, row: 10 },
      { kind: "wardrobe", col: 3, row: 13 },
      { kind: "bucket", col: 2, row: 8 },
      { kind: "jar_blue", col: 12, row: 2 },
      { kind: "jar_red", col: 13, row: 3 },
      { kind: "barrel", col: 13, row: 5 },
      { kind: "crate1", col: 13, row: 12 },
      { kind: "chair", col: 11, row: 9 },
    ],
  },
  {
    label: "Creative",
    cols: 13,
    rows: 13,
    doorCol: 8,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5],
    windowRows: [7, 8],
    flagstones: [7, 7, 10, 10],
    props: [
      { kind: "tools", col: 2, row: 4 },
      { kind: "jar_blue", col: 2, row: 6 },
      { kind: "jar_red", col: 2, row: 7 },
      { kind: "jar_yellow", col: 2, row: 8 },
      { kind: "crate1", col: 3, row: 11 },
      { kind: "crate2", col: 4, row: 11 },
      { kind: "grindstone", col: 10, row: 3 },
      { kind: "barrel", col: 11, row: 6 },
      { kind: "chair", col: 8, row: 8 },
    ],
  },
  {
    label: "Community Support",
    cols: 13,
    rows: 13,
    doorCol: 7,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5, 9, 10],
    windowRows: [5, 6],
    flagstones: [5, 5, 9, 9],
    props: [
      // Chairs facing in around the stone floor: the room is for sitting down
      // together, so the furniture says so before anyone reads a word.
      { kind: "chair", col: 5, row: 4 },
      { kind: "chair", col: 7, row: 4 },
      { kind: "chair", col: 9, row: 4 },
      { kind: "chair", col: 5, row: 10 },
      { kind: "chair", col: 7, row: 10 },
      { kind: "chair", col: 9, row: 10 },
      { kind: "flower_box3", col: 2, row: 9 },
      { kind: "bucket", col: 11, row: 11 },
      { kind: "jar_yellow", col: 11, row: 2 },
    ],
  },
  {
    label: "Technology",
    cols: 13,
    rows: 13,
    doorCol: 8,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5, 6],
    windowRows: [4, 5],
    flagstones: [2, 8, 6, 11],
    props: [
      { kind: "tools", col: 2, row: 7 },
      { kind: "anvil", col: 3, row: 10 },
      { kind: "grindstone", col: 5, row: 11 },
      { kind: "logs", col: 2, row: 11 },
      { kind: "crate1", col: 11, row: 3 },
      { kind: "crate2", col: 11, row: 4 },
      { kind: "crate3", col: 11, row: 5 },
      { kind: "barrel", col: 10, row: 8 },
      { kind: "axe_trunk", col: 11, row: 10 },
    ],
  },
  {
    label: "Health",
    cols: 13,
    rows: 13,
    doorCol: 7,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5, 9, 10],
    windowRows: [4, 5, 8, 9],
    flagstones: [4, 6, 10, 10],
    props: [
      { kind: "tub", col: 5, row: 8 },
      { kind: "tub", col: 9, row: 8 },
      { kind: "bucket", col: 5, row: 10 },
      { kind: "bucket", col: 9, row: 10 },
      { kind: "flower_box1", col: 2, row: 6 },
      { kind: "flower_box4", col: 2, row: 10 },
      { kind: "jar_blue", col: 11, row: 2 },
      { kind: "jar_yellow", col: 11, row: 3 },
    ],
  },
  {
    label: "Music",
    cols: 13,
    rows: 13,
    doorCol: 9,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5, 6, 7],
    windowRows: [9, 10],
    // The stage: a stone platform at the room's north end, crates for risers.
    flagstones: [4, 3, 8, 5],
    props: [
      { kind: "crate1", col: 4, row: 3 },
      { kind: "crate2", col: 8, row: 3 },
      { kind: "chair", col: 4, row: 8 },
      { kind: "chair", col: 6, row: 8 },
      { kind: "chair", col: 8, row: 8 },
      { kind: "chair", col: 4, row: 10 },
      { kind: "chair", col: 6, row: 10 },
      { kind: "chair", col: 8, row: 10 },
      { kind: "barrel", col: 11, row: 11 },
    ],
  },
  {
    label: "Food",
    cols: 15,
    rows: 15,
    doorCol: 9,
    pc: { col: 2, row: 2 },
    windowCols: [5, 6, 11, 12],
    windowRows: [4, 5, 10, 11],
    // A long stone kitchen floor down the west side of the hall.
    flagstones: [2, 4, 5, 12],
    props: [
      { kind: "barrel", col: 3, row: 5 },
      { kind: "barrel", col: 3, row: 7 },
      { kind: "fruit_crate", col: 2, row: 9 },
      { kind: "fruit_crate", col: 3, row: 10 },
      { kind: "jar_red", col: 2, row: 6 },
      { kind: "jar_yellow", col: 2, row: 7 },
      { kind: "tub", col: 4, row: 12 },
      { kind: "logs", col: 2, row: 12 },
      // The long table, as two runs of chairs down the hall.
      { kind: "chair", col: 9, row: 6 },
      { kind: "chair", col: 9, row: 8 },
      { kind: "chair", col: 9, row: 10 },
      { kind: "chair", col: 12, row: 6 },
      { kind: "chair", col: 12, row: 8 },
      { kind: "chair", col: 12, row: 10 },
    ],
  },
  {
    label: "Gaming",
    cols: 13,
    rows: 13,
    doorCol: 8,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5],
    windowRows: [6, 7],
    flagstones: [6, 6, 9, 9],
    props: [
      { kind: "chair", col: 5, row: 6 },
      { kind: "chair", col: 5, row: 8 },
      { kind: "chair", col: 10, row: 6 },
      { kind: "chair", col: 10, row: 8 },
      { kind: "crate1", col: 11, row: 2 },
      { kind: "crate3", col: 11, row: 3 },
      { kind: "jar_blue", col: 2, row: 10 },
      { kind: "barrel", col: 3, row: 11 },
      { kind: "logs", col: 11, row: 11 },
    ],
  },
  {
    label: "Sports",
    cols: 13,
    rows: 13,
    doorCol: 7,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5, 9, 10],
    windowRows: [4, 5],
    flagstones: [4, 7, 10, 11],
    props: [
      { kind: "garden_cart", col: 3, row: 4 },
      { kind: "tub", col: 2, row: 7 },
      { kind: "bucket", col: 2, row: 9 },
      { kind: "wardrobe", col: 3, row: 11 },
      { kind: "crate2", col: 11, row: 3 },
      { kind: "barrel", col: 11, row: 5 },
      { kind: "chair", col: 10, row: 9 },
      { kind: "logs", col: 11, row: 11 },
    ],
  },
];

/** Building slugs in the order their rooms are declared above; the same nine the
 * Capital raises buildings for. Exported so the Capital can assert they match. */
export const INTERIOR_SLUGS: ReadonlyArray<string> = [
  "welcome-center",
  "creative",
  "community-support",
  "technology",
  "health",
  "music",
  "food",
  "gaming",
  "sports",
];

/** The PC directory a room offers: every other building's terminal, then home.
 * A network of terminals is a phone book, not a discovery — you look an address
 * up, you do not stumble on it — so these are always listed, like world links. */
function networkLinks(ownSlug: string): WorldLink[] {
  const others = INTERIOR_SLUGS.map((slug, i) => ({ slug, label: ROOMS[i].label })).filter(
    (b) => b.slug !== ownSlug,
  );
  const links: WorldLink[] = others.map((b) => ({
    id: b.slug,
    label: b.label,
    place: interiorPlace(b.slug),
    spawnAt: PC_ID,
  }));
  // Your own house terminal, so the network always offers a way home.
  links.push({ id: "home", label: "Home", place: interiorPlace("me"), spawnAt: PC_ID });
  return links;
}

function buildRoom(index: number): IsoWorld {
  const slug = INTERIOR_SLUGS[index];
  return buildInterior({
    ...ROOMS[index],
    id: interiorPlace(slug),
    exit: { warpTo: "capital", spawnAt: slug },
    pcHref: `/communities/${slug}`,
    links: networkLinks(slug),
  });
}

/** Every building interior, keyed by its `?place=` value. Built once at module
 * load: the rooms are authored data, so there is nothing per-request about them. */
export const INTERIORS: Record<string, IsoWorld> = Object.fromEntries(
  INTERIOR_SLUGS.map((slug, i) => [interiorPlace(slug), buildRoom(i)]),
);

/** Look up a room by its `?place=` value. Takes only the map's own keys, never
 * anything inherited: `place` comes straight off the URL, so a bare `in` check
 * would answer true for `toString` and hand back a function. */
export function findInterior(place: string): IsoWorld | null {
  return Object.hasOwn(INTERIORS, place) ? INTERIORS[place] : null;
}

/** The links an island house's PC offers: the whole public directory. Every
 * building is public, so a member's own terminal reaches all of them. */
export function houseNetworkLinks(): WorldLink[] {
  return INTERIOR_SLUGS.map((slug, i) => ({
    id: slug,
    label: ROOMS[i].label,
    place: interiorPlace(slug),
    spawnAt: PC_ID,
  }));
}

export { EXIT_DOOR_ID };
