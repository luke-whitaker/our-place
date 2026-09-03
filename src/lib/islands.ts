// The visit gate for a member's floating My Place island. Pure over the
// owner's stored visibility and the friendship between viewer and owner, so
// the API route and the profile response can share one rule.

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
