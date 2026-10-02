import type { Prisma } from "@/generated/prisma/client";
import type {
  GatheringAnswer,
  GatheringInviteSummary,
  GatheringStatus,
  NotificationActor,
  NotificationItem,
  NotificationPost,
} from "@/lib/types";

/** How long a notification is kept. Older ones are pruned when the page loads. */
export const NOTIFICATION_RETENTION_DAYS = 90;
/** The most rows the Notifications page reads, newest first. */
export const NOTIFICATIONS_SHOWN = 200;
/** Names spelled out in a reaction group before "and N others". */
const REACTION_NAMES = 2;
/** Characters of a comment quoted on the page. */
const EXCERPT_CHARS = 140;

type NotificationKind =
  | "friend_request"
  | "friend_accepted"
  | "reaction"
  | "comment"
  | "gathering_invite"
  | "gathering_cancelled"
  | "gathering_unplanted";

interface NewNotification {
  recipientId: string;
  actorId: string;
  kind: NotificationKind;
  friendshipId?: string;
  postId?: string;
  reactionId?: string;
  commentId?: string;
  gatheringId?: string;
}

/**
 * Record a notification inside the caller's transaction, so it exists exactly
 * when the thing it's about does. Nobody is ever notified about themselves:
 * reacting to or commenting on your own post writes nothing.
 */
export async function notify(tx: Prisma.TransactionClient, data: NewNotification): Promise<void> {
  if (data.recipientId === data.actorId) return;
  await tx.notification.create({ data });
}

/** A stored notification with what the page needs to describe it. */
export interface NotificationRow {
  id: string;
  kind: string;
  createdAt: Date;
  readAt: Date | null;
  friendshipId: string | null;
  actor: { username: string; displayName: string };
  post: {
    id: string;
    title: string;
    community: { slug: string } | null;
  } | null;
  comment: { content: string } | null;
  /** With the recipient's own invite row, if any (the route filters to it). */
  gathering: {
    id: string;
    title: string;
    startsAt: Date;
    status: string;
    invites: { status: string }[];
  } | null;
}

function toGathering(gathering: NonNullable<NotificationRow["gathering"]>): GatheringInviteSummary {
  return {
    id: gathering.id,
    title: gathering.title,
    starts_at: gathering.startsAt.toISOString(),
    status: gathering.status as GatheringStatus,
    my_response: (gathering.invites[0]?.status as GatheringAnswer | undefined) ?? null,
    started: gathering.startsAt.getTime() <= Date.now(),
  };
}

function toActor(row: NotificationRow): NotificationActor {
  return { username: row.actor.username, display_name: row.actor.displayName };
}

/** Where a post lives: its community page, or the recipient's own My Place
 * (the recipient of a reaction or comment is always the post's author). */
function toPost(post: NonNullable<NotificationRow["post"]>): NotificationPost {
  return {
    id: post.id,
    title: post.title,
    href: post.community ? `/communities/${post.community.slug}` : "/profile",
  };
}

function excerptOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_CHARS ? `${flat.slice(0, EXCERPT_CHARS - 1)}…` : flat;
}

/**
 * Turn rows (newest first) into the page's lines. Reactions on the same post
 * become one line, placed where its newest reaction falls and unread if any of
 * them is. A row whose post or comment is missing is skipped rather than shown
 * half-empty; the cascades make that rare.
 */
export function groupNotifications(rows: NotificationRow[]): NotificationItem[] {
  const items: NotificationItem[] = [];
  const reactionGroups = new Map<string, Extract<NotificationItem, { kind: "reactions" }>>();

  for (const row of rows) {
    const base = { id: row.id, created_at: row.createdAt.toISOString(), unread: !row.readAt };
    if (row.kind === "friend_request" && row.friendshipId) {
      items.push({
        ...base,
        kind: "friend_request",
        actor: toActor(row),
        friendship_id: row.friendshipId,
      });
    } else if (row.kind === "friend_accepted") {
      items.push({ ...base, kind: "friend_accepted", actor: toActor(row) });
    } else if (row.kind === "comment" && row.post && row.comment) {
      items.push({
        ...base,
        kind: "comment",
        actor: toActor(row),
        post: toPost(row.post),
        excerpt: excerptOf(row.comment.content),
      });
    } else if (
      (row.kind === "gathering_invite" ||
        row.kind === "gathering_cancelled" ||
        row.kind === "gathering_unplanted") &&
      row.gathering
    ) {
      items.push({
        ...base,
        kind: row.kind,
        actor: toActor(row),
        gathering: toGathering(row.gathering),
      });
    } else if (row.kind === "reaction" && row.post) {
      const group = reactionGroups.get(row.post.id);
      if (group) {
        group.count++;
        group.unread ||= base.unread;
        if (group.actors.length < REACTION_NAMES) group.actors.push(toActor(row));
      } else {
        const created = {
          ...base,
          kind: "reactions" as const,
          actors: [toActor(row)],
          count: 1,
          post: toPost(row.post),
        };
        reactionGroups.set(row.post.id, created);
        items.push(created);
      }
    }
  }
  return items;
}
