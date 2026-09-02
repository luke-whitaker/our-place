import { friendshipStatusFor } from "@/lib/friends";
import type { PeopleEntry } from "@/lib/types";

/** The fields toPeopleEntry needs from a directory row. */
export interface DirectoryUserLike {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
  createdAt: Date;
  inviter: { username: string; displayName: string } | null;
}

/** The friendship row between the viewer and this user, if one exists. */
export interface DirectoryFriendshipLike {
  id: string;
  userId: string;
  status: string;
}

/**
 * Map one directory row (plus the friendship row between the viewer and this
 * user, if any) to the wire shape GET /api/users returns. Pure — the DB reads
 * happen in the route — so the mapping is unit-testable without a database.
 */
export function toPeopleEntry(
  user: DirectoryUserLike,
  viewerId: string,
  friendship: DirectoryFriendshipLike | null,
): PeopleEntry {
  return {
    id: user.id,
    username: user.username,
    display_name: user.displayName,
    avatar_color: user.avatarColor,
    created_at: user.createdAt.toISOString(),
    invited_by: user.inviter
      ? { username: user.inviter.username, display_name: user.inviter.displayName }
      : null,
    friendship: {
      status: friendshipStatusFor(viewerId, user.id, friendship),
      id: friendship?.id ?? null,
    },
  };
}
