import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { islandAccess } from "@/lib/islands";
import type { FriendIsland } from "@/lib/types";

/** Friendships read per request. Far above any real friend list today; it keeps
 * the query bounded if one ever grows. */
const MAX_FRIENDSHIPS = 500;

const OTHER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  islandVisibility: true,
} as const;

// GET: the caller's friends whose islands they may visit, by name. Feeds the
// Friends menu at shrines and computers. It uses the same islandAccess rule
// as the island gate, so the menu never offers an island the gate would refuse.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const rows = await prisma.friendship.findMany({
      where: { status: "accepted", OR: [{ userId: me }, { friendId: me }] },
      select: { userId: true, user: { select: OTHER_SELECT }, friend: { select: OTHER_SELECT } },
      take: MAX_FRIENDSHIPS,
    });

    const islands: FriendIsland[] = rows
      .map((row) => (row.userId === me ? row.friend : row.user))
      .filter((friend) => islandAccess(me, friend, true) === "open")
      .map((friend) => ({ username: friend.username, display_name: friend.displayName }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));

    return NextResponse.json({ islands });
  } catch (error) {
    console.error("Friend islands error:", error);
    return NextResponse.json({ error: "Failed to load your friends' islands." }, { status: 500 });
  }
}
