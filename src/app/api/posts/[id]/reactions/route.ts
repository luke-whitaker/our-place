import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in to react.' }, { status: 401 });
    }

    const { type } = await request.json();
    const reactionType = type || 'like';
    const db = getDb();

    // Check if reaction already exists
    const existing = db.prepare(
      'SELECT id, type FROM reactions WHERE post_id = ? AND user_id = ?'
    ).get(id, auth.userId) as { id: string; type: string } | undefined;

    if (existing) {
      // Remove reaction (toggle off)
      db.prepare('DELETE FROM reactions WHERE id = ?').run(existing.id);
      db.prepare('UPDATE posts SET reaction_count = MAX(0, reaction_count - 1) WHERE id = ?').run(id);
      return NextResponse.json({ message: 'Reaction removed.', reacted: false });
    } else {
      // Add reaction
      db.prepare('INSERT INTO reactions (id, post_id, user_id, type) VALUES (?, ?, ?, ?)').run(uuidv4(), id, auth.userId, reactionType);
      db.prepare('UPDATE posts SET reaction_count = reaction_count + 1 WHERE id = ?').run(id);
      return NextResponse.json({ message: 'Reaction added!', reacted: true, type: reactionType });
    }
  } catch (error) {
    console.error('Reaction error:', error);
    return NextResponse.json({ error: 'Failed to react.' }, { status: 500 });
  }
}
