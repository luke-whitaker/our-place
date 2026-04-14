import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { createCommentLimiter } from "@/lib/rate-limit";
import { createCommentSchema, getZodErrorMessage } from "@/lib/schemas";
import { parsePagination, paginateResults } from "@/lib/pagination";
import { v4 as uuidv4 } from "uuid";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    const comments = await prisma.comment.findMany({
      where: { postId: id },
      include: {
        author: { select: { displayName: true, username: true, avatarColor: true } },
      },
      orderBy: { createdAt: "asc" },
      take: limit + 1,
      skip: offset,
    });

    const mapped = comments.map((c) => ({
      id: c.id,
      post_id: c.postId,
      author_id: c.authorId,
      content: c.content,
      created_at: c.createdAt.toISOString(),
      author_name: c.author.displayName,
      author_username: c.author.username,
      author_avatar_color: c.author.avatarColor,
    }));

    const { data, hasMore } = paginateResults(mapped, limit, page);

    return NextResponse.json({ comments: data, hasMore, page });
  } catch (error) {
    console.error("Comments error:", error);
    return NextResponse.json({ error: "Failed to load comments." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in to comment." }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: "Please verify your account first." }, { status: 403 });
    }

    const rateLimit = createCommentLimiter.check(auth.userId);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many comments. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(rateLimit.retryAfterMs / 1000)) },
        },
      );
    }

    const body = await request.json();
    const parsed = createCommentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { content } = parsed.data;

    // Verify post exists
    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, communityId: true, authorId: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    // Check authorization: community posts require membership, profile posts are open
    if (post.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: auth.userId, communityId: post.communityId } },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "You must be a community member to comment." },
          { status: 403 },
        );
      }
    }

    const commentId = uuidv4();
    await prisma.comment.create({
      data: { id: commentId, postId: id, authorId: auth.userId, content: content.trim() },
    });
    await prisma.post.update({
      where: { id },
      data: { commentCount: { increment: 1 } },
    });

    return NextResponse.json({ message: "Comment added!", commentId }, { status: 201 });
  } catch (error) {
    console.error("Create comment error:", error);
    return NextResponse.json({ error: "Failed to add comment." }, { status: 500 });
  }
}
