import prisma from "@/lib/db";
import { notify } from "@/lib/notifications";
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

/**
 * Accept a pending request: the friendship becomes accepted, the request's
 * notification goes (it has been answered), and the person who asked hears
 * that it was accepted. One transaction, so the three never disagree. Used by
 * the Accept button and by sending a request back to someone who already asked.
 */
export async function acceptFriendRequest(friendship: {
  id: string;
  userId: string;
  friendId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.friendship.update({ where: { id: friendship.id }, data: { status: "accepted" } });
    await tx.notification.deleteMany({
      where: { friendshipId: friendship.id, kind: "friend_request" },
    });
    await notify(tx, {
      recipientId: friendship.userId,
      actorId: friendship.friendId,
      kind: "friend_accepted",
      friendshipId: friendship.id,
    });
  });
}
