import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { closeRoom, removeFromRoom, voiceConfigured } from "@/lib/livekit";
import { pruneCalls } from "@/lib/calls";
import { deleteAccount } from "@/lib/account-deletion";
import type { AuthPayload, CallsCurrentResponse } from "@/lib/types";
import { createTestUser, jsonRequest } from "@/test/route-helpers";
import { befriend, block, minutesAgo, seatStatus, seedCall } from "@/test/call-helpers";
import { POST as startCall } from "./route";
import { GET as current } from "./current/route";
import { POST as invite } from "./[id]/invites/route";
import { POST as decline } from "./[id]/decline/route";
import { POST as leave } from "./[id]/leave/route";
import { POST as ghostMode } from "../outfits/ghost/route";
import { POST as blockMember } from "../blocks/route";

vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/livekit", () => ({
  CALL_TOKEN_TTL_SECONDS: 600,
  voiceConfigured: vi.fn(() => true),
  voiceUrl: vi.fn(() => "wss://voice.test"),
  mintCallToken: vi.fn(async () => "test-token"),
  removeFromRoom: vi.fn(async () => {}),
  closeRoom: vi.fn(async () => {}),
}));
const mockRequireAuth = vi.mocked(requireAuth);

// One test turns voice off; every other one runs with it on.
beforeEach(() => vi.mocked(voiceConfigured).mockReturnValue(true));

function actAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

const idParams = (id: string) => ({ params: Promise.resolve({ id }) });

function start(usernames: string[]) {
  return startCall(jsonRequest("http://localhost/api/calls", { usernames }));
}

function inviteTo(callId: string, usernames: string[]) {
  return invite(
    jsonRequest(`http://localhost/api/calls/${callId}/invites`, { usernames }),
    idParams(callId),
  );
}

const post = (path: string) =>
  new Request(`http://localhost/api/calls/${path}`, { method: "POST" });

async function currentFor(user: AuthPayload): Promise<CallsCurrentResponse> {
  actAs(user);
  const res = await current();
  expect(res.status).toBe(200);
  return (await res.json()) as CallsCurrentResponse;
}

describe("POST /api/calls", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("starts a call: you're in it, your friends are invited and notified", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    await befriend(me, friend);
    actAs(me);

    const res = await start([friend.username.toUpperCase()]);
    expect(res.status).toBe(201);
    const { call_id } = await res.json();

    expect(await seatStatus(call_id, me)).toBe("joined");
    expect(await seatStatus(call_id, friend)).toBe("pending");
    const note = await prisma.notification.findFirst({
      where: { recipientId: friend.userId, kind: "call_invite" },
      select: { actorId: true, callId: true },
    });
    expect(note).toEqual({ actorId: me.userId, callId: call_id });
  });

  it("refuses strangers, yourself, and anyone unknown", async () => {
    const me = await createTestUser();
    const stranger = await createTestUser();
    actAs(me);

    expect((await start([stranger.username])).status).toBe(403);
    expect((await start([me.username])).status).toBe(400);
    expect((await start(["nobody_by_this_name"])).status).toBe(400);
    expect((await start([])).status).toBe(400);
    expect(await prisma.call.count()).toBe(0);
  });

  it("refuses a friend in a block either way, worded like a stranger", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    await befriend(me, friend);
    await block(friend, me);
    actAs(me);

    const res = await start([friend.username]);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("You can only call your friends.");
  });

  it("refuses a ghost and a member already in a call", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    await befriend(me, friend);
    actAs(me);

    await prisma.user.update({ where: { id: me.userId }, data: { ghost: true } });
    expect((await start([friend.username])).status).toBe(403);
    await prisma.user.update({ where: { id: me.userId }, data: { ghost: false } });

    expect((await start([friend.username])).status).toBe(201);
    expect((await start([friend.username])).status).toBe(409);
  });

  it("answers 503 when this server has no LiveKit keys", async () => {
    const me = await createTestUser();
    actAs(me);
    vi.mocked(voiceConfigured).mockReturnValue(false);

    const res = await start(["anyone"]);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Voice isn't set up on this server.");
  });
});

