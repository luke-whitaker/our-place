// The house on a member's island — the room behind their cottage door.
//
// Generated, like the island itself, so a new member gets a home the moment
// their account exists: nothing here is stored, and every device rebuilds the
// same room from the owner's id. Only the furniture varies, seeded off that id,
// so two members' houses are recognisably different without either being
// authored.
//
// Who may come in follows the island. The island already answers "may this
// member stand here?" through GET /api/users/[username]/island, and a house
// inside a place you are allowed to be is not a second permission — the door is
// simply there once you are on the doorstep.

import type { IsoWorld } from "../world-model";
import { createRng } from "../prng";
import { buildInterior } from "./interior";
import { houseNetworkLinks } from "./interiors";
import { houseWorldId, ISLAND_DOOR_ID, type IslandOwner } from "./island";

/** A small room: one member's home, not a hall. 11×11 leaves an 8×8 floor. */
const SIZE = 11;
const DOOR_COL = 6;
const PC = { col: 2, row: 2 };

/** Furniture a home might hold. Drawn from with replacement, so a house can have
 * two chairs; the wardrobe is handled apart because it needs two tiles. */
const HOME_PROPS: ReadonlyArray<string> = [
  "chair",
  "chair",
  "flower_box1",
  "flower_box2",
  "flower_box3",
  "flower_box4",
  "jar_blue",
  "jar_red",
  "jar_yellow",
  "barrel",
  "crate1",
  "crate2",
  "tub",
  "bucket",
  "logs",
];

/** Tiles a prop may take: the floor, minus the walls, the doorway approach, the
 * PC and the two tiles you can stand on to use it, and the middle of the room —
 * a home reads better with its furniture against the walls and the floor left
 * open to walk.
 *
 * Keeping the PC's neighbours clear is not tidiness, it is the difference
 * between a working house and a broken one. The desk sits in the room's north
 * corner, so its only two non-wall neighbours are (col+1, row) and (col, row+1);
 * furnish both and the terminal is walled in. Because a house is generated
 * deterministically from its owner's id, that would not be a rare glitch that
 * clears on reload — it would permanently brick the "log on" terminal for about
 * one member in nine, and only for them. */
function propTiles(): Array<{ col: number; row: number }> {
  const tiles: Array<{ col: number; row: number }> = [];
  const last = SIZE - 2;
  for (let row = 2; row <= last; row++) {
    for (let col = 2; col <= last; col++) {
      const onEdge = col === 2 || col === last || row === 2 || row === last;
      const nearDoor = Math.abs(col - DOOR_COL) <= 1 && row <= 3;
      const atDesk =
        (col === PC.col && Math.abs(row - PC.row) <= 1) ||
        (row === PC.row && Math.abs(col - PC.col) <= 1);
      if (onEdge && !nearDoor && !atDesk) tiles.push({ col, row });
    }
  }
  return tiles;
}

export interface HouseOptions {
  owner: IslandOwner;
  /** Whether the viewer owns this house: the labels and the PC's target differ. */
  isOwn: boolean;
}

/**
 * Build a member's house. The exit warps back to their island, arriving at the
 * cottage door, and the island's door warps in here — the same self-closing
 * round trip the community buildings use.
 */
export function buildIslandHouse({ owner, isOwn }: HouseOptions): IsoWorld {
  const rng = createRng(`${owner.id}:house`);
  const tiles = propTiles();
  // Between a third and a half of the wall tiles, so a house feels lived in
  // without becoming a warehouse. Bounded by the tile list either way.
  const count = Math.min(tiles.length, rng.int(6, 10));
  const props = [];
  for (let i = 0; i < count; i++) {
    const tile = tiles.splice(rng.int(0, tiles.length - 1), 1)[0];
    props.push({ kind: rng.pick(HOME_PROPS), ...tile });
  }

  const place = isOwn ? "me" : owner.username;
  return buildInterior({
    id: houseWorldId(owner.id),
    label: isOwn ? "Home" : `${owner.displayName}'s Place`,
    cols: SIZE,
    rows: SIZE,
    doorCol: DOOR_COL,
    exit: { warpTo: place, spawnAt: ISLAND_DOOR_ID },
    pc: PC,
    // Your own PC opens your profile; a visitor's opens the owner's, exactly as
    // the island's front door already behaves.
    pcHref: isOwn ? "/profile" : `/profile/${owner.username}`,
    windowCols: [4, 8],
    windowRows: [5, 6],
    props,
    links: houseNetworkLinks(),
  });
}
