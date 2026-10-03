// Gatherings: who may see one, what its invitation letter says, and writing
// every invitation (row, letter, notification) in one go. The routes under
// /api/gatherings use these so the access rule lives in exactly one place.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import { MAILBOX_SLOTS } from "@/lib/items";
import { METRICS_TIME_ZONE } from "@/lib/activity";
import { cancelUnplanted } from "@/lib/gathering-sweep";
import { mushroomPortal } from "@/lib/event-mushrooms";
import { isBlockedEitherWay } from "@/lib/blocks";
import type { GatheringAnswer, GatheringEntry, GatheringKind } from "@/lib/types";

export { MAX_COMMUNITY_INVITEES } from "@/lib/types";
/** The longest a gathering may run. */
export const MAX_GATHERING_MS = 7 * 24 * 60 * 60 * 1000;
/** How far ahead a gathering may be planned. */
export const MAX_LEAD_MS = 366 * 24 * 60 * 60 * 1000;
/** A start this recent still counts as "now", so a form filled in for the
 * current minute isn't refused by the seconds it took to submit. */
export const START_GRACE_MS = 5 * 60 * 1000;
/** How many gatherings an Upcoming list shows. */
export const UPCOMING_SHOWN = 10;
/** The widest range one calendar request may ask for (a six-week month grid). */
export const CALENDAR_MAX_DAYS = 45;

/** Letters say the time in Chicago, where the members are; the pages show
 * each viewer's own time zone. */
const LETTER_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: METRICS_TIME_ZONE,
  weekday: "long",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

/**
 * The invitation letter's words. Deliberately without the address: a letter
 * can be taken out of the mailbox and given to someone who wasn't invited.
 */
export function invitationLetterBody(title: string, startsAt: Date): string {
  return `You're invited to ${title}, ${LETTER_TIME.format(startsAt)}. Open the invitation to answer.`;
}

/** Why these times can't be used, or null when they're fine. */
export function timesProblem(startsAt: Date, endsAt: Date, now: Date): string | null {
  if (startsAt.getTime() < now.getTime() - START_GRACE_MS) return "That start time has passed.";
  if (startsAt.getTime() > now.getTime() + MAX_LEAD_MS) {
    return "Gatherings can be planned up to a year ahead.";
  }
  if (endsAt.getTime() <= startsAt.getTime()) return "The end has to come after the start.";
  if (endsAt.getTime() - startsAt.getTime() > MAX_GATHERING_MS) {
    return "A gathering can last up to 7 days.";
  }
  return null;
}

/** The columns every calendar entry and access check reads. */
export const ENTRY_SELECT = {
  id: true,
  title: true,
  kind: true,
  startsAt: true,
  endsAt: true,
  status: true,
  hostId: true,
  communityId: true,
  mushroomWorld: true,
  plantedAt: true,
  host: { select: { username: true, displayName: true } },
  community: { select: { slug: true, name: true } },
} as const;

export type EntryRow = Prisma.GatheringGetPayload<{ select: typeof ENTRY_SELECT }>;

/** The portal into a world gathering, while its mushroom is planted and the
 * gathering hasn't ended or been cancelled. Only ever handed to someone who
 * can see the gathering, since every caller has already checked that. */
function portalOf(row: EntryRow, now: Date): string | null {
  const standing =
    row.status === "scheduled" && row.plantedAt !== null && row.endsAt.getTime() > now.getTime();
  if (!standing || !row.mushroomWorld) return null;
  const home = { host: { id: row.hostId, username: row.host.username }, community: row.community };
  return mushroomPortal(row.id, row.mushroomWorld, home);
}

export function toGatheringEntry(row: EntryRow, myResponse: string | null): GatheringEntry {
  return {
    id: row.id,
    title: row.title,
    kind: row.kind as GatheringKind,
    starts_at: row.startsAt.toISOString(),
    ends_at: row.endsAt.toISOString(),
    host: { username: row.host.username, display_name: row.host.displayName },
    community: row.community ? { slug: row.community.slug, name: row.community.name } : null,
    my_response: (myResponse as GatheringAnswer | null) ?? null,
    portal: portalOf(row, new Date()),
  };
}

export interface GatheringAccess {
  gathering: EntryRow;
  isHost: boolean;
  /** The viewer's own invite row, if they have one. */
  invite: { status: string } | null;
}

/**
 * The one access rule: you can see a gathering if you host it, were invited
 * to it, or (for a community gathering) are a member of that community now,
 * and you and the host aren't in a block. Returns null for everyone else, and
 * routes answer that with 404 so a gathering's existence never leaks.
 */
