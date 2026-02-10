import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { enrichPostsWithMedia } from '@/lib/post-helpers';
import { Post } from '@/lib/types';

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const db = getDb();

    // Platform-wide posts from all communities, ordered by recency and engagement
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
      ORDER BY p.reaction_count DESC, p.comment_count DESC, p.created_at DESC
      LIMIT 100
    `).all(auth.userId) as Post[];

    const enrichedPosts = enrichPostsWithMedia(db, posts);

    return NextResponse.json({ posts: enrichedPosts });
  } catch (error) {
    console.error('Explore feed error:', error);
    return NextResponse.json({ error: 'Failed to load explore feed.' }, { status: 500 });
  }
}
