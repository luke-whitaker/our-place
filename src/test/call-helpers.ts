// Shared setup for the voice call route tests: friendships, blocks, and calls
// written straight to the database, so each test states only what it checks.

import prisma from "@/lib/db";
import type { AuthPayload } from "@/lib/types";

export async function befriend(a: AuthPayload, b: AuthPayload): Promise<void> {
  await prisma.friendship.create({
    data: { userId: a.userId, friendId: b.userId, status: "accepted" },
  });
}

export async function block(blocker: AuthPayload, blocked: AuthPayload): Promise<void> {
  await prisma.block.create({ data: { blockerId: blocker.userId, blockedId: blocked.userId } });
}

interface Seat {
  user: AuthPayload;
  status: "joined" | "pending" | "left" | "declined";
  /** Defaults to now. */
  at?: Date;
}

/** A call with members in the given states. The first seat started it. A
 * joined seat was last seen, and a pending seat invited, at `at`. */
export async function seedCall(seats: Seat[], endedAt: Date | null = null): Promise<string> {
  const now = new Date();
  const call = await prisma.call.create({
    data: {
      startedById: seats[0].user.userId,
      endedAt,
      invites: {
        create: seats.map((s, i) => ({
          userId: s.user.userId,
          invitedById: i === 0 ? null : seats[0].user.userId,
          status: s.status,
          invitedAt: s.at ?? now,
          respondedAt: s.status === "pending" ? null : (s.at ?? now),
          seenAt: s.status === "joined" ? (s.at ?? now) : null,
        })),
      },
    },
    select: { id: true },
  });
  return call.id;
}

export async function seatStatus(callId: string, user: AuthPayload): Promise<string | null> {
  const row = await prisma.callInvite.findUnique({
    where: { callId_userId: { callId, userId: user.userId } },
    select: { status: true },
  });
  return row?.status ?? null;
}

/** A moment `minutes` ago. */
export function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}
