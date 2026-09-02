// Friendship domain types — the API's snake_case wire shapes.

/** The viewer's relationship to another user, derived from the friendship row. */
export type FriendshipStatus =
  "self" | "friends" | "pending_outgoing" | "pending_incoming" | "none";

/** One side of a friendship or request, as listed by GET /api/friends. */
export interface FriendEntry {
  friendship_id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  created_at: string;
}

/** Header-card data for someone's My Place, as returned by GET /api/users/[username]. */
export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  created_at: string;
  my_place_post_count: number;
  community_count: number;
}

/** One row of the member directory, as listed by GET /api/users. */
export interface PeopleEntry {
  id: string;
  username: string;
  display_name: string;
  avatar_color: string;
  created_at: string;
  /** Who vouched for this account. Null for trust roots ("Founding member"). */
  invited_by: { username: string; display_name: string } | null;
  friendship: { status: FriendshipStatus; id: string | null };
}
