// Voice calls between friends: who may start one, invite to one, and get a
// token for one. LiveKit carries the audio (src/lib/livekit.ts); these rows
// are the only thing that decides who's allowed in.
//
// Presence in a call is a heartbeat, not a webhook: joining sets `seen_at`,
// the connected client's poll of GET /api/calls/current?heartbeat=1 moves it
// forward, and a joined
// row not seen for CALL_PRESENCE_STALE_MS no longer counts as present. So a
// closed tab or a locked phone drops out on its own, and a call with nobody
// present ends the next time anything settles it.
//
// Rows are locked in one order everywhere: a member's `users` row, then a
// `calls` row. Nothing locks a call and then a member, so two requests can't
// wait on each other.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { blockedIdsFor } from "@/lib/blocks";
import { closeRoom, removeFromRoom, voiceConfigured } from "@/lib/livekit";
import { METRICS_WEEKS } from "@/lib/metrics";
import { notify } from "@/lib/notifications";
import { MAX_CALL_SIZE } from "@/lib/types";
import type { CallInvitation, CallMember, CallsCurrentResponse, CurrentCall } from "@/lib/types";

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

/** An unanswered invitation stops working after this. */
export const CALL_INVITE_TTL_MS = 10 * 60 * 1000;
/** A joined member whose client hasn't checked in for this long counts as
 * gone. The client polls every ~10 seconds, so this allows a few misses. */
export const CALL_PRESENCE_STALE_MS = 45 * 1000;
/** After this, an ended call keeps no record of who was in it. */
export const CALL_PEOPLE_RETENTION_DAYS = 30;
/** After this the bare row goes too: a week past what /admin/metrics shows. */
export const CALL_ROW_RETENTION_DAYS = METRICS_WEEKS * 7 + 7;
/** A call nobody has been present in for this long is ended by the prune. */
const STUCK_CALL_MS = 24 * 60 * 60 * 1000;
/** The most open invitations GET /api/calls/current returns. */
const INVITATIONS_SHOWN = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export const CALL_ENDED = "This call has ended.";
export const GHOST_REFUSAL =
  "Ghost Mode is on, so you can't be in a call. Turn it off at your armoire first.";
export const ALREADY_IN_CALL = "You're already in a call. Leave it first.";
const ONLY_FRIENDS = "You can only call your friends.";

export type CallResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

function refuse(status: number, error: string): { ok: false; status: number; error: string } {
  return { ok: false, status, error };
}

/** Someone in a call right now: joined, and their client checked in recently. */
export function presentWhere(now: Date): Prisma.CallInviteWhereInput {
  return { status: "joined", seenAt: { gte: new Date(now.getTime() - CALL_PRESENCE_STALE_MS) } };
}

/** An invitation still open: unanswered and not yet expired. */
export function openInviteWhere(now: Date): Prisma.CallInviteWhereInput {
  return { status: "pending", invitedAt: { gte: new Date(now.getTime() - CALL_INVITE_TTL_MS) } };
}

async function lockUser(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
}

