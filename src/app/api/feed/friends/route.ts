import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const db = getDb();

    // Get posts from accepted friends (both directions of the friendship)
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
      JOIN communities c ON p.community_id = c.id
      WHERE p.author_id IN (
        SELECT friend_id FROM friendships WHERE user_id = ? AND status = 'accepted'
        UNION
        SELECT user_id FROM friendships WHERE friend_id = ? AND status = 'accepted'
      )
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all(auth.userId, auth.userId, auth.userId);

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Friends feed error:', error);
    return NextResponse.json({ error: 'Failed to load friends feed.' }, { status: 500 });
  }
}
