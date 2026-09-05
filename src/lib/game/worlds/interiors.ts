// The nine community building interiors, and the PC network that links them.
//
// Each room is one short spec (see interior.ts); the generator lays the floor,
// the two back walls, the doorway, and the computer. Rooms are deliberately
// bare. A room reads as its own place through its size and shape, where the
// light falls (windows), and the stone patch on the floor — not through
// scattered furniture, which crowded the rooms and, in four of them, boxed in
// the computer. The only objects a spec places now are the partitions that
// divide a room, so nothing can stand between a member and the terminal.
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
    // The biggest room: a reception hall with a set-back annex (a quiet
    // sign-in nook) at the south-west. West wing flush to the south edge, so
    // the notch is cut from the north-west corner — every face it creates
    // still points north or west. See interior.ts's header for why that rule
    // matters.
    floor: [
      { col: 4, row: 1, w: 14, h: 13 },
      { col: 1, row: 6, w: 3, h: 8 },
    ],
    doorCol: 11,
    pc: { col: 5, row: 2 },
    windowCols: [7, 8, 14, 15],
    windowRows: [3, 4, 9, 10],
    flagstones: [{ col: 9, row: 5, w: 5, h: 5 }],
    props: [],
  },
  {
    label: "Creative",
    // A main studio with a smaller side workspace, up and across from the
    // entrance. North wing flush to the east edge — the same safe family as
    // Food's kitchen, just smaller.
    floor: [
      { col: 1, row: 4, w: 11, h: 9 },
      { col: 6, row: 1, w: 6, h: 3 },
    ],
    doorCol: 3,
    pc: { col: 2, row: 5 },
    windowCols: [4, 5, 8, 9],
    windowRows: [7, 8],
    // The side workspace, entirely stone-floored to read as its own area.
    flagstones: [{ col: 6, row: 1, w: 6, h: 3 }],
    props: [],
  },
  {
    label: "Community Support",
    // Deliberately the plainest room: a single wide, shallow rectangle. It
    // earns its distinctness from proportion alone, and the stone patch marks
    // the middle of it, where a circle would form.
    floor: [{ col: 1, row: 1, w: 17, h: 7 }],
    doorCol: 9,
    pc: { col: 2, row: 2 },
    windowCols: [4, 5, 7, 8, 10, 11, 13, 14],
    windowRows: [3, 4],
    flagstones: [{ col: 5, row: 3, w: 9, h: 3 }],
    props: [],
  },
  {
    label: "Technology",
    // A workshop: one rectangle, divided by a partition into a front room and
    // a back workshop. The partition is a run of `wall_col` in props (blocks
    // north-south movement) with a gap at column 6 for the doorway between
    // them — no floor-shape trickery needed.
    floor: [{ col: 1, row: 1, w: 11, h: 13 }],
    doorCol: 4,
    pc: { col: 2, row: 2 },
    windowCols: [8, 9],
    windowRows: [3, 4, 11, 12],
    flagstones: [{ col: 2, row: 9, w: 9, h: 5 }],
    props: [
      { kind: "wall_col", col: 2, row: 8 },
      { kind: "wall_col", col: 3, row: 8 },
      { kind: "wall_col", col: 4, row: 8 },
      { kind: "wall_col", col: 5, row: 8 },
      { kind: "wall_col", col: 7, row: 8 },
      { kind: "wall_col", col: 8, row: 8 },
      { kind: "wall_col", col: 9, row: 8 },
      { kind: "wall_col", col: 10, row: 8 },
      { kind: "wall_col", col: 11, row: 8 },
    ],
  },
  {
    label: "Health",
    // A corridor with a walled alcove off it: a treatment nook enclosed by
    // its own north and west walls, entered through the single gap left in
    // the west run. The alcove shares the room's own south and east cutaway,
    // so only those two faces need building.
    floor: [{ col: 1, row: 1, w: 7, h: 13 }],
    doorCol: 3,
    pc: { col: 2, row: 2 },
    windowCols: [2, 6],
    windowRows: [5, 6, 9],
    flagstones: [{ col: 5, row: 10, w: 3, h: 4 }],
    props: [
      { kind: "wall_col", col: 5, row: 10 },
      { kind: "wall_col", col: 6, row: 10 },
      { kind: "wall_col", col: 7, row: 10 },
      { kind: "wall_row", col: 5, row: 11 },
      { kind: "wall_row", col: 5, row: 13 },
    ],
  },
  {
    label: "Music",
    // A hall with a recessed stage alcove at the north end.
    // North wing flush to the east edge, same safe family as Food and
    // Creative: the stage's own west flank picks up a wall for free, reading
    // as the proscenium.
    floor: [
      { col: 1, row: 4, w: 11, h: 9 },
      { col: 5, row: 1, w: 7, h: 3 },
    ],
    doorCol: 3,
    pc: { col: 2, row: 5 },
    windowCols: [2, 4, 6, 7, 9, 10],
    windowRows: [7, 8],
    // The stage: a stone platform, raised out of the hall by its flagstones.
    flagstones: [{ col: 5, row: 1, w: 7, h: 3 }],
    props: [],
  },
  {
    label: "Food",
    // A long hall with the kitchen set back to the north-east. The notch is cut
    // from the north-west corner on purpose: every face the step creates then
    // points north or west, which are the two the cutaway draws. Notch the other
    // corner and you open an east face mid-room, which renders as a hole.
    floor: [
      { col: 1, row: 4, w: 14, h: 10 },
      { col: 6, row: 1, w: 9, h: 3 },
    ],
    doorCol: 3,
    pc: { col: 7, row: 2 },
    windowCols: [9, 10],
    windowRows: [7, 8],
    flagstones: [{ col: 6, row: 1, w: 9, h: 3 }],
    props: [],
  },
  {
    label: "Gaming",
    // A rectangle split by a partition into two bays, open at the east end:
    // the `wall_col` run stops at column 8, leaving columns 9-11 clear so the
    // bays share one open side instead of a doorway gap.
    floor: [{ col: 1, row: 1, w: 11, h: 13 }],
    doorCol: 4,
    pc: { col: 2, row: 2 },
    windowCols: [6, 9],
    windowRows: [4, 11],
    flagstones: [{ col: 2, row: 9, w: 9, h: 5 }],
    props: [
      { kind: "wall_col", col: 2, row: 8 },
      { kind: "wall_col", col: 3, row: 8 },
      { kind: "wall_col", col: 4, row: 8 },
      { kind: "wall_col", col: 5, row: 8 },
      { kind: "wall_col", col: 6, row: 8 },
      { kind: "wall_col", col: 7, row: 8 },
      { kind: "wall_col", col: 8, row: 8 },
    ],
  },
  {
    label: "Sports",
    // A wide hall with a small equipment store off the west end. West wing
    // flush to the south edge, same safe family as Welcome Center's annex.
    floor: [
      { col: 4, row: 4, w: 12, h: 9 },
      { col: 1, row: 9, w: 3, h: 4 },
    ],
    doorCol: 9,
    pc: { col: 5, row: 5 },
    windowCols: [6, 7, 12, 13],
    windowRows: [6, 7, 11],
    flagstones: [{ col: 7, row: 6, w: 6, h: 4 }],
    props: [],
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
