import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { enrichPostsWithMedia, mapPostRow } from "@/lib/post-helpers";
import { parsePagination, paginateResults } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    // Get accepted friend IDs (both directions)
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "accepted",
        OR: [{ userId: auth.user.userId }, { friendId: auth.user.userId }],
      },
      select: { userId: true, friendId: true },
    });

    const friendIds = friendships.map((f) =>
      f.userId === auth.user.userId ? f.friendId : f.userId,
    );

    // Get posts from friends
    const posts = await prisma.post.findMany({
      where: { authorId: { in: friendIds } },
      include: {
        author: { select: { displayName: true, username: true, avatarColor: true } },
        community: { select: { name: true, slug: true, icon: true } },
        reactions: { where: { userId: auth.user.userId }, select: { type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      skip: offset,
    });

    const mapped = posts.map((p) =>
      mapPostRow(p, p.reactions.length > 0 ? p.reactions[0].type : null),
    );

    const { data, hasMore } = paginateResults(mapped, limit, page);
    const enrichedPosts = await enrichPostsWithMedia(data);

    return NextResponse.json({ posts: enrichedPosts, hasMore, page });
  } catch (error) {
    console.error("Friends feed error:", error);
    return NextResponse.json({ error: "Failed to load friends feed." }, { status: 500 });
  }
}
