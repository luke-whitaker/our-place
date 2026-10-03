import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import {
  createTestCommunity,
  createTestItem,
  createTestPost,
  createTestUser,
  joinCommunity,
  jsonRequest,
} from "@/test/route-helpers";
import { isBlockedEitherWay } from "@/lib/blocks";
import { notify } from "@/lib/notifications";
import { exportAccount } from "@/lib/account-export";
import { deleteAccount } from "@/lib/account-deletion";
import { getMetrics } from "@/lib/metrics";
import { GET, POST } from "./route";
import { DELETE } from "./[username]/route";
import { POST as sendFriendRequest } from "@/app/api/friends/route";
import { POST as comment } from "@/app/api/posts/[id]/comments/route";
import { POST as react } from "@/app/api/posts/[id]/reactions/route";
import { POST as leaveInMailbox } from "@/app/api/users/[username]/mailbox/route";
import { GET as visitIsland } from "@/app/api/users/[username]/island/route";
import { GET as profile } from "@/app/api/users/[username]/route";
import { GET as directory } from "@/app/api/users/route";
import { POST as hostGathering } from "@/app/api/gatherings/route";
import { GET as gathering } from "@/app/api/gatherings/[id]/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn(), getAuthUser: vi.fn() }));

function authAs(user: AuthPayload) {
  vi.mocked(requireAuth).mockResolvedValue({ user });
  vi.mocked(getAuthUser).mockResolvedValue(user);
}

const block = (username: string) => POST(jsonRequest("/api/blocks", { username }));
const unblock = (username: string) =>
  DELETE(new Request("http://localhost/api/blocks/x", { method: "DELETE" }), {
    params: Promise.resolve({ username }),
  });
const byName = (username: string) => ({ params: Promise.resolve({ username }) });
const byId = (id: string) => ({ params: Promise.resolve({ id }) });

/** `blocker` blocks `blocked` through the route. */
async function blockAs(blocker: AuthPayload, blocked: AuthPayload) {
  authAs(blocker);
  const res = await block(blocked.username);
  expect(res.status).toBe(201);
}

async function befriend(a: AuthPayload, b: AuthPayload) {
  await prisma.friendship.create({
    data: { userId: a.userId, friendId: b.userId, status: "accepted" },
  });
}

function inAnHour(hours = 1) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

beforeEach(() => {
  vi.mocked(requireAuth).mockReset();
  vi.mocked(getAuthUser).mockReset();
});

describe("POST /api/blocks", () => {
  it("refuses blocking yourself", async () => {
    const me = await createTestUser();
    authAs(me);
    const res = await block(me.username);
    expect(res.status).toBe(400);
  });

  it("answers 404 for someone who doesn't exist", async () => {
    const me = await createTestUser();
    authAs(me);
    expect((await block("nobody_here")).status).toBe(404);
  });

  it("answers 409 the second time", async () => {
    const me = await createTestUser();
    const them = await createTestUser();
    await blockAs(me, them);
    expect((await block(them.username)).status).toBe(409);
  });

  it("unfriends both, and removes requests, notifications, and invitations between them", async () => {
    const me = await createTestUser();
    const them = await createTestUser();
    const friendship = await prisma.friendship.create({
      data: { userId: them.userId, friendId: me.userId, status: "accepted" },
    });
    await prisma.notification.create({
      data: {
        recipientId: me.userId,
        actorId: them.userId,
        kind: "friend_accepted",
        friendshipId: friendship.id,
      },
    });
    const theirs = await prisma.gathering.create({
      data: {
        hostId: them.userId,
        kind: "in_person",
        title: "Their party",
        startsAt: inAnHour(),
        endsAt: inAnHour(2),
        address: "Somewhere",
      },
    });
    await prisma.gatheringInvite.create({ data: { gatheringId: theirs.id, userId: me.userId } });
    const letter = await prisma.item.create({
      data: {
        ownerId: me.userId,
        kind: "note",
        location: "mailbox",
        slot: 0,
        body: "You're invited.",
        fromId: them.userId,
        gatheringId: theirs.id,
      },
    });
    const ordinaryLetter = await createTestItem({
      ownerId: me.userId,
      kind: "note",
      location: "mailbox",
      slot: 1,
      fromId: them.userId,
      body: "Hello.",
    });

    await blockAs(me, them);

    expect(await prisma.friendship.count()).toBe(0);
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.gatheringInvite.count({ where: { userId: me.userId } })).toBe(0);
    expect(await prisma.item.findUnique({ where: { id: letter.id } })).toBeNull();
    // A plain letter they sent earlier is the recipient's to keep or throw away.
    expect(await prisma.item.findUnique({ where: { id: ordinaryLetter } })).not.toBeNull();
    expect(await isBlockedEitherWay(them.userId, me.userId)).toBe(true);
  });
});

