// The house on a member's island — the room behind their cottage door.
//
// Generated, like the island itself, so a new member gets a home the moment
// their account exists: nothing here is stored, and every device rebuilds the
// same room from the owner's id. It starts empty apart from the computer: a
// home is for the member to fill (Luke, September 25), the desk comes next, and
// seeds and movable things will follow.
//
// Who may come in follows the island. The island already answers "may this
// member stand here?" through GET /api/users/[username]/island, and a house
// inside a place you are allowed to be is not a second permission — the door is
// simply there once you are on the doorstep.

import type { IsoWorld } from "../world-model";
import { buildInterior } from "./interior";
import { houseNetworkLinks } from "./interiors";
import { houseWorldId, ISLAND_DOOR_ID, type IslandOwner } from "./island";

/** A small room: one member's home, not a hall. 11×11 leaves an 8×8 floor. */
const SIZE = 11;
const DOOR_COL = 6;
const PC = { col: 2, row: 2 };

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
  const place = isOwn ? "me" : owner.username;
  return buildInterior({
    id: houseWorldId(owner.id),
    label: isOwn ? "Home" : `${owner.displayName}'s Place`,
    floor: [{ col: 1, row: 1, w: SIZE - 2, h: SIZE - 2 }],
    doorCol: DOOR_COL,
    exit: { warpTo: place, spawnAt: ISLAND_DOOR_ID },
    pc: PC,
    // Your own PC opens your profile; a visitor's opens the owner's, exactly as
    // the island's front door already behaves.
    pcHref: isOwn ? "/profile" : `/profile/${owner.username}`,
    windowCols: [4, 8],
    windowRows: [5, 6],
    props: [],
    links: houseNetworkLinks(),
  });
}