describe("POST /api/calls/[id]/invites", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("lets someone in the call invite their own friend, a stranger to the starter", async () => {
    const starter = await createTestUser();
    const guest = await createTestUser();
    const guestsFriend = await createTestUser();
    await befriend(starter, guest);
    await befriend(guest, guestsFriend);
    const callId = await seedCall([
      { user: starter, status: "joined" },
      { user: guest, status: "joined" },
    ]);
    actAs(guest);

    const res = await inviteTo(callId, [guestsFriend.username]);
    expect(res.status).toBe(200);
    expect((await res.json()).invited).toBe(1);
    expect(await seatStatus(callId, guestsFriend)).toBe("pending");
    expect(
      await prisma.notification.count({
        where: { recipientId: guestsFriend.userId, actorId: guest.userId, kind: "call_invite" },
      }),
    ).toBe(1);
  });

  it("refuses someone who isn't the inviter's friend", async () => {
    const starter = await createTestUser();
    const notMyFriend = await createTestUser();
    const callId = await seedCall([{ user: starter, status: "joined" }]);
    actAs(starter);

    expect((await inviteTo(callId, [notMyFriend.username])).status).toBe(403);
  });

  it("refuses an inviter who hasn't joined", async () => {
    const starter = await createTestUser();
    const invited = await createTestUser();
    const invitedsFriend = await createTestUser();
    await befriend(invited, invitedsFriend);
    const callId = await seedCall([
      { user: starter, status: "joined" },
      { user: invited, status: "pending" },
    ]);
    actAs(invited);

    expect((await inviteTo(callId, [invitedsFriend.username])).status).toBe(403);
  });

  it("refuses anyone in a block with someone already in the call or invited", async () => {
    const starter = await createTestUser();
    const guest = await createTestUser();
    const pendingGuest = await createTestUser();
    const blockedByStarter = await createTestUser();
    const blockedByPending = await createTestUser();
    await befriend(guest, blockedByStarter);
    await befriend(guest, blockedByPending);
    await block(starter, blockedByStarter);
    await block(blockedByPending, pendingGuest);
    const callId = await seedCall([
      { user: starter, status: "joined" },
      { user: guest, status: "joined" },
      { user: pendingGuest, status: "pending" },
    ]);
    actAs(guest);

    expect((await inviteTo(callId, [blockedByStarter.username])).status).toBe(409);
    expect((await inviteTo(callId, [blockedByPending.username])).status).toBe(409);
    expect(await seatStatus(callId, blockedByStarter)).toBeNull();
  });

  it("holds a call to 8 people, counting open invitations", async () => {
    const starter = await createTestUser();
    const pending = await Promise.all(Array.from({ length: 7 }, () => createTestUser()));
    const oneTooMany = await createTestUser();
    await befriend(starter, oneTooMany);
    const callId = await seedCall([
      { user: starter, status: "joined" },
      ...pending.map((user) => ({ user, status: "pending" as const })),
    ]);
    actAs(starter);

    const res = await inviteTo(callId, [oneTooMany.username]);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("A call holds up to 8 people.");
  });

  it("invites again someone whose invitation expired or who declined", async () => {
    const starter = await createTestUser();
    const friend = await createTestUser();
    await befriend(starter, friend);
    const callId = await seedCall([
      { user: starter, status: "joined" },
      { user: friend, status: "declined" },
    ]);
    actAs(starter);

    expect((await inviteTo(callId, [friend.username])).status).toBe(200);
    expect(await seatStatus(callId, friend)).toBe("pending");
  });
});

