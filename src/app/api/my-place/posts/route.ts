import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { createPostLimiter } from "@/lib/rate-limit";
import { createMyPlacePostSchema, getZodErrorMessage } from "@/lib/schemas";
import { enrichPostsWithMedia, validatePostContent } from "@/lib/post-helpers";
import { parsePagination, paginateResults } from "@/lib/pagination";
import { v4 as uuidv4 } from "uuid";

// GET: List the current user's "My Place" posts
// Includes profile-only posts (community_id IS NULL) and cross-posted community posts
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    const posts = await prisma.post.findMany({
      where: {
        authorId: auth.userId,
        OR: [{ communityId: null }, { postedToProfile: true }],
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
    console.error("My Place posts error:", error);
    return NextResponse.json({ error: "Failed to load posts." }, { status: 500 });
  }
}

// POST: Create a profile-only post (no community)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in to post." }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json(
        { error: "Please verify your account before posting." },
        { status: 403 },
      );
    }

    const limit = createPostLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many posts created. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = createMyPlacePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const postType = parsed.data.post_type;
    const title = parsed.data.title.trim();
    const content = parsed.data.content.trim();
    const media = parsed.data.media;

    const validation = validatePostContent(postType, title, content, media);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const postId = uuidv4();

    // Insert profile-only post (community_id = NULL, posted_to_profile = true)
    await prisma.post.create({
      data: {
        id: postId,
        authorId: auth.userId,
        communityId: null,
        postType,
        postedToProfile: true,
        title,
        content,
      },
    });

    // Insert media attachments
    if ((postType === "photo" || postType === "video") && media.length > 0) {
      await prisma.postMedia.createMany({
        data: media.map((m, i) => ({
          postId,
          mediaType: m.media_type || (postType === "photo" ? "image" : "video"),
          mediaSource: m.media_source || "upload",
          url: m.url,
          filename: m.filename || null,
          fileSize: m.file_size || null,
          sortOrder: i,
        })),
      });
    }

    return NextResponse.json({ message: "Posted to My Place!", postId }, { status: 201 });
  } catch (error) {
    console.error("My Place create post error:", error);
    return NextResponse.json({ error: "Failed to create post." }, { status: 500 });
  }
}
