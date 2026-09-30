// Notification wire types, as GET /api/notifications returns them.

import type { GatheringInviteSummary } from "./gatherings";

/** Who a notification is about. */
export interface NotificationActor {
  username: string;
  display_name: string;
}

/** The post a reaction or comment landed on, and where to find it. */
export interface NotificationPost {
  id: string;
  /** Empty for a post with no title (a photo post, say). */
  title: string;
  /** The community page the post is in, or the member's own My Place. */
  href: string;
}

interface NotificationBase {
  /** The newest underlying row's id, stable for React keys. */
  id: string;
  created_at: string;
  unread: boolean;
}

/** One line on the Notifications page, newest first. Reactions on the same
 * post arrive already grouped; everything else is one event per line. */
export type NotificationItem =
  | (NotificationBase & {
      kind: "friend_request";
      actor: NotificationActor;
      friendship_id: string;
    })
  | (NotificationBase & { kind: "friend_accepted"; actor: NotificationActor })
  | (NotificationBase & {
      kind: "comment";
      actor: NotificationActor;
      post: NotificationPost;
      excerpt: string;
    })
  | (NotificationBase & {
      kind: "gathering_invite" | "gathering_cancelled";
      /** The host. */
      actor: NotificationActor;
      gathering: GatheringInviteSummary;
    })
  | (NotificationBase & {
      kind: "reactions";
      /** Newest first, at most a few names; `count` says how many in all. */
      actors: NotificationActor[];
      count: number;
      post: NotificationPost;
    });