describe("GET /api/calls/current", () => {
  beforeEach(() => mockRequireAuth.mockReset());

  it("shows your call with joined members first, and keeps you present", async () => {
    const me = await createTestUser({ displayName: "Me" });
    const friend = await createTestUser({ displayName: "Friend" });
    const callId = await seedCall([
      { user: me, status: "joined", at: new Date(Date.now() - 20_000) },
      { user: friend, status: "pending" },
    ]);

    const body = await currentFor(me);

    expect(body.voice_enabled).toBe(true);
    expect(body.invitations).toEqual([]);
    expect(body.call?.id).toBe(callId);
    expect(body.call?.members.map((m) => [m.display_name, m.status])).toEqual([
      ["Me", "joined"],
      ["Friend", "pending"],
    ]);
    const seen = await prisma.callInvite.findUniqueOrThrow({
      where: { callId_userId: { callId, userId: me.userId } },
      select: { seenAt: true },
    });
    expect(Date.now() - seen.seenAt!.getTime()).toBeLessThan(5_000);
  });

  it("shows open invitations with who's in the call, and hides expired ones", async () => {
    const caller = await createTestUser({ displayName: "Caller" });
    const me = await createTestUser();
    const other = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: me, status: "pending" },
    ]);
    await seedCall([
      { user: other, status: "joined" },
      { user: me, status: "pending", at: minutesAgo(11) },
    ]);

    const body = await currentFor(me);

    expect(body.call).toBeNull();
    expect(body.invitations).toHaveLength(1);
    expect(body.invitations[0]).toMatchObject({
      call_id: callId,
      invited_by: { username: caller.username, display_name: "Caller" },
      joined: [{ username: caller.username, display_name: "Caller" }],
    });
  });

  it("hides an invitation to a call nobody is in any more", async () => {
    const caller = await createTestUser();
    const me = await createTestUser();
    await seedCall([
      { user: caller, status: "joined", at: minutesAgo(2) },
      { user: me, status: "pending" },
    ]);

    const body = await currentFor(me);
    expect(body.invitations).toEqual([]);
  });

  it("doesn't bring back someone whose client stopped checking in", async () => {
    const me = await createTestUser();
    await seedCall([{ user: me, status: "joined", at: minutesAgo(2) }]);

    const body = await currentFor(me);
    expect(body.call).toBeNull();
  });
});

describe("POST /api/calls/[id]/decline and /leave", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
    vi.mocked(closeRoom).mockClear();
  });

  it("declines an open invitation, once", async () => {
    const caller = await createTestUser();
    const me = await createTestUser();
    const callId = await seedCall([
      { user: caller, status: "joined" },
      { user: me, status: "pending" },
    ]);
    actAs(me);

    expect((await decline(post(`${callId}/decline`), idParams(callId))).status).toBe(200);
    expect(await seatStatus(callId, me)).toBe("declined");
    expect((await decline(post(`${callId}/decline`), idParams(callId))).status).toBe(404);
  });

  it("keeps the call going while someone is left, and the last one out ends it", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const callId = await seedCall([
      { user: a, status: "joined" },
      { user: b, status: "joined" },
    ]);

    actAs(a);
    expect((await leave(post(`${callId}/leave`), idParams(callId))).status).toBe(200);
    expect(await seatStatus(callId, a)).toBe("left");
    let call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.endedAt).toBeNull();
    expect(closeRoom).not.toHaveBeenCalled();

    actAs(b);
    expect((await leave(post(`${callId}/leave`), idParams(callId))).status).toBe(200);
    call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.endedAt).not.toBeNull();
    expect(closeRoom).toHaveBeenCalledWith(callId);
  });

  it("refuses to leave a call you aren't in", async () => {
    const a = await createTestUser();
    const me = await createTestUser();
    const callId = await seedCall([{ user: a, status: "joined" }]);
    actAs(me);

    expect((await leave(post(`${callId}/leave`), idParams(callId))).status).toBe(404);
  });
});

