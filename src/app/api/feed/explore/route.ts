import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { enrichPostsWithMedia } from "@/lib/post-helpers";
import { parsePagination, paginateResults } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    // Platform-wide posts from all communities, ordered by engagement then recency
    const posts = await prisma.post.findMany({
      include: {
        author: { select: { displayName: true, username: true, avatarColor: true } },
        community: { select: { name: true, slug: true, icon: true } },
        reactions: { where: { userId: auth.userId }, select: { type: true } },
      },
      orderBy: [{ reactionCount: "desc" }, { commentCount: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
      skip: offset,
    });

    const mapped = posts.map((p) => ({
      id: p.id,
      author_id: p.authorId,
      community_id: p.communityId,
      post_type: p.postType,
      posted_to_profile: p.postedToProfile ? 1 : 0,
      title: p.title,
      content: p.content,
      comment_count: p.commentCount,
      reaction_count: p.reactionCount,
      created_at: p.createdAt.toISOString(),
      updated_at: p.updatedAt.toISOString(),
      author_name: p.author.displayName,
      author_username: p.author.username,
      author_avatar_color: p.author.avatarColor,
      community_name: p.community?.name ?? null,
      community_slug: p.community?.slug ?? null,
      community_icon: p.community?.icon ?? null,
      user_reaction: p.reactions.length > 0 ? p.reactions[0].type : null,
    }));

    const { data, hasMore } = paginateResults(mapped, limit, page);
    const enrichedPosts = await enrichPostsWithMedia(data);

    return NextResponse.json({ posts: enrichedPosts, hasMore, page });
  } catch (error) {
    console.error("Explore feed error:", error);
    return NextResponse.json({ error: "Failed to load explore feed." }, { status: 500 });
  }
}
