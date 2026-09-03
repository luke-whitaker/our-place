import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { areFriends } from "@/lib/friends";
import { enrichPostsWithMedia, mapPostRow } from "@/lib/post-helpers";
import { parsePagination, paginateResults } from "@/lib/pagination";

// GET: Someone's My Place posts. Friend-gated on the server: only the owner
// and their accepted friends get posts back — hiding the UI isn't enough.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { username } = await params;

    const owner = await prisma.user.findFirst({
      where: { username: { equals: username.toLowerCase(), mode: "insensitive" } },
      select: { id: true },
    });
    if (!owner) {
      return NextResponse.json({ error: "This person doesn't exist." }, { status: 404 });
    }

    if (!(await areFriends(auth.user.userId, owner.id))) {
      return NextResponse.json({ error: "Only friends can see My Place posts." }, { status: 403 });
    }

    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    const posts = await prisma.post.findMany({
      where: {
        authorId: owner.id,
        OR: [{ communityId: null }, { postedToProfile: true }],
      },
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
    console.error("User posts error:", error);
    return NextResponse.json({ error: "Failed to load posts." }, { status: 500 });
  }
}