async function lockCall(tx: Tx, callId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM calls WHERE id = ${callId} FOR UPDATE`;
}

/** The call `userId` is present in, if any. There's at most one, because
 * joining checks this under a lock on the member's own row. */
async function presentCallId(db: Db, userId: string, now: Date): Promise<string | null> {
  const row = await db.callInvite.findFirst({
    where: { userId, ...presentWhere(now), call: { endedAt: null } },
    select: { callId: true },
  });
  return row?.callId ?? null;
}

/**
 * Bring a call's rows up to date: a joined member who stopped checking in
 * counts as left (they may rejoin), and a call with nobody present ends.
 * Returns whether this call ended just now, so the caller can close its
 * LiveKit room after the commit.
 */
async function settleCall(tx: Tx, callId: string, now: Date): Promise<boolean> {
  const seenSince = new Date(now.getTime() - CALL_PRESENCE_STALE_MS);
  await tx.callInvite.updateMany({
    where: { callId, status: "joined", seenAt: { lt: seenSince } },
    data: { status: "left" },
  });
  if ((await tx.callInvite.count({ where: { callId, ...presentWhere(now) } })) > 0) return false;
  const ended = await tx.call.updateMany({
    where: { id: callId, endedAt: null },
    data: { endedAt: now },
  });
  return ended.count === 1;
}

/** A LiveKit request whose failure must not undo what's already saved: the
 * rows are the source of truth, so a failure is logged and nothing else. */
async function bestEffort(label: string, action: () => Promise<void>): Promise<void> {
  if (!voiceConfigured()) return;
  try {
    await action();
  } catch (error) {
    console.error(`LiveKit ${label} failed:`, error);
  }
}

/** Members by username, skipping deleted accounts, deduplicated. */
async function resolveUsernames(usernames: string[]): Promise<{ id: string }[] | null> {
  const wanted = [...new Set(usernames.map((u) => u.toLowerCase()))];
  const found = await prisma.user.findMany({
    where: { username: { in: wanted, mode: "insensitive" }, deletedAt: null },
    select: { id: true },
    take: MAX_CALL_SIZE,
  });
  return found.length === wanted.length ? found : null;
}

/** Which of `ids` are `userId`'s accepted friends. */
async function friendsAmong(userId: string, ids: string[]): Promise<Set<string>> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: "accepted",
      OR: [
        { userId, friendId: { in: ids } },
        { friendId: userId, userId: { in: ids } },
      ],
    },
    select: { userId: true, friendId: true },
  });
  return new Set(rows.map((r) => (r.userId === userId ? r.friendId : r.userId)));
}

/** `inviterId`'s friends among `usernames`, none blocked either way, or a
 * refusal worded the same for a stranger and a blocked member. */
async function pickFriends(
  inviterId: string,
  usernames: string[],
  refusal: string,
): Promise<CallResult<string[]>> {
  const people = await resolveUsernames(usernames);
  const ids = (people ?? []).map((p) => p.id);
  if (!people || ids.includes(inviterId)) return refuse(400, refusal);
  const [friends, blocked] = await Promise.all([
    friendsAmong(inviterId, ids),
    blockedIdsFor(inviterId),
  ]);
  if (ids.some((id) => !friends.has(id) || blocked.has(id))) return refuse(403, refusal);
  return { ok: true, value: ids };
}

/** Start a call with some of the caller's friends. The caller is in it at
 * once; everyone picked gets an invitation and a notification. */
export async function startCall(
  starterId: string,
  usernames: string[],
  now: Date,
): Promise<CallResult<string>> {
  const picked = await pickFriends(starterId, usernames, ONLY_FRIENDS);
  if (!picked.ok) return picked;
  const ids = picked.value;

  return prisma.$transaction(async (tx): Promise<CallResult<string>> => {
    await lockUser(tx, starterId);
    const me = await tx.user.findUniqueOrThrow({
      where: { id: starterId },
      select: { ghost: true },
    });
    if (me.ghost) return refuse(403, GHOST_REFUSAL);
    if (await presentCallId(tx, starterId, now)) return refuse(409, ALREADY_IN_CALL);

    const call = await tx.call.create({
      data: {
        startedById: starterId,
        startedAt: now,
        invites: {
          create: [
            { userId: starterId, status: "joined", invitedAt: now, respondedAt: now, seenAt: now },
            ...ids.map((userId) => ({ userId, invitedById: starterId, invitedAt: now })),
          ],
        },
      },
      select: { id: true },
    });
    // At most MAX_CALL_SIZE - 1 people, by the request schema.
    for (const recipientId of ids) {
      await notify(tx, { recipientId, actorId: starterId, kind: "call_invite", callId: call.id });
    }
    return { ok: true, value: call.id };
  });
}

/**
 * Invite more people into a call. The caller must be in it, and each person
 * must be the caller's own friend; they needn't know anyone else there
 * (Luke, October 3, 2026). Nobody in a block with anyone already in the call,
 * or already invited, may be added. Returns how many were newly invited.
 */
export async function inviteToCall(
  inviterId: string,
  callId: string,
  usernames: string[],
  now: Date,
): Promise<CallResult<number>> {
  const picked = await pickFriends(inviterId, usernames, "You can only invite your own friends.");
  if (!picked.ok) return picked;

  return prisma.$transaction(async (tx): Promise<CallResult<number>> => {
    await lockCall(tx, callId);
    const call = await tx.call.findUnique({ where: { id: callId }, select: { endedAt: true } });
    if (!call || call.endedAt) return refuse(404, CALL_ENDED);

    const members = await tx.callInvite.findMany({
      where: { callId, OR: [presentWhere(now), openInviteWhere(now)] },
      select: { userId: true, status: true },
      take: MAX_CALL_SIZE * 2,
    });
    if (!members.some((m) => m.userId === inviterId && m.status === "joined")) {
      return refuse(403, "Join the call to invite people.");
    }
    const inCall = members.map((m) => m.userId);
    const fresh = picked.value.filter((id) => !inCall.includes(id));
    if (fresh.length === 0) {
      return refuse(409, "Everyone you picked is already in this call or invited.");
    }
    if (inCall.length + fresh.length > MAX_CALL_SIZE) {
      return refuse(409, `A call holds up to ${MAX_CALL_SIZE} people.`);
    }
    const blocked = await tx.block.findFirst({
      where: {
        OR: [
          { blockerId: { in: fresh }, blockedId: { in: inCall } },
          { blockedId: { in: fresh }, blockerId: { in: inCall } },
        ],
      },
      select: { id: true },
    });
    if (blocked) return refuse(409, "Someone you picked can't join this call.");

    // Bounded by MAX_CALL_SIZE, checked above.
    for (const userId of fresh) {
      const invite = {
        invitedById: inviterId,
        invitedAt: now,
        status: "pending",
        respondedAt: null,
      };
      await tx.callInvite.upsert({
        where: { callId_userId: { callId, userId } },
        create: { callId, userId, ...invite },
        update: invite,
      });
      await notify(tx, { recipientId: userId, actorId: inviterId, kind: "call_invite", callId });
    }
    return { ok: true, value: fresh.length };
  });
}

/**
 * Let a member into a call: an open invitation, or a place they had and left
 * (a reload, a locked phone) while the call goes on. Refuses a ghost, a
 * member present in another call, a full call, and anyone in a block with
 * someone present. Returns the member's display name for the token.
 */
export async function joinCall(
  userId: string,
  callId: string,
  now: Date,
): Promise<CallResult<{ displayName: string }>> {
  return prisma.$transaction(async (tx): Promise<CallResult<{ displayName: string }>> => {
    await lockUser(tx, userId);
    await lockCall(tx, callId);
    const invite = await tx.callInvite.findUnique({
      where: { callId_userId: { callId, userId } },
      select: { status: true, invitedAt: true, call: { select: { endedAt: true } } },
    });
    if (!invite) return refuse(404, "Call not found.");
    if (invite.call.endedAt) return refuse(409, CALL_ENDED);
    if (invite.status === "declined") {
      return refuse(409, "You turned this call down. Ask to be invited again.");
    }
    if (
      invite.status === "pending" &&
      invite.invitedAt.getTime() < now.getTime() - CALL_INVITE_TTL_MS
    ) {
      return refuse(409, "This invitation has expired.");
    }

    const me = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { ghost: true, displayName: true },
    });
    if (me.ghost) return refuse(403, GHOST_REFUSAL);
    const elsewhere = await presentCallId(tx, userId, now);
    if (elsewhere && elsewhere !== callId) return refuse(409, ALREADY_IN_CALL);

    // A call with nobody present, the caller included, ends here rather than
    // being revived. A caller who is present themselves (the starter's first
    // token, or anyone alone while others are invited) keeps it going.
    // LiveKit closes an empty room itself after its idle timeout.
    if (await settleCall(tx, callId, now)) return refuse(409, CALL_ENDED);
    const present = await tx.callInvite.findMany({
      where: { callId, ...presentWhere(now), userId: { not: userId } },
      select: { userId: true },
      take: MAX_CALL_SIZE,
    });
    if (present.length >= MAX_CALL_SIZE) return refuse(409, "This call is full.");
    const others = present.map((p) => p.userId);
    const blocked = await tx.block.findFirst({
      where: {
        OR: [
          { blockerId: userId, blockedId: { in: others } },
          { blockedId: userId, blockerId: { in: others } },
        ],
      },
      select: { id: true },
    });
    if (blocked) return refuse(403, "You can't join this call.");

    await tx.callInvite.update({
      where: { callId_userId: { callId, userId } },
      data: {
        status: "joined",
        seenAt: now,
        ...(invite.status === "pending" ? { respondedAt: now } : {}),
      },
    });
    return { ok: true, value: { displayName: me.displayName } };
  });
}

/** Turn down an open invitation. */
export async function declineCall(userId: string, callId: string, now: Date): Promise<boolean> {
  const declined = await prisma.callInvite.updateMany({
    where: { callId, userId, status: "pending" },
    data: { status: "declined", respondedAt: now },
  });
  return declined.count === 1;
}

/** Leave a call. The last one out ends it and closes its room. */
export async function leaveCall(userId: string, callId: string, now: Date): Promise<boolean> {
  const result = await prisma.$transaction(async (tx) => {
    await lockCall(tx, callId);
    const left = await tx.callInvite.updateMany({
      where: { callId, userId, status: "joined", call: { endedAt: null } },
      data: { status: "left" },
    });
    if (left.count === 0) return { left: false, ended: false };
    return { left: true, ended: await settleCall(tx, callId, now) };
  });
  if (result.ended) await bestEffort("close room", () => closeRoom(callId));
  return result.left;
}

/**
 * Take a member out of every call they're joined in, now: Ghost Mode turned
 * on, or the account being deleted. Their client may still hold a token, so
 * LiveKit is told to disconnect them too, after the commit.
 */
export async function leaveEveryCall(userId: string, now: Date): Promise<void> {
  const { callIds, ended } = await prisma.$transaction(async (tx) => {
    const rows = await tx.callInvite.findMany({
      where: { userId, status: "joined", call: { endedAt: null } },
      select: { callId: true },
      take: MAX_CALL_SIZE,
    });
    const ids = rows.map((r) => r.callId);
    await tx.callInvite.updateMany({
      where: { userId, callId: { in: ids }, status: "joined" },
      data: { status: "left" },
    });
    const endedNow: string[] = [];
    for (const callId of ids) {
      if (await settleCall(tx, callId, now)) endedNow.push(callId);
    }
    return { callIds: ids, ended: endedNow };
  });
  for (const callId of callIds) {
    await bestEffort("remove participant", () => removeFromRoom(callId, userId));
  }
  for (const callId of ended) await bestEffort("close room", () => closeRoom(callId));
}

/**
 * After a block between `a` and `b`: in any call holding both, the one who
 * joined later leaves it (and is disconnected), and an open invitation for
 * either of them is declined, so the two never share a call.
 */
export async function separateInCalls(a: string, b: string, now: Date): Promise<void> {
  const removed = await prisma.$transaction(async (tx) => {
    const rows = await tx.callInvite.findMany({
      where: {
        userId: { in: [a, b] },
        status: { in: ["joined", "pending"] },
        call: { endedAt: null },
      },
      select: { id: true, callId: true, userId: true, status: true, respondedAt: true },
      take: MAX_CALL_SIZE * 2,
    });
    const out: { callId: string; userId: string }[] = [];
    for (const row of rows) {
      const other = rows.find((r) => r.callId === row.callId && r.userId !== row.userId);
      if (!other) continue;
      if (row.status === "pending") {
        await tx.callInvite.update({
          where: { id: row.id },
          data: { status: "declined", respondedAt: now },
        });
      } else if (
        other.status === "joined" &&
        (row.respondedAt?.getTime() ?? 0) > (other.respondedAt?.getTime() ?? 0)
      ) {
        await tx.callInvite.update({ where: { id: row.id }, data: { status: "left" } });
        out.push({ callId: row.callId, userId: row.userId });
      }
    }
    return out;
  });
  for (const r of removed) {
    await bestEffort("remove participant", () => removeFromRoom(r.callId, r.userId));
  }
}

/**
 * Forget old calls, in steps. A call nobody is in after a day is ended. A
 * month after a call ends, who was in it goes (its invites, its call_invite
 * notifications, its starter), leaving the bare dates the weekly metrics
 * count; past what metrics show, the row goes too. Set-based deletes, run
 * when a call starts.
 */
export async function pruneCalls(now: Date): Promise<void> {
  const peopleBefore = new Date(now.getTime() - CALL_PEOPLE_RETENTION_DAYS * DAY_MS);
  await prisma.$transaction([
    prisma.call.updateMany({
      where: {
        endedAt: null,
        startedAt: { lt: new Date(now.getTime() - STUCK_CALL_MS) },
        invites: { none: presentWhere(now) },
      },
      data: { endedAt: now },
    }),
    prisma.notification.deleteMany({
      where: { kind: "call_invite", call: { endedAt: { lt: peopleBefore } } },
    }),
    prisma.callInvite.deleteMany({ where: { call: { endedAt: { lt: peopleBefore } } } }),
    prisma.call.updateMany({
      where: { endedAt: { lt: peopleBefore }, startedById: { not: null } },
      data: { startedById: null },
    }),
    prisma.call.deleteMany({
      where: {
        endedAt: { not: null },
        startedAt: { lt: new Date(now.getTime() - CALL_ROW_RETENTION_DAYS * DAY_MS) },
      },
    }),
  ]);
}

interface PersonRow {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
}

/** One of the viewer's call_invites rows, as currentCalls reads it. */
export interface MyCallRow {
  status: string;
  invitedAt: Date;
  invitedBy: { username: string; displayName: string } | null;
  call: {
    id: string;
    startedAt: Date;
    invites: { status: string; user: PersonRow }[];
  };
}

/** Shape the viewer's rows for the wire: the call they're in (joined
 * members first) and their open invitations, newest first. Pure. */
export function toCallsWire(rows: MyCallRow[], voiceEnabled: boolean): CallsCurrentResponse {
  let call: CurrentCall | null = null;
  const invitations: CallInvitation[] = [];
  for (const row of rows) {
    const members: CallMember[] = row.call.invites
      .map((i) => ({
        user_id: i.user.id,
        username: i.user.username,
        display_name: i.user.displayName,
        avatar_color: i.user.avatarColor,
        status: i.status === "joined" ? ("joined" as const) : ("pending" as const),
      }))
      .sort((x, y) => (x.status === y.status ? 0 : x.status === "joined" ? -1 : 1));
    if (row.status === "joined") {
      call ??= { id: row.call.id, started_at: row.call.startedAt.toISOString(), members };
      continue;
    }
    invitations.push({
      call_id: row.call.id,
      invited_by: row.invitedBy
        ? { username: row.invitedBy.username, display_name: row.invitedBy.displayName }
        : null,
      joined: members
        .filter((m) => m.status === "joined")
        .map((m) => ({ username: m.username, display_name: m.display_name })),
      expires_at: new Date(row.invitedAt.getTime() + CALL_INVITE_TTL_MS).toISOString(),
    });
  }
  return { voice_enabled: voiceEnabled, call, invitations };
}

/**
 * What GET /api/calls/current returns. With `heartbeat`, it is also the
 * viewer's heartbeat: a member present in a call stays present by asking.
 * Only the client actually connected to the call's audio sends it, so another
 * open tab, or a page reloaded after a drop, never keeps someone counted as in
 * a call they can't hear. One write, one read.
 */
export async function currentCalls(
  userId: string,
  now: Date,
  heartbeat: boolean,
): Promise<CallsCurrentResponse> {
  if (heartbeat) {
    await prisma.callInvite.updateMany({
      where: { userId, ...presentWhere(now), call: { endedAt: null } },
      data: { seenAt: now },
    });
  }
  const inCall: Prisma.CallInviteWhereInput = { OR: [presentWhere(now), openInviteWhere(now)] };
  const rows = await prisma.callInvite.findMany({
    where: {
      userId,
      ...inCall,
      // An invitation to a call nobody is in any more isn't worth answering.
      call: { endedAt: null, invites: { some: presentWhere(now) } },
    },
    select: {
      status: true,
      invitedAt: true,
      invitedBy: { select: { username: true, displayName: true } },
      call: {
        select: {
          id: true,
          startedAt: true,
          invites: {
            where: inCall,
            select: {
              status: true,
              user: { select: { id: true, username: true, displayName: true, avatarColor: true } },
            },
            orderBy: { invitedAt: "asc" },
            take: MAX_CALL_SIZE * 2,
          },
        },
      },
    },
    orderBy: { invitedAt: "desc" },
    // The open invitations, plus the one call the viewer may be in.
    take: INVITATIONS_SHOWN + 1,
  });
  return toCallsWire(rows, voiceConfigured());
}