describe("Ghost Mode, blocking, and deletion take people out of calls", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
    vi.mocked(removeFromRoom).mockClear();
  });

  it("turning Ghost Mode on leaves the call and disconnects you", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    const callId = await seedCall([
      { user: friend, status: "joined" },
      { user: me, status: "joined" },
    ]);
    actAs(me);

    const res = await ghostMode(jsonRequest("http://localhost/api/outfits/ghost", { on: true }));
    expect(res.status).toBe(200);
    expect(await seatStatus(callId, me)).toBe("left");
    expect(removeFromRoom).toHaveBeenCalledWith(callId, me.userId);
  });

  it("a block removes whichever of the two joined later, and declines open invitations", async () => {
    const earlier = await createTestUser();
    const later = await createTestUser();
    const invited = await createTestUser();
    const callId = await seedCall([
      { user: earlier, status: "joined", at: new Date(Date.now() - 20_000) },
      { user: later, status: "joined", at: new Date(Date.now() - 10_000) },
    ]);
    const otherCall = await seedCall([
      { user: earlier, status: "joined", at: minutesAgo(30) },
      { user: invited, status: "pending" },
    ]);
    actAs(later);

    const res = await blockMember(
      jsonRequest("http://localhost/api/blocks", { username: earlier.username }),
    );
    expect(res.status).toBe(201);
    expect(await seatStatus(callId, earlier)).toBe("joined");
    expect(await seatStatus(callId, later)).toBe("left");
    expect(removeFromRoom).toHaveBeenCalledWith(callId, later.userId);
    // A call the two don't share is left alone.
    expect(await seatStatus(otherCall, invited)).toBe("pending");
  });

  it("a block declines the blocked member's open invitation to the blocker's call", async () => {
    const host = await createTestUser();
    const pending = await createTestUser();
    const callId = await seedCall([
      { user: host, status: "joined" },
      { user: pending, status: "pending" },
    ]);
    actAs(host);

    await blockMember(jsonRequest("http://localhost/api/blocks", { username: pending.username }));
    expect(await seatStatus(callId, pending)).toBe("declined");
    expect(await seatStatus(callId, host)).toBe("joined");
  });

  it("deleting an account removes its call rows and keeps the call's dates", async () => {
    const me = await createTestUser();
    const friend = await createTestUser();
    const callId = await seedCall([
      { user: me, status: "joined" },
      { user: friend, status: "pending" },
    ]);

    await deleteAccount(me.userId, "leave_posts");

    expect(await seatStatus(callId, me)).toBeNull();
    const call = await prisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.startedById).toBeNull();
    const inviterOfFriend = await prisma.callInvite.findUniqueOrThrow({
      where: { callId_userId: { callId, userId: friend.userId } },
      select: { invitedById: true },
    });
    expect(inviterOfFriend.invitedById).toBeNull();
  });
});

describe("pruneCalls", () => {
  it("ends stuck calls, forgets who was in old ones, and drops the oldest rows", async () => {
    const a = await createTestUser();
    const b = await createTestUser();
    const now = new Date();
    const stuck = await seedCall([{ user: a, status: "joined", at: minutesAgo(60 * 25) }]);
    await prisma.call.update({ where: { id: stuck }, data: { startedAt: minutesAgo(60 * 25) } });
    const monthOld = await seedCall(
      [
        { user: a, status: "left" },
        { user: b, status: "left" },
      ],
      minutesAgo(60 * 24 * 31),
    );
    await prisma.notification.create({
      data: { recipientId: b.userId, actorId: a.userId, kind: "call_invite", callId: monthOld },
    });
    const ancient = await seedCall([{ user: a, status: "left" }], minutesAgo(60 * 24 * 100));
    await prisma.call.update({
      where: { id: ancient },
      data: { startedAt: minutesAgo(60 * 24 * 100) },
    });
    const live = await seedCall([{ user: b, status: "joined" }]);

    await pruneCalls(now);

    expect((await prisma.call.findUniqueOrThrow({ where: { id: stuck } })).endedAt).not.toBeNull();
    const old = await prisma.call.findUniqueOrThrow({ where: { id: monthOld } });
    expect(old.startedById).toBeNull();
    expect(await prisma.callInvite.count({ where: { callId: monthOld } })).toBe(0);
    expect(await prisma.notification.count({ where: { callId: monthOld } })).toBe(0);
    expect(await prisma.call.findUnique({ where: { id: ancient } })).toBeNull();
    expect((await prisma.call.findUniqueOrThrow({ where: { id: live } })).endedAt).toBeNull();
  });
});
