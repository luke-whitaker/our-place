import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, requireAuth } from "@/lib/auth";
import type { AuthPayload, NotificationItem } from "@/lib/types";
import {
  createTestUser,
  createTestCommunity,
  joinCommunity,
  createTestPost,
  jsonRequest,
} from "@/test/route-helpers";
import { GET as listNotifications } from "./route";
import { GET as unreadNotifications } from "./unread/route";
import { POST as markRead } from "./read/route";
import { POST as sendFriendRequest } from "../friends/route";
import { PATCH as acceptFriend, DELETE as removeFriendship } from "../friends/[id]/route";
import { POST as react } from "../posts/[id]/reactions/route";
import { POST as comment } from "../posts/[id]/comments/route";
import { DELETE as deleteComment } from "../posts/[id]/comments/[commentId]/route";

// Both helpers read cookies through next/headers, which only exists inside a
// real Next request, so each step chooses who is acting.
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), requireAuth: vi.fn() }));

const mockGetAuthUser = vi.mocked(getAuthUser);
const mockRequireAuth = vi.mocked(requireAuth);

function actAs(user: AuthPayload) {
  mockGetAuthUser.mockResolvedValue(user);
  mockRequireAuth.mockResolvedValue({ user });
}

async function inbox(user: AuthPayload): Promise<NotificationItem[]> {
  actAs(user);
  const res = await listNotifications();
  expect(res.status).toBe(200);
  return (await res.json()).notifications;
}

