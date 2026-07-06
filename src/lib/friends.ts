import prisma from "@/lib/db";
import type { FriendshipStatus } from "@/lib/types";

/** The fields friendshipStatusFor needs from a friendship row. */
export interface FriendshipRowLike {
  userId: string;
  status: string;
}

/**
 * Derive the viewer's relationship to a profile owner from the friendship row
 * between them (if any). Pure — the row lookup happens elsewhere.
 */
export function friendshipStatusFor(
  viewerId: string,
  ownerId: string,
  row: FriendshipRowLike | null,
): FriendshipStatus {
  if (viewerId === ownerId) return "self";
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.userId === viewerId ? "pending_outgoing" : "pending_incoming";
}

/**
 * The friendship row between two users, regardless of who sent the request.
 * The unique constraint is on [userId, friendId], so either direction may hold
 * the row — at most one exists.
 */
export async function findFriendshipBetween(userIdA: string, userIdB: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: userIdA, friendId: userIdB },
        { userId: userIdB, friendId: userIdA },
      ],
    },
  });
}

/** Whether two users are accepted friends. A user always counts as their own friend. */
export async function areFriends(userIdA: string, userIdB: string): Promise<boolean> {
  if (userIdA === userIdB) return true;
  const row = await findFriendshipBetween(userIdA, userIdB);
  return row?.status === "accepted";
}
