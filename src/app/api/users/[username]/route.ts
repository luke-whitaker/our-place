import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { findFriendshipBetween, friendshipStatusFor } from "@/lib/friends";

// GET: Another member's public profile — the header-card data everyone can
// see (name, avatar color, counts, member since) plus the viewer's friendship
// status. Posts are NOT here; they're friend-gated in ./posts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { username } = await params;

    const user = await prisma.user.findFirst({
      where: { username: { equals: username.toLowerCase(), mode: "insensitive" } },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatarColor: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: "This person doesn't exist." }, { status: 404 });
    }

    const [myPlacePostCount, communityCount, friendshipRow] = await Promise.all([
      prisma.post.count({
        where: { authorId: user.id, OR: [{ communityId: null }, { postedToProfile: true }] },
      }),
      prisma.communityMember.count({ where: { userId: user.id } }),
      findFriendshipBetween(auth.user.userId, user.id),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        avatar_color: user.avatarColor,
        created_at: user.createdAt.toISOString(),
        my_place_post_count: myPlacePostCount,
        community_count: communityCount,
      },
      friendship: {
        status: friendshipStatusFor(auth.user.userId, user.id, friendshipRow),
        id: friendshipRow?.id ?? null,
      },
    });
  } catch (error) {
    console.error("Public profile error:", error);
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}
