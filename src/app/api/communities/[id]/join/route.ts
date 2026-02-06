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
      return NextResponse.json({ error: 'Please log in to join communities.' }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: 'Please verify your account first.' }, { status: 403 });
    }

    const db = getDb();
    const community = db.prepare('SELECT * FROM communities WHERE id = ? OR slug = ?').get(id, id) as { id: string } | undefined;

    if (!community) {
      return NextResponse.json({ error: 'Community not found.' }, { status: 404 });
    }

    // Check if already a member
    const existing = db.prepare(
      'SELECT id FROM community_members WHERE user_id = ? AND community_id = ?'
    ).get(auth.userId, community.id);

    if (existing) {
      return NextResponse.json({ error: 'You are already a member of this community.' }, { status: 409 });
    }

    db.prepare(
      'INSERT INTO community_members (id, user_id, community_id, role) VALUES (?, ?, ?, ?)'
    ).run(uuidv4(), auth.userId, community.id, 'member');

    db.prepare('UPDATE communities SET member_count = member_count + 1 WHERE id = ?').run(community.id);

    return NextResponse.json({ message: 'Welcome to the community!' }, { status: 201 });
  } catch (error) {
    console.error('Join community error:', error);
    return NextResponse.json({ error: 'Failed to join community.' }, { status: 500 });
  }
}
