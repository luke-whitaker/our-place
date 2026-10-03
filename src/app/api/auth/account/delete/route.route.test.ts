import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { deleteFromStorage } from "@/lib/storage";
import { deleteAccount, deleteUploadedMedia } from "@/lib/account-deletion";
import type { AuthPayload } from "@/lib/types";
import {
  createTestCommunity,
  createTestItem,
  createTestPost,
  createTestUser,
  joinCommunity,
  jsonRequest,
} from "@/test/route-helpers";
import { POST } from "./route";
import { GET as directory } from "@/app/api/users/route";
import { GET as profile } from "@/app/api/users/[username]/route";

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  requireAuth: vi.fn(),
}));

// Storage deletion is recorded, never sent: the dev bucket may be production's.
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  deleteFromStorage: vi.fn(),
}));

const mockRequireAuth = vi.mocked(requireAuth);
const mockDeleteFromStorage = vi.mocked(deleteFromStorage);
const PASSWORD = "correct-horse-battery";

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

async function memberWithPassword(role = "user") {
  const user = await createTestUser({ role });
  await prisma.user.update({
    where: { id: user.userId },
    data: { passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  return user;
}

async function deleteMe(body: unknown) {
  const res = await POST(jsonRequest("http://localhost/api/auth/account/delete", body));
  return { status: res.status, body: await res.json(), setCookies: res.headers.getSetCookie() };
}

async function befriend(a: string, b: string) {
  await prisma.friendship.create({ data: { userId: a, friendId: b, status: "accepted" } });
}

/** A post by `authorId` with one comment and one like from `otherId` on it,
 * and the matching counts, as the real routes would leave them. */
async function postWithReply(authorId: string, otherId: string, communityId: string) {
  const postId = await createTestPost({ authorId, communityId });
  await prisma.comment.create({ data: { postId, authorId: otherId, content: "Nice!" } });
  await prisma.reaction.create({ data: { postId, userId: otherId, type: "like" } });
  await prisma.post.update({ where: { id: postId }, data: { commentCount: 1, reactionCount: 1 } });
  return postId;
}

describe("POST /api/auth/account/delete", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
    mockDeleteFromStorage.mockReset();
  });

  it("refuses when signed out", async () => {
    const { NextResponse } = await import("next/server");
    mockRequireAuth.mockResolvedValue({
      error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
    });
    expect((await deleteMe({ current_password: PASSWORD, mode: "leave_posts" })).status).toBe(401);
  });

  it("needs the right password and a choice, and changes nothing otherwise", async () => {
    const me = await memberWithPassword();
    authAs(me);
    expect((await deleteMe({ current_password: "wrong", mode: "leave_posts" })).status).toBe(403);
    expect((await deleteMe({ current_password: PASSWORD })).status).toBe(400);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: me.userId } });
    expect(row.deletedAt).toBeNull();
    expect(row.username).toBe(me.username);
  });

  it("refuses an admin account", async () => {
    const admin = await memberWithPassword("admin");
    authAs(admin);
    const { status, body } = await deleteMe({ current_password: PASSWORD, mode: "leave_posts" });
    expect(status).toBe(403);
    expect(body.error).toMatch(/Ask Luke/);
  });

  it("leave_posts: posts and comments stay as a former member; everything personal goes", async () => {
    const me = await memberWithPassword();
    const friend = await createTestUser();
    const community = await createTestCommunity(friend.userId);
    await joinCommunity(me.userId, community);
    await prisma.community.update({ where: { id: community }, data: { memberCount: 2 } });
    const myPost = await postWithReply(me.userId, friend.userId, community);
    const theirPost = await postWithReply(friend.userId, me.userId, community);
    await befriend(me.userId, friend.userId);
    await createTestItem({ ownerId: me.userId, kind: "notebook" });
    const letter = await createTestItem({
      ownerId: friend.userId,
      kind: "note",
      location: "mailbox",
      slot: 0,
      body: "See you Saturday",
      fromId: me.userId,
    });
    await prisma.worldPlant.create({
      data: { ownerId: me.userId, worldId: "capital", col: 1, row: 1, color: "red" },
    });

    authAs(me);
    const { status, setCookies } = await deleteMe({
      current_password: PASSWORD,
      mode: "leave_posts",
    });
    expect(status).toBe(200);
    // Both cookies are cleared on this device.
    expect(setCookies).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^auth_token=;/),
        expect.stringMatching(/^trusted_device=;/),
      ]),
    );

    const tomb = await prisma.user.findUniqueOrThrow({ where: { id: me.userId } });
    expect(tomb.deletedAt).not.toBeNull();
    expect(tomb.displayName).toBe("A former member");
    expect(tomb.username).not.toBe(me.username);
    expect(tomb.email).not.toContain("example.test");
    expect(await bcrypt.compare(PASSWORD, tomb.passwordHash)).toBe(false);

    // Their post and their comment stay, signed by the tombstone.
    expect(await prisma.post.count({ where: { id: myPost } })).toBe(1);
    expect(await prisma.comment.count({ where: { postId: theirPost, authorId: me.userId } })).toBe(
      1,
    );
    // Their like on the friend's post is gone, and the count with it.
    const friendPost = await prisma.post.findUniqueOrThrow({ where: { id: theirPost } });
    expect(friendPost.reactionCount).toBe(0);
    expect(friendPost.commentCount).toBe(1);
    // The letter they sent stays with its recipient.
    expect(await prisma.item.findUnique({ where: { id: letter } })).toMatchObject({
      fromId: me.userId,
    });
    expect(await prisma.item.count({ where: { ownerId: me.userId } })).toBe(0);
    expect(await prisma.friendship.count({ where: { userId: me.userId } })).toBe(0);
    expect(await prisma.communityMember.count({ where: { userId: me.userId } })).toBe(0);
    expect(
      (await prisma.community.findUniqueOrThrow({ where: { id: community } })).memberCount,
    ).toBe(1);
    expect(await prisma.worldPlant.count({ where: { ownerId: me.userId } })).toBe(0);
  });

  it("remove_everything: their posts (with others' replies) and comments go, counts follow", async () => {
    const me = await memberWithPassword();
    const friend = await createTestUser();
    const community = await createTestCommunity(friend.userId);
    const myPost = await postWithReply(me.userId, friend.userId, community);
    const theirPost = await postWithReply(friend.userId, me.userId, community);

    authAs(me);
    expect((await deleteMe({ current_password: PASSWORD, mode: "remove_everything" })).status).toBe(
      200,
    );
    expect(await prisma.post.count({ where: { id: myPost } })).toBe(0);
    expect(await prisma.comment.count({ where: { postId: myPost } })).toBe(0);
    expect(await prisma.comment.count({ where: { authorId: me.userId } })).toBe(0);
    const friendPost = await prisma.post.findUniqueOrThrow({ where: { id: theirPost } });
    expect(friendPost.commentCount).toBe(0);
    expect(friendPost.reactionCount).toBe(0);
  });

  it("cancels a gathering they host, tells everyone going, and drops the address", async () => {
    const me = await memberWithPassword();
    const guest = await createTestUser();
    const startsAt = new Date(Date.now() + 86_400_000);
    const gathering = await prisma.gathering.create({
      data: {
        hostId: me.userId,
        kind: "in_person",
        title: "Picnic",
        address: "12 Home Street",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
      },
    });
    await prisma.gatheringInvite.create({
      data: { gatheringId: gathering.id, userId: guest.userId, status: "accepted" },
    });

    authAs(me);
    expect((await deleteMe({ current_password: PASSWORD, mode: "remove_everything" })).status).toBe(
      200,
    );
    const after = await prisma.gathering.findUniqueOrThrow({ where: { id: gathering.id } });
    expect(after.status).toBe("cancelled");
    expect(after.address).toBe("");
    const notices = await prisma.notification.findMany({
      where: { recipientId: guest.userId, kind: "gathering_cancelled" },
      select: { actor: { select: { displayName: true } } },
    });
    expect(notices).toEqual([{ actor: { displayName: "A former member" } }]);
  });

  it("takes their poll votes back out of the counts, and leaves others' votes", async () => {
    const leaver = await memberWithPassword();
    const stayer = await createTestUser();
    const postId = await createTestPost({ authorId: stayer.userId });
    const poll = await prisma.poll.create({
      data: {
        postId,
        options: {
          create: [
            { label: "Park", sortOrder: 0 },
            { label: "Cafe", sortOrder: 1 },
          ],
        },
      },
      select: { id: true, options: { select: { id: true }, orderBy: { sortOrder: "asc" } } },
    });
    const [park, cafe] = poll.options;
    for (const [userId, optionId] of [
      [leaver.userId, park.id],
      [stayer.userId, park.id],
      [stayer.userId, cafe.id],
    ]) {
      await prisma.pollVote.create({ data: { pollId: poll.id, optionId, userId } });
    }
    await prisma.pollOption.update({ where: { id: park.id }, data: { voteCount: 2 } });
    await prisma.pollOption.update({ where: { id: cafe.id }, data: { voteCount: 1 } });

    authAs(leaver);
    expect((await deleteMe({ current_password: PASSWORD, mode: "leave_posts" })).status).toBe(200);

    const counts = await prisma.pollOption.findMany({
      where: { pollId: poll.id },
      orderBy: { sortOrder: "asc" },
      select: { voteCount: true },
    });
    expect(counts.map((c) => c.voteCount)).toEqual([1, 1]);
    expect(await prisma.pollVote.count({ where: { userId: leaver.userId } })).toBe(0);
    expect(await prisma.pollVote.count({ where: { userId: stayer.userId } })).toBe(2);
  });

  it("hides the former member from the directory, profiles, and sign-in", async () => {
    const me = await memberWithPassword();
    const viewer = await createTestUser();
    authAs(me);
    await deleteMe({ current_password: PASSWORD, mode: "leave_posts" });

    authAs(viewer);
    const list = await directory(jsonRequest("http://localhost/api/users", undefined, "GET"));
    const { users } = await list.json();
    expect(users.map((u: { id: string }) => u.id)).not.toContain(me.userId);
    const tomb = await prisma.user.findUniqueOrThrow({ where: { id: me.userId } });
    const res = await profile(jsonRequest("http://localhost/x", undefined, "GET"), {
      params: Promise.resolve({ username: tomb.username }),
    });
    expect(res.status).toBe(404);
  });
});