export async function gatheringAccess(
  gatheringId: string,
  userId: string,
): Promise<GatheringAccess | null> {
  // Settle any world gathering that started unplanted before reading, so a
  // page never shows one as scheduled between two background sweeps.
  await cancelUnplanted();
  const gathering = await prisma.gathering.findUnique({
    where: { id: gatheringId },
    select: ENTRY_SELECT,
  });
  if (!gathering) return null;
  const invite = await prisma.gatheringInvite.findUnique({
    where: { gatheringId_userId: { gatheringId, userId } },
    select: { status: true },
  });
  const isHost = gathering.hostId === userId;
  if (!isHost && (await isBlockedEitherWay(userId, gathering.hostId))) return null;
  if (isHost || invite) return { gathering, isHost, invite };
  if (!gathering.communityId) return null;
  const member = await prisma.communityMember.findUnique({
    where: { userId_communityId: { userId, communityId: gathering.communityId } },
    select: { id: true },
  });
  return member ? { gathering, isHost, invite: null } : null;
}

/** The lowest free mailbox slot per member, from one read of everyone's
 * mailboxes. A member whose mailbox is full is left out. */
async function freeMailboxSlots(
  tx: Prisma.TransactionClient,
  memberIds: string[],
): Promise<Map<string, number>> {
  const occupied = await tx.item.findMany({
    where: { ownerId: { in: memberIds }, location: "mailbox" },
    select: { ownerId: true, slot: true },
  });
  const taken = new Map<string, Set<number | null>>();
  for (const item of occupied) {
    taken.set(item.ownerId, (taken.get(item.ownerId) ?? new Set()).add(item.slot));
  }
  const free = new Map<string, number>();
  for (const id of memberIds) {
    const used = taken.get(id);
    for (let slot = 0; slot < MAILBOX_SLOTS; slot++) {
      if (!used?.has(slot)) {
        free.set(id, slot);
        break;
      }
    }
  }
  return free;
}

/**
 * Invite everyone in `inviteeIds` (the host excluded): a pending invite row,
 * a letter from the host in their mailbox, and a notification. Batched with
 * createMany rather than notify() per person, because a community gathering
 * can invite hundreds at once; the host is never among the recipients, which
 * is the only thing notify() would otherwise check. A full mailbox skips the
 * letter, never the invitation or the notification. Returns who was invited,
 * for the emails sent after the commit.
 */
export async function inviteMembers(
  tx: Prisma.TransactionClient,
  gathering: { id: string; hostId: string; title: string; startsAt: Date },
  inviteeIds: string[],
): Promise<string[]> {
  const ids = [...new Set(inviteeIds)].filter((id) => id !== gathering.hostId);
  if (ids.length === 0) return ids;
  await tx.gatheringInvite.createMany({
    data: ids.map((userId) => ({ gatheringId: gathering.id, userId })),
  });
  const slots = await freeMailboxSlots(tx, ids);
  const body = invitationLetterBody(gathering.title, gathering.startsAt);
  const placedAt = new Date();
  await tx.item.createMany({
    data: [...slots].map(([ownerId, slot]) => ({
      ownerId,
      kind: "note",
      location: "mailbox",
      slot,
      body,
      fromId: gathering.hostId,
      placedAt,
      gatheringId: gathering.id,
    })),
  });
  await tx.notification.createMany({
    data: ids.map((recipientId) => ({
      recipientId,
      actorId: gathering.hostId,
      kind: "gathering_invite",
      gatheringId: gathering.id,
    })),
  });
  return ids;
}

/**
 * Cancel a gathering inside the caller's transaction: mark it, take back an
 * Event Mushroom still in someone's mailbox or pockets (a planted one simply
 * stops showing, since it's no longer scheduled), and tell everyone who had
 * accepted. Guarded on the status, so two cancels can't both notify. Returns
 * whether this call was the one that cancelled it. Used by the host's cancel
 * route and by account deletion.
 */
export async function cancelGathering(
  tx: Prisma.TransactionClient,
  id: string,
  hostId: string,
): Promise<boolean> {
  const cancelled = await tx.gathering.updateMany({
    where: { id, status: "scheduled" },
    data: { status: "cancelled", cancelledAt: new Date() },
  });
  if (cancelled.count !== 1) return false;
  await tx.item.deleteMany({ where: { gatheringId: id, kind: "event_mushroom" } });
  const going = await tx.gatheringInvite.findMany({
    where: { gatheringId: id, status: "accepted", userId: { not: hostId } },
    select: { userId: true },
  });
  await tx.notification.createMany({
    data: going.map((g) => ({
      recipientId: g.userId,
      actorId: hostId,
      kind: "gathering_cancelled",
      gatheringId: id,
    })),
  });
  return true;
}