async function hasUnread(user: AuthPayload): Promise<boolean> {
  actAs(user);
  return (await (await unreadNotifications()).json()).has_unread;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function reactAs(user: AuthPayload, postId: string, type: string) {
  actAs(user);
  const res = await react(
    jsonRequest(`http://localhost/api/posts/${postId}/reactions`, { type }),
    params(postId),
  );
  expect(res.status).toBe(200);
}

/** An author with a post in a community a second member has joined. */
async function postWithReader() {
  const author = await createTestUser({ displayName: "Author" });
  const reader = await createTestUser({ displayName: "Reader" });
  const communityId = await createTestCommunity(author.userId);
  await joinCommunity(author.userId, communityId);
  await joinCommunity(reader.userId, communityId);
  const postId = await createTestPost({ authorId: author.userId, communityId });
  return { author, reader, postId };
}

describe("notifications", () => {
  beforeEach(() => {
    mockGetAuthUser.mockReset();
    mockRequireAuth.mockReset();
  });

  describe("comments", () => {
    it("tell the post's author, never the commenter, and go when the comment does", async () => {
      const { author, reader, postId } = await postWithReader();
      actAs(reader);
      const res = await comment(
        jsonRequest(`http://localhost/api/posts/${postId}/comments`, { content: "Lovely!" }),
        params(postId),
      );
      const { commentId } = await res.json();

      expect(await inbox(reader)).toEqual([]);
      const [item] = await inbox(author);
      expect(item).toMatchObject({
        kind: "comment",
        unread: true,
        excerpt: "Lovely!",
        actor: { display_name: "Reader" },
        post: { id: postId },
      });

      actAs(reader);
      await deleteComment(new NextRequest("http://localhost", { method: "DELETE" }), {
        params: Promise.resolve({ id: postId, commentId }),
      });
      expect(await inbox(author)).toEqual([]);
    });

    it("say nothing when you comment on your own post", async () => {
      const { author, postId } = await postWithReader();
      actAs(author);
      await comment(
        jsonRequest(`http://localhost/api/posts/${postId}/comments`, { content: "Mine" }),
        params(postId),
      );
      expect(await inbox(author)).toEqual([]);
    });
  });

  describe("reactions", () => {
    it("are grouped per post, and a dislike never notifies", async () => {
      const { author, reader, postId } = await postWithReader();
      const third = await createTestUser({ displayName: "Third" });
      await prisma.post.update({ where: { id: postId }, data: { allowDislikes: true } });

      await reactAs(reader, postId, "love");
      await reactAs(third, postId, "like");
      let items = await inbox(author);
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ kind: "reactions", count: 2 });

      await reactAs(third, postId, "dislike"); // a like becomes a dislike: its notice goes
      items = await inbox(author);
      expect(items[0]).toMatchObject({ kind: "reactions", count: 1 });

      await reactAs(third, postId, "laugh"); // and comes back when it turns back
      expect((await inbox(author))[0]).toMatchObject({ count: 2 });

      await reactAs(reader, postId, "love"); // the same type again removes the reaction
      await reactAs(third, postId, "laugh");
      expect(await inbox(author)).toEqual([]);

      await reactAs(reader, postId, "dislike"); // a brand-new dislike
      expect(await inbox(author)).toEqual([]);
    });

    it("say nothing when you react to your own post", async () => {
      const { author, postId } = await postWithReader();
      await reactAs(author, postId, "like");
      expect(await inbox(author)).toEqual([]);
    });
  });

  describe("friend requests", () => {
    async function request(from: AuthPayload, to: AuthPayload) {
      actAs(from);
      const res = await sendFriendRequest(
        jsonRequest("http://localhost/api/friends", { username: to.username }),
      );
      return (await res.json()).friendship_id as string;
    }

    it("tell the person asked; accepting clears the request and tells the one who asked", async () => {
      const ada = await createTestUser({ displayName: "Ada" });
      const ben = await createTestUser({ displayName: "Ben" });
      const friendshipId = await request(ada, ben);

      expect(await inbox(ben)).toMatchObject([
        { kind: "friend_request", friendship_id: friendshipId, actor: { display_name: "Ada" } },
      ]);

      actAs(ben);
      expect(
        (await acceptFriend(new Request("http://localhost"), params(friendshipId))).status,
      ).toBe(200);
      expect(await inbox(ben)).toEqual([]);
      expect(await inbox(ada)).toMatchObject([
        { kind: "friend_accepted", actor: { display_name: "Ben" } },
      ]);
    });

    it("accept the same way when you send a request back", async () => {
      const ada = await createTestUser({ displayName: "Ada" });
      const ben = await createTestUser({ displayName: "Ben" });
      await request(ada, ben);
      await request(ben, ada); // Ben asks back instead of pressing Accept

      expect(await inbox(ben)).toEqual([]);
      expect(await inbox(ada)).toMatchObject([{ kind: "friend_accepted" }]);
    });

    it("vanish when the request is declined or canceled", async () => {
      const ada = await createTestUser();
      const ben = await createTestUser();
      const friendshipId = await request(ada, ben);
      actAs(ben);
      await removeFriendship(new Request("http://localhost"), params(friendshipId));
      expect(await inbox(ben)).toEqual([]);
    });
  });

  describe("reading", () => {
    it("the dot shows until the page marks them read, and only for your own", async () => {
      const { author, reader, postId } = await postWithReader();
      await reactAs(reader, postId, "like");
      const other = await postWithReader();
      await reactAs(other.reader, other.postId, "like");

      expect(await hasUnread(author)).toBe(true);
      await inbox(author); // loading the list alone doesn't mark anything
      expect(await hasUnread(author)).toBe(true);

      actAs(author);
      expect((await (await markRead()).json()).marked).toBe(1);
      expect(await hasUnread(author)).toBe(false);
      expect((await inbox(author))[0].unread).toBe(false);
      expect(await hasUnread(other.author)).toBe(true);
    });

    it("prunes anything older than 90 days", async () => {
      const { author, reader, postId } = await postWithReader();
      await reactAs(reader, postId, "like");
      await prisma.notification.updateMany({
        data: { createdAt: new Date(Date.now() - 91 * 24 * 60 * 60 * 1000) },
      });
      expect(await inbox(author)).toEqual([]);
      expect(await prisma.notification.count()).toBe(0);
    });
  });
});
