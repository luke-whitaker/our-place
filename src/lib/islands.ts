// The visit gate for a member's floating My Place island. Pure over the
// owner's stored visibility and the friendship between viewer and owner, so
// the API route and the profile response can share one rule.

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { areFriends } from "@/lib/friends";
import { gatheringOpensIsland } from "@/lib/event-mushrooms";

/** Just enough of the owner row to decide who may walk onto their island.
 * `islandVisibility` is the raw database string, not the narrower
 * IslandVisibility type — matching the column, which Prisma types as
 * `String`, not an enum. */
export interface IslandOwnerLike {
  id: string;
  islandVisibility: string;
}

export type IslandAccess = "open" | "friends-only" | "closed";

/**
 * Whether `viewerId` may walk onto `owner`'s island. The owner always sees
 * their own island; everyone else is gated by the owner's chosen visibility.
 * `friends` says whether the viewer and owner are accepted friends — the
 * caller looks that up, since it needs the database and this function stays
 * a plain function of its inputs.
 */
export function islandAccess(
  viewerId: string,
  owner: IslandOwnerLike,
  friends: boolean,
): IslandAccess {
  if (viewerId === owner.id) return "open";
  if (owner.islandVisibility === "nobody") return "closed";
  if (owner.islandVisibility === "anyone") return "open";
  // "friends" and any unrecognized value fall back to the friends gate,
  // matching the column's own default.
  return friends ? "open" : "friends-only";
}

/** The owner row a route gets back once `requireIslandAccess` lets a
 * visitor through — enough to render the island or address the owner by
 * name. */
export interface IslandOwnerRow {
  id: string;
  username: string;
  displayName: string;
  biome: string;
  mailboxColor: string;
  islandVisibility: string;
}

/** Why the gate refused, worded for the member who was turned away. Shared by
 * every island gate so the wording can never drift. */
export interface IslandRefusal {
  status: 403 | 404;
  error: string;
}

const OWNER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  biome: true,
  mailboxColor: true,
  islandVisibility: true,
} as const;

/** The gate itself, over an owner row that may not exist. */
async function gateIsland(
  viewerId: string,
  owner: IslandOwnerRow | null,
): Promise<{ owner: IslandOwnerRow; refusal?: never } | { owner?: never; refusal: IslandRefusal }> {
  if (!owner) return { refusal: { status: 404, error: "This person doesn't exist." } };

  const friends = await areFriends(viewerId, owner.id);
  const access = islandAccess(viewerId, owner, friends);
  if (access === "closed") {
    return {
      refusal: { status: 403, error: `${owner.displayName}'s island is closed to visitors.` },
    };
  }
  if (access === "friends-only") {
    return {
      refusal: { status: 403, error: `${owner.displayName}'s island is open to friends only.` },
    };
  }
  return { owner };
}

/**
 * Looks up `username` (case-insensitive) and checks whether `viewerId` may
 * visit their island: a ready 404 if no such member exists, a ready 403
 * with the owner's chosen-visibility message if the gate refuses, otherwise
 * the owner row. Shared by the island route and the mailbox route so the
 * two gates — and their wording — can never drift apart.
 */
export async function requireIslandAccess(
  viewerId: string,
  username: string,
): Promise<{ owner: IslandOwnerRow; error?: never } | { owner?: never; error: Response }> {
  const owner = await prisma.user.findFirst({
    where: { username: { equals: username.toLowerCase(), mode: "insensitive" } },
    select: OWNER_SELECT,
  });
  const gate = await gateIsland(viewerId, owner);
  if (gate.refusal) {
    return {
      error: NextResponse.json({ error: gate.refusal.error }, { status: gate.refusal.status }),
    };
  }
  return { owner: gate.owner };
}

/**
 * The island route's gate, with the one exception gatherings make: when the
 * owner's gathering has its Event Mushroom planted on this island and the
 * viewer may open that gathering, its portal lets them onto the island even
 * if the island's own setting wouldn't. Only the island named by the portal's
 * gathering, never the house (the page keeps that closed).
 */
export async function requireIslandVisit(
  viewerId: string,
  username: string,
  gatheringId: string | null,
): Promise<
  | { owner: IslandOwnerRow; viaGathering: boolean; error?: never }
  | { owner?: never; error: Response }
> {
  const gate = await requireIslandAccess(viewerId, username);
  if (!gate.error) return { owner: gate.owner, viaGathering: false };
  if (!gatheringId) return gate;
  const owner = await prisma.user.findFirst({
    where: { username: { equals: username.toLowerCase(), mode: "insensitive" } },
    select: OWNER_SELECT,
  });
  if (owner && (await gatheringOpensIsland(viewerId, owner.id, gatheringId))) {
    return { owner, viaGathering: true };
  }
  return gate;
}

/**
 * The same gate by the owner's id, for callers that know a world id rather
 * than a username (live presence on an island). Returns the refusal as data
 * rather than a Response so the caller can cache it.
 */
export async function checkIslandAccessById(
  viewerId: string,
  ownerId: string,
): Promise<{ ok: true } | { ok: false; refusal: IslandRefusal }> {
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: OWNER_SELECT });
  const gate = await gateIsland(viewerId, owner);
  return gate.refusal ? { ok: false, refusal: gate.refusal } : { ok: true };
}
