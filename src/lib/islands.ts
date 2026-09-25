// The visit gate for a member's floating My Place island. Pure over the
// owner's stored visibility and the friendship between viewer and owner, so
// the API route and the profile response can share one rule.

import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { areFriends } from "@/lib/friends";

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
  islandVisibility: string;
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
    select: { id: true, username: true, displayName: true, biome: true, islandVisibility: true },
  });
  if (!owner) {
    return { error: NextResponse.json({ error: "This person doesn't exist." }, { status: 404 }) };
  }

  const friends = await areFriends(viewerId, owner.id);
  const access = islandAccess(viewerId, owner, friends);

  if (access === "closed") {
    return {
      error: NextResponse.json(
        { error: `${owner.displayName}'s island is closed to visitors.` },
        { status: 403 },
      ),
    };
  }
  if (access === "friends-only") {
    return {
      error: NextResponse.json(
        { error: `${owner.displayName}'s island is open to friends only.` },
        { status: 403 },
      ),
    };
  }

  return { owner };
}
