// Blocking: one member saying "no contact" with another. The row has a
// direction (only the blocker sees it and can lift it), but its effect is
// symmetric: every check here asks whether a block exists either way, so the
// blocked member can't reach the blocker and the blocker can't reach them.
// The blocked member is never told; a refusal reads like any other.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

/** The most blocks one member may hold, so the list and every batch lookup
 * stay bounded. Far beyond what anyone in a face-to-face community needs. */
export const MAX_BLOCKS = 500;

/** A `where` matching the block between two members, whichever way it runs. */
function eitherWay(a: string, b: string): Prisma.BlockWhereInput {
  return {
    OR: [
      { blockerId: a, blockedId: b },
      { blockerId: b, blockedId: a },
    ],
  };
}

/** A `where` on a related user (a gathering's host, say) that leaves out
 * anyone in a block with `userId`, either way, inside the same query. */
export function notBlockedWith(userId: string): Prisma.UserWhereInput {
  return {
    blocksMade: { none: { blockedId: userId } },
    blocksReceived: { none: { blockerId: userId } },
  };
}

/** Whether either member has blocked the other. Nobody blocks themselves. */
export async function isBlockedEitherWay(a: string, b: string, db: Db = prisma): Promise<boolean> {
  if (a === b) return false;
  const row = await db.block.findFirst({ where: eitherWay(a, b), select: { id: true } });
  return row !== null;
}

/** Everyone `userId` is in a block with, either way: the batch form, for
 * filtering a list (presence, invitee pickers) with one query. */
export async function blockedIdsFor(userId: string, db: Db = prisma): Promise<Set<string>> {
  const rows = await db.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
    take: MAX_BLOCKS * 2,
  });
  return new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)));
}

export type BlockOutcome = "blocked" | "already_blocked" | "limit_reached";

/**
 * Block `blockedId` for `blockerId` in one transaction, and undo every tie
 * between them so nothing keeps them in contact: the friendship or pending
 * request (either way), notifications between them, and invitations to each
 * other's gatherings that haven't ended, with the letters that carried them.
 * Unblocking later restores none of it; a friendship starts over with a request.
 */
export async function blockMember(blockerId: string, blockedId: string): Promise<BlockOutcome> {
  return prisma.$transaction(async (tx) => {
    // Lock the blocker's row so two blocks at once can't both pass the cap.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${blockerId} FOR UPDATE`;
    const existing = await tx.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      select: { id: true },
    });
    if (existing) return "already_blocked";
    if ((await tx.block.count({ where: { blockerId } })) >= MAX_BLOCKS) return "limit_reached";

    await tx.block.create({ data: { blockerId, blockedId } });
    await tx.friendship.deleteMany({
      where: {
        OR: [
          { userId: blockerId, friendId: blockedId },
          { userId: blockedId, friendId: blockerId },
        ],
      },
    });
    await tx.notification.deleteMany({
      where: {
        OR: [
          { recipientId: blockerId, actorId: blockedId },
          { recipientId: blockedId, actorId: blockerId },
        ],
      },
    });
    await dropInvitesBetween(tx, blockerId, blockedId);
    await dropInvitesBetween(tx, blockedId, blockerId);
    return "blocked";
  });
}

/** Remove `guestId`'s invitations to `hostId`'s gatherings that haven't ended,
 * and the invitation letters still in the guest's mailbox, desk, or pockets. */
async function dropInvitesBetween(
  tx: Prisma.TransactionClient,
  hostId: string,
  guestId: string,
): Promise<void> {
  const where = { hostId, endsAt: { gt: new Date() } };
  await tx.gatheringInvite.deleteMany({ where: { userId: guestId, gathering: where } });
  await tx.item.deleteMany({
    where: { ownerId: guestId, kind: "note", gathering: where },
  });
}

/** Lift a block the caller made. Returns whether there was one to lift. */
export async function unblockMember(blockerId: string, blockedId: string): Promise<boolean> {
  const removed = await prisma.block.deleteMany({ where: { blockerId, blockedId } });
  return removed.count > 0;
}