describe("GET /api/blocks and DELETE /api/blocks/[username]", () => {
  it("lists only the blocks the caller made", async () => {
    const me = await createTestUser({ displayName: "Me" });
    const them = await createTestUser({ displayName: "Them" });
    const other = await createTestUser();
    await blockAs(me, them);
    await blockAs(other, me);

    authAs(me);
    const body = await (await GET()).json();
    expect(body.blocked).toHaveLength(1);
    expect(body.blocked[0]).toMatchObject({ username: them.username, display_name: "Them" });
  });

  it("unblocks without restoring the friendship", async () => {
    const me = await createTestUser();
    const them = await createTestUser();
    await befriend(me, them);
    await blockAs(me, them);

    expect((await unblock(them.username)).status).toBe(200);
    expect(await isBlockedEitherWay(me.userId, them.userId)).toBe(false);
    expect(await prisma.friendship.count()).toBe(0);
  });

  it("can't lift a block someone else made", async () => {
    const me = await createTestUser();
    const them = await createTestUser();
    await blockAs(them, me);

    authAs(me);
    expect((await unblock(them.username)).status).toBe(404);
    expect(await isBlockedEitherWay(me.userId, them.userId)).toBe(true);
  });
});

// Every rule holds both ways: the member who blocked and the member blocked
// are equally out of reach of each other.
describe.each([
  ["the blocker", true],
  ["the blocked member", false],
])("enforcement, acting as %s", (_label, actorIsBlocker) => {
  async function pair() {
    const actor = await createTestUser();
    const target = await createTestUser({ displayName: "Target" });
    if (actorIsBlocker) await blockAs(actor, target);
    else await blockAs(target, actor);
    authAs(actor);
    return { actor, target };
  }

  it("can't send a friend request, and hears only that the person doesn't exist", async () => {
    const { target } = await pair();
    const res = await sendFriendRequest(jsonRequest("/api/friends", { username: target.username }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("That person doesn't exist.");
    expect(await prisma.friendship.count()).toBe(0);
  });

  it("can't comment on the other's post", async () => {
    const { target } = await pair();
    const postId = await createTestPost({ authorId: target.userId });
    const res = await comment(
      jsonRequest(`/api/posts/${postId}/comments`, { content: "Hi" }),
      byId(postId),
    );
    expect(res.status).toBe(403);
    expect(await prisma.comment.count()).toBe(0);
  });

  it("can't react to the other's post, but can take back an earlier reaction", async () => {
    const { actor, target } = await pair();
    const postId = await createTestPost({ authorId: target.userId });
    const res = await react(
      jsonRequest(`/api/posts/${postId}/reactions`, { type: "like" }),
      byId(postId),
    );
    expect(res.status).toBe(403);

    await prisma.reaction.create({ data: { postId, userId: actor.userId, type: "like" } });
    const takeBack = await react(
      jsonRequest(`/api/posts/${postId}/reactions`, { type: "like" }),
      byId(postId),
    );
    expect(takeBack.status).toBe(200);
    expect(await prisma.reaction.count()).toBe(0);
  });

  it("can't visit the other's island, even one open to anyone", async () => {
    const { target } = await pair();
    await prisma.user.update({
      where: { id: target.userId },
      data: { islandVisibility: "anyone" },
    });
    const res = await visitIsland(
      new NextRequest(`http://localhost/api/users/${target.username}/island`),
      byName(target.username),
    );
    expect(res.status).toBe(403);
  });

  it("can't get onto the other's island through a gathering portal either", async () => {
    const { actor, target } = await pair();
    const community = await createTestCommunity(target.userId);
    await joinCommunity(target.userId, community);
    await joinCommunity(actor.userId, community);
    const planted = await prisma.gathering.create({
      data: {
        hostId: target.userId,
        communityId: community,
        kind: "world",
        title: "Island party",
        startsAt: new Date(Date.now() - 60_000),
        endsAt: inAnHour(),
        mushroomWorld: `island:${target.userId}`,
        mushroomCol: 5,
        mushroomRow: 5,
        plantedAt: new Date(),
      },
    });
    const visit = () =>
      visitIsland(
        new NextRequest(
          `http://localhost/api/users/${target.username}/island?gathering=${planted.id}`,
        ),
        byName(target.username),
      );
    expect((await visit()).status).toBe(403);

    // The control: another community member does get in through the portal.
    const bystander = await createTestUser();
    await joinCommunity(bystander.userId, community);
    authAs(bystander);
    expect((await visit()).status).toBe(200);
  });

  it("can't leave a letter in the other's mailbox", async () => {
    const { actor, target } = await pair();
    await prisma.user.update({
      where: { id: target.userId },
      data: { islandVisibility: "anyone" },
    });
    const note = await createTestItem({ ownerId: actor.userId, kind: "note", slot: 0, body: "Hi" });
    const res = await leaveInMailbox(
      jsonRequest(`/api/users/${target.username}/mailbox`, { item_id: note }),
      byName(target.username),
    );
    expect(res.status).toBe(403);
    expect(await prisma.item.count({ where: { ownerId: target.userId } })).toBe(0);
  });

  it("can't invite the other to a gathering by name", async () => {
    const { target } = await pair();
    const res = await hostGathering(
      jsonRequest("/api/gatherings", {
        kind: "in_person",
        title: "Dinner",
        starts_at: inAnHour().toISOString(),
        ends_at: inAnHour(2).toISOString(),
        address: "My place",
        invitee_ids: [target.userId],
      }),
    );
    expect(res.status).toBe(400);
    expect(await prisma.gathering.count()).toBe(0);
  });

  it("leaves the other out of a community gathering's invitations", async () => {
    const { actor, target } = await pair();
    const bystander = await createTestUser();
    const community = await createTestCommunity(actor.userId);
    for (const id of [actor.userId, target.userId, bystander.userId]) {
      await joinCommunity(id, community);
    }
    const res = await hostGathering(
      jsonRequest("/api/gatherings", {
        kind: "in_person",
        title: "Picnic",
        starts_at: inAnHour().toISOString(),
        ends_at: inAnHour(2).toISOString(),
        address: "The park",
        community_id: community,
      }),
    );
    expect(res.status).toBe(201);
    const invited = await prisma.gatheringInvite.findMany({ select: { userId: true } });
    expect(invited.map((i) => i.userId).sort()).toEqual([actor.userId, bystander.userId].sort());
    expect(await prisma.notification.count({ where: { recipientId: target.userId } })).toBe(0);

    // And the one left out can't open it through the community either.
    const { gathering: created } = await res.json();
    authAs(target);
    expect((await gathering(new Request("http://localhost"), byId(created.id))).status).toBe(404);
  });

  it("isn't offered the other in the invitee search, though the directory still lists them", async () => {
    const { target } = await pair();
    const search = (extra: string) =>
      directory(new NextRequest(`http://localhost/api/users?search=Target${extra}`));
    const plain = await (await search("")).json();
    const invitable = await (await search("&invitable=true")).json();
    expect(plain.users.map((u: { id: string }) => u.id)).toContain(target.userId);
    expect(invitable.users).toHaveLength(0);
  });

  it("sees the other's island as closed on their profile", async () => {
    const { target } = await pair();
    await prisma.user.update({
      where: { id: target.userId },
      data: { islandVisibility: "anyone" },
    });
    const body = await (
      await profile(new Request("http://localhost"), byName(target.username))
    ).json();
    expect(body.user.island_open).toBe(false);
    // Only the blocker learns there's a block; the blocked member is never told.
    expect(body.user.blocked_by_me).toBe(actorIsBlocker);
  });

  it("never notifies the other", async () => {
    const { actor, target } = await pair();
    const postId = await createTestPost({ authorId: target.userId });
    await prisma.$transaction((tx) =>
      notify(tx, { recipientId: target.userId, actorId: actor.userId, kind: "comment", postId }),
    );
    expect(await prisma.notification.count()).toBe(0);
  });
});

describe("blocks elsewhere", () => {
  it("lists only the blocks a member made in their data export", async () => {
    const me = await createTestUser();
    const them = await createTestUser({ displayName: "Them" });
    const other = await createTestUser();
    await blockAs(me, them);
    await blockAs(other, me);

    const data = await exportAccount(me.userId);
    expect(data.blocked_members).toEqual([
      expect.objectContaining({ username: them.username, display_name: "Them" }),
    ]);
  });

  it("removes every block a member made or received when they delete their account", async () => {
    const me = await createTestUser();
    const them = await createTestUser();
    const other = await createTestUser();
    await blockAs(me, them);
    await blockAs(other, me);

    await deleteAccount(me.userId, "leave_posts");
    expect(await prisma.block.count()).toBe(0);
  });

  it("counts blocks for the admin metrics without saying who", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const c = await createTestUser();
    await blockAs(a, b);
    await blockAs(c, b);

    expect((await getMetrics()).activeBlocks).toBe(2);
  });
});
