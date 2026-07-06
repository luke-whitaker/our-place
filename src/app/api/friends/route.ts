import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { findFriendshipBetween } from "@/lib/friends";
import { friendRequestLimiter } from "@/lib/rate-limit";
import { sendFriendRequestSchema, getZodErrorMessage } from "@/lib/schemas";
import type { FriendEntry } from "@/lib/types";

const userSummarySelect = {
  id: true,
  username: true,
  displayName: true,
  avatarColor: true,
} as const;

interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarColor: string;
}

function toFriendEntry(row: { id: string; createdAt: Date }, other: UserSummary): FriendEntry {
  return {
    friendship_id: row.id,
    user_id: other.id,
    username: other.username,
    display_name: other.displayName,
    avatar_color: other.avatarColor,
    created_at: row.createdAt.toISOString(),
  };
}

// GET: The current user's friendships, split by state:
// accepted friends, incoming pending requests, outgoing pending requests.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const rows = await prisma.friendship.findMany({
      where: { OR: [{ userId: me }, { friendId: me }] },
      include: { user: { select: userSummarySelect }, friend: { select: userSummarySelect } },
      orderBy: { createdAt: "desc" },
    });

    const friends: FriendEntry[] = [];
    const incoming: FriendEntry[] = [];
    const outgoing: FriendEntry[] = [];

    for (const row of rows) {
      const other = row.userId === me ? row.friend : row.user;
      if (row.status === "accepted") {
        friends.push(toFriendEntry(row, other));
      } else if (row.friendId === me) {
        incoming.push(toFriendEntry(row, other));
      } else {
        outgoing.push(toFriendEntry(row, other));
      }
    }

    return NextResponse.json({ friends, incoming, outgoing });
  } catch (error) {
    console.error("List friends error:", error);
    return NextResponse.json({ error: "Failed to load friends." }, { status: 500 });
  }
}

// POST: Send a friend request by username. If the other person already has a
// pending request to you, this accepts it instead — you both said yes.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = friendRequestLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many friend requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = sendFriendRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: { username: { equals: parsed.data.username.toLowerCase(), mode: "insensitive" } },
      select: { id: true, displayName: true },
    });
    if (!target) {
      return NextResponse.json({ error: "That person doesn't exist." }, { status: 404 });
    }
    if (target.id === me) {
      return NextResponse.json(
        { error: "You can't send yourself a friend request." },
        { status: 400 },
      );
    }

    const existing = await findFriendshipBetween(me, target.id);
    if (existing) {
      if (existing.status === "accepted") {
        return NextResponse.json(
          { error: `You're already friends with ${target.displayName}.` },
          { status: 409 },
        );
      }
      if (existing.userId === me) {
        return NextResponse.json(
          { error: "You've already sent them a friend request." },
          { status: 409 },
        );
      }
      // They asked first — a request back means both sides said yes.
      await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: "accepted" },
      });
      return NextResponse.json({
        message: `You're now friends with ${target.displayName}!`,
        status: "friends",
        friendship_id: existing.id,
      });
    }

    const created = await prisma.friendship.create({
      data: { userId: me, friendId: target.id },
    });

    return NextResponse.json(
      {
        message: `Friend request sent to ${target.displayName}!`,
        status: "pending_outgoing",
        friendship_id: created.id,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Send friend request error:", error);
    return NextResponse.json({ error: "Failed to send friend request." }, { status: 500 });
  }
}
