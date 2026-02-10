import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();

    const comments = db.prepare(`
      SELECT c.*, u.display_name as author_name, u.username as author_username, u.avatar_color as author_avatar_color
      FROM comments c
      JOIN users u ON c.author_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).all(id);

    return NextResponse.json({ comments });
  } catch (error) {
    console.error('Comments error:', error);
    return NextResponse.json({ error: 'Failed to load comments.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in to comment.' }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: 'Please verify your account first.' }, { status: 403 });
    }

    const { content } = await request.json();
    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: 'Comment cannot be empty.' }, { status: 400 });
    }
    if (content.trim().length > 5000) {
      return NextResponse.json({ error: 'Comment must be under 5,000 characters.' }, { status: 400 });
    }

    const db = getDb();

    // Verify post exists
    const post = db.prepare('SELECT id, community_id, author_id FROM posts WHERE id = ?').get(id) as { id: string; community_id: string | null; author_id: string } | undefined;
    if (!post) {
      return NextResponse.json({ error: 'Post not found.' }, { status: 404 });
    }

    // Check authorization: community posts require membership, profile posts are open
    if (post.community_id) {
      const membership = db.prepare(
        'SELECT id FROM community_members WHERE user_id = ? AND community_id = ?'
      ).get(auth.userId, post.community_id);
      if (!membership) {
        return NextResponse.json({ error: 'You must be a community member to comment.' }, { status: 403 });
      }
    }

    const commentId = uuidv4();
    db.prepare('INSERT INTO comments (id, post_id, author_id, content) VALUES (?, ?, ?, ?)').run(commentId, id, auth.userId, content.trim());
    db.prepare('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?').run(id);

    return NextResponse.json({ message: 'Comment added!', commentId }, { status: 201 });
  } catch (error) {
    console.error('Create comment error:', error);
    return NextResponse.json({ error: 'Failed to add comment.' }, { status: 500 });
  }
}
