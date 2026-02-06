import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

// GET: List posts in a community
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    const db = getDb();

    const community = db.prepare('SELECT id FROM communities WHERE id = ? OR slug = ?').get(id, id) as { id: string } | undefined;
    if (!community) {
      return NextResponse.json({ error: 'Community not found.' }, { status: 404 });
    }

    const posts = db.prepare(`
      SELECT p.*, 
        u.display_name as author_name, 
        u.username as author_username,
        u.avatar_color as author_avatar_color,
        c.name as community_name,
        c.slug as community_slug,
        c.icon as community_icon
        ${auth ? ", (SELECT type FROM reactions WHERE post_id = p.id AND user_id = ?) as user_reaction" : ""}
      FROM posts p
      JOIN users u ON p.author_id = u.id
      JOIN communities c ON p.community_id = c.id
      WHERE p.community_id = ?
      ORDER BY p.created_at DESC
      LIMIT 50
    `).all(...(auth ? [auth.userId, community.id] : [community.id]));

    return NextResponse.json({ posts });
  } catch (error) {
    console.error('Community posts error:', error);
    return NextResponse.json({ error: 'Failed to load posts.' }, { status: 500 });
  }
}

// POST: Create a new post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in to post.' }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: 'Please verify your account before posting.' }, { status: 403 });
    }

    const db = getDb();
    const community = db.prepare('SELECT id FROM communities WHERE id = ? OR slug = ?').get(id, id) as { id: string } | undefined;
    if (!community) {
      return NextResponse.json({ error: 'Community not found.' }, { status: 404 });
    }

    // Check if user is a member
    const membership = db.prepare(
      'SELECT id FROM community_members WHERE user_id = ? AND community_id = ?'
    ).get(auth.userId, community.id);
    if (!membership) {
      return NextResponse.json({ error: 'You must join this community before posting.' }, { status: 403 });
    }

    const { title, content } = await request.json();
    if (!title || !content) {
      return NextResponse.json({ error: 'Title and content are required.' }, { status: 400 });
    }

    if (title.length > 200) {
      return NextResponse.json({ error: 'Title must be under 200 characters.' }, { status: 400 });
    }

    const postId = uuidv4();
    db.prepare(`
      INSERT INTO posts (id, author_id, community_id, title, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(postId, auth.userId, community.id, title, content);

    return NextResponse.json({ message: 'Post created!', postId }, { status: 201 });
  } catch (error) {
    console.error('Create post error:', error);
    return NextResponse.json({ error: 'Failed to create post.' }, { status: 500 });
  }
}