describe("deleteAccount media", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns only our own uploads' keys, and only when removing everything", async () => {
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://pub-test.r2.dev");
    const me = await createTestUser();
    const postId = await createTestPost({ authorId: me.userId });
    await prisma.postMedia.createMany({
      data: [
        { postId, mediaType: "image", url: "https://pub-test.r2.dev/images/a1.jpg" },
        { postId, mediaType: "video", mediaSource: "youtube", url: "https://youtu.be/abc" },
      ],
    });
    expect(await deleteAccount(me.userId, "remove_everything")).toEqual(["images/a1.jpg"]);

    const other = await createTestUser();
    const kept = await createTestPost({ authorId: other.userId });
    await prisma.postMedia.create({
      data: { postId: kept, mediaType: "image", url: "https://pub-test.r2.dev/images/b2.jpg" },
    });
    expect(await deleteAccount(other.userId, "leave_posts")).toEqual([]);
  });

  it("never deletes from storage outside production", async () => {
    mockDeleteFromStorage.mockReset();
    expect(await deleteUploadedMedia(["images/a1.jpg"])).toBe(0);
    expect(mockDeleteFromStorage).not.toHaveBeenCalled();
  });

  it("deletes each key in production and keeps going past a failure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mockDeleteFromStorage.mockReset();
    mockDeleteFromStorage.mockRejectedValueOnce(new Error("R2 down")).mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await deleteUploadedMedia(["images/a.jpg", "images/b.jpg"])).toBe(1);
    expect(mockDeleteFromStorage).toHaveBeenCalledTimes(2);
  });
});
