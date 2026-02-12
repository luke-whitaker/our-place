import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { createPostLimiter } from '@/lib/rate-limit';
import { createMyPlacePostSchema, getZodErrorMessage } from '@/lib/schemas';
import { enrichPostsWithMedia } from '@/lib/post-helpers';
import { Post, PostType } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

const VALID_POST_TYPES: PostType[] = ['text', 'photo', 'video', 'rich'];

// GET: List the current user's "My Place" posts
// Includes profile-only posts (community_id IS NULL) and cross-posted community posts
export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const db = getDb();

    const posts = db.prepare(`
      SELECT p.*,
        u.display_name as author_name,
        u.username as author_username,
        u.avatar_color as author_avatar_color,
        c.name as community_name,
        c.slug as community_slug,
        c.icon as community_icon,
        (SELECT type FROM reactions WHERE post_id = p.id AND user_id = ?) as user_reaction
      FROM posts p
      JOIN users u ON p.author_id = u.id
      LEFT JOIN communities c ON p.community_id = c.id
      WHERE p.author_id = ?
        AND (p.community_id IS NULL OR p.posted_to_profile = 1)
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all(auth.userId, auth.userId) as Post[];

    const enrichedPosts = enrichPostsWithMedia(db, posts);

    return NextResponse.json({ posts: enrichedPosts });
  } catch (error) {
    console.error('My Place posts error:', error);
    return NextResponse.json({ error: 'Failed to load posts.' }, { status: 500 });
  }
}

// POST: Create a profile-only post (no community)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in to post.' }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: 'Please verify your account before posting.' }, { status: 403 });
    }

    const limit = createPostLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many posts created. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const db = getDb();
    const body = await request.json();
    const parsed = createMyPlacePostSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const postType = parsed.data.post_type;
    const title = parsed.data.title.trim();
    const content = parsed.data.content.trim();
    const media = parsed.data.media;

    // Type-specific validation (same as community posts)
    if (postType === 'text') {
      if (!title) {
        return NextResponse.json({ error: 'Title is required for text posts.' }, { status: 400 });
      }
      if (!content) {
        return NextResponse.json({ error: 'Content is required for text posts.' }, { status: 400 });
      }
    }

    if (postType === 'photo') {
      if (!media.length) {
        return NextResponse.json({ error: 'At least one image is required for photo posts.' }, { status: 400 });
      }
      if (media.length > 10) {
        return NextResponse.json({ error: 'Maximum 10 images per post.' }, { status: 400 });
      }
    }

    if (postType === 'video') {
      if (!media.length) {
        return NextResponse.json({ error: 'A video is required for video posts.' }, { status: 400 });
      }
      if (media.length > 1) {
        return NextResponse.json({ error: 'Only one video per post.' }, { status: 400 });
      }
    }

    if (postType === 'rich') {
      if (!title) {
        return NextResponse.json({ error: 'Title is required for rich posts.' }, { status: 400 });
      }
      if (!content) {
        return NextResponse.json({ error: 'Content is required for rich posts.' }, { status: 400 });
      }
      try {
        const blocks = JSON.parse(content);
        if (!Array.isArray(blocks) || blocks.length === 0) {
          return NextResponse.json({ error: 'Rich content must have at least one block.' }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid rich content format.' }, { status: 400 });
      }
    }

    const postId = uuidv4();

    // Insert profile-only post (community_id = NULL, posted_to_profile = 1)
    db.prepare(`
      INSERT INTO posts (id, author_id, community_id, post_type, posted_to_profile, title, content)
      VALUES (?, ?, NULL, ?, 1, ?, ?)
    `).run(postId, auth.userId, postType, title, content);

    // Insert media attachments
    if ((postType === 'photo' || postType === 'video') && media.length > 0) {
      const insertMedia = db.prepare(`
        INSERT INTO post_media (id, post_id, media_type, media_source, url, filename, file_size, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (let i = 0; i < media.length; i++) {
        const m = media[i];
        insertMedia.run(
          uuidv4(),
          postId,
          m.media_type || (postType === 'photo' ? 'image' : 'video'),
          m.media_source || 'upload',
          m.url,
          m.filename || null,
          m.file_size || null,
          i
        );
      }
    }

    return NextResponse.json({ message: 'Posted to My Place!', postId }, { status: 201 });
  } catch (error) {
    console.error('My Place create post error:', error);
    return NextResponse.json({ error: 'Failed to create post.' }, { status: 500 });
  }
}
