import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { enrichPostsWithMedia } from "@/lib/post-helpers";
import { parsePagination, paginateResults } from "@/lib/pagination";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in to view your feed." }, { status: 401 });
    }

    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    // Get community IDs the user is a member of
    const memberships = await prisma.communityMember.findMany({
      where: { userId: auth.userId },
      select: { communityId: true },
    });
    const communityIds = memberships.map((m) => m.communityId);

    // Get posts from those communities
    const posts = await prisma.post.findMany({
      where: {
        communityId: { in: communityIds },
      },
      include: {
        author: { select: { displayName: true, username: true, avatarColor: true } },
        community: { select: { name: true, slug: true, icon: true } },
        reactions: { where: { userId: auth.userId }, select: { type: true } },
      },
      orderBy: { createdAt: "desc" },
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
    console.error("Feed error:", error);
    return NextResponse.json({ error: "Failed to load feed." }, { status: 500 });
  }
}
