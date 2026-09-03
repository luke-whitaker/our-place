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

    // Every post on the platform, newest first — transparent and unranked,
    // same ordering promise as the friends and communities feeds.
    const posts = await prisma.post.findMany({
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
    console.error("Explore feed error:", error);
    return NextResponse.json({ error: "Failed to load explore feed." }, { status: 500 });
  }
}
