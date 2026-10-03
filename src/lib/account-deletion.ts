// Deleting a member's account. The member chooses (Luke, October 2, 2026):
// remove everything they made, or leave their posts and comments up as "a
// former member". Either way the user row stays as a nameless tombstone, so
// what still points at it (posts left up, letters they sent that now belong to
// someone else, the members they vouched for, notices about gatherings they
// cancelled) keeps a valid author, and every personal field is wiped. The
// relation-by-relation rules are in .claude/rules/api-routes.md.

import { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { cancelGathering } from "@/lib/gatherings";
import { deleteFromStorage, storageKeyFromUrl } from "@/lib/storage";
import { FORMER_MEMBER_NAME, formerMemberUsername } from "@/lib/former-member";

export type DeletionMode = "remove_everything" | "leave_posts";

/** Neutral grey for a former member's avatar circle. */
const FORMER_MEMBER_COLOR = "#9ca3af";
/** A departing member's whole footprint goes in one transaction; give it room. */
const DELETION_TIMEOUT_MS = 30_000;

/** Where a rich post keeps media: blocks with a `url`. Anything malformed is
 * simply not media. */
function richBlockUrls(content: string): string[] {
  try {
    const blocks: unknown = JSON.parse(content);
    if (!Array.isArray(blocks)) return [];
    return blocks.flatMap((block: unknown) =>
      typeof block === "object" && block !== null && "url" in block && typeof block.url === "string"
        ? [block.url]
        : [],
    );
  } catch {
    return [];
  }
}

/** Object keys of every file this member uploaded into their posts. */
async function uploadedMediaKeys(userId: string): Promise<string[]> {
  const base = process.env.R2_PUBLIC_BASE_URL ?? "";
  const posts = await prisma.post.findMany({
    where: { authorId: userId },
    select: { postType: true, content: true, media: { select: { url: true } } },
  });
  const urls = posts.flatMap((p) => [
    ...p.media.map((m) => m.url),
    ...(p.postType === "rich" ? richBlockUrls(p.content) : []),
  ]);
  const keys = urls.map((url) => storageKeyFromUrl(url, base)).filter((k) => k !== null);
  return [...new Set(keys)];
}

/** Take back what this member's reactions added to other posts' counts, then
 * the reactions themselves. Counts never go below zero. */
async function removeReactions(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE posts p
    SET reaction_count = GREATEST(p.reaction_count - r.likes, 0),
        dislike_count = GREATEST(p.dislike_count - r.dislikes, 0)
    FROM (
      SELECT post_id,
             COUNT(*) FILTER (WHERE type <> 'dislike')::int AS likes,
             COUNT(*) FILTER (WHERE type = 'dislike')::int AS dislikes
      FROM reactions WHERE user_id = ${userId} GROUP BY post_id
    ) r
    WHERE p.id = r.post_id`;
  await tx.reaction.deleteMany({ where: { userId } });
}

/** Take this member's poll votes back out of each option's count, then the
 * votes themselves. A vote is an act of a person, like a reaction, so it goes
 * in both modes. Counts never go below zero. */
async function removePollVotes(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE poll_options o
    SET vote_count = GREATEST(o.vote_count - v.n, 0)
    FROM (
      SELECT option_id, COUNT(*)::int AS n FROM poll_votes WHERE user_id = ${userId} GROUP BY option_id
    ) v
    WHERE o.id = v.option_id`;
  await tx.pollVote.deleteMany({ where: { userId } });
}

/** Remove this member's comments and take them out of their posts' counts. */
async function removeComments(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE posts p
    SET comment_count = GREATEST(p.comment_count - c.n, 0)
    FROM (
      SELECT post_id, COUNT(*)::int AS n FROM comments WHERE author_id = ${userId} GROUP BY post_id
    ) c
    WHERE p.id = c.post_id`;
  await tx.comment.deleteMany({ where: { authorId: userId } });
}

/** Leave every community, each one counting one member fewer. */
async function leaveCommunities(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`
    UPDATE communities
    SET member_count = GREATEST(member_count - 1, 0)
    WHERE id IN (SELECT community_id FROM community_members WHERE user_id = ${userId})`;
  await tx.communityMember.deleteMany({ where: { userId } });
}

/**
 * Hosted gatherings: one that hasn't ended is cancelled through the host's own
 * cancel path, so everyone going is told. Every hosted gathering loses its
 * address and description (an address may be a home). Under "remove
 * everything" the rest go, keeping only the ones cancelled now, whose notices
 * guests still need to read.
 */
async function settleGatherings(
  tx: Prisma.TransactionClient,
  userId: string,
  mode: DeletionMode,
  now: Date,
): Promise<void> {
  const open = await tx.gathering.findMany({
    where: { hostId: userId, status: "scheduled", endsAt: { gt: now } },
    select: { id: true },
  });
  const cancelledNow: string[] = [];
  for (const g of open) {
    if (await cancelGathering(tx, g.id, userId)) cancelledNow.push(g.id);
  }
  await tx.gathering.updateMany({
    where: { hostId: userId },
    data: { address: "", description: "" },
  });
  if (mode === "remove_everything") {
    await tx.gathering.deleteMany({ where: { hostId: userId, id: { notIn: cancelledNow } } });
  }
}

/** Wipe the row down to a tombstone that can never sign in or be found. */
async function tombstone(tx: Prisma.TransactionClient, userId: string, now: Date): Promise<void> {
  await tx.user.update({
    where: { id: userId },
    data: {
      username: formerMemberUsername(userId),
      displayName: FORMER_MEMBER_NAME,
      email: `${userId}@former-member.invalid`,
      phone: null,
      // Not a bcrypt hash, so no password can ever match it.
      passwordHash: "!",
      bio: "",
      avatar: Prisma.DbNull,
      avatarColor: FORMER_MEMBER_COLOR,
      theme: "auto",
      islandVisibility: "nobody",
      ghost: true,
      excludeFromMetrics: true,
      role: "former",
      resetCodeHash: null,
      resetCodeAttempts: 0,
      resetCodeExpiresAt: null,
      passwordChangedAt: now,
      invitedById: null,
      deletedAt: now,
    },
  });
}

/**
 * Delete a member's account in one transaction. Returns the R2 keys of the
 * media they uploaded when those should go too ("remove everything"), for
 * the caller to delete after the commit: storage can't roll back with the
 * database, so it goes last and best-effort.
 */
export async function deleteAccount(userId: string, mode: DeletionMode): Promise<string[]> {
  const mediaKeys = mode === "remove_everything" ? await uploadedMediaKeys(userId) : [];
  const now = new Date();
  await prisma.$transaction(
    async (tx) => {
      // Notifications they caused or received go first, so the cancel notices
      // settleGatherings writes next are the only ones left with their name.
      await tx.notification.deleteMany({
        where: { OR: [{ recipientId: userId }, { actorId: userId }] },
      });
      await settleGatherings(tx, userId, mode, now);
      await tx.gatheringInvite.deleteMany({ where: { userId } });
      await removeReactions(tx, userId);
      await removePollVotes(tx, userId);
      if (mode === "remove_everything") {
        await removeComments(tx, userId);
        // Cascades to the posts' media rows, everyone's comments and reactions
        // on them, and their notifications.
        await tx.post.deleteMany({ where: { authorId: userId } });
      }
      await tx.friendship.deleteMany({ where: { OR: [{ userId }, { friendId: userId }] } });
      await tx.block.deleteMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] } });
      await leaveCommunities(tx, userId);
      await tx.eventRsvp.deleteMany({ where: { userId } });
      await tx.event.deleteMany({ where: { creatorId: userId } });
      // What they hold goes; what they sent now belongs to its recipients and
      // stays, signed by "A former member".
      await tx.item.deleteMany({ where: { ownerId: userId } });
      await tx.notebookPage.deleteMany({ where: { ownerId: userId } });
      await tx.outfit.deleteMany({ where: { ownerId: userId } });
      await tx.npcGift.deleteMany({ where: { userId } });
      await tx.activityDay.deleteMany({ where: { userId } });
      await tx.worldDiscovery.deleteMany({ where: { userId } });
      await tx.worldPlant.deleteMany({ where: { ownerId: userId } });
      await tombstone(tx, userId, now);
    },
    { timeout: DELETION_TIMEOUT_MS },
  );
  return mediaKeys;
}

/**
 * Delete a departed member's uploads from R2, one at a time (bounded by what
 * they posted). Production only: in development the R2 bucket may be the
 * production media bucket, so dev and tests never delete real files. A
 * failure is logged and the rest continue; the account is already gone.
 */
export async function deleteUploadedMedia(keys: string[]): Promise<number> {
  if (process.env.NODE_ENV !== "production") return 0;
  let deleted = 0;
  for (const key of keys) {
    try {
      await deleteFromStorage(key);
      deleted++;
    } catch (error) {
      console.error(`Failed to delete a departed member's upload (${key}):`, error);
    }
  }
  return deleted;
}
