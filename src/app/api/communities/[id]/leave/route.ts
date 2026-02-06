import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in.' }, { status: 401 });
    }

    const db = getDb();
    const community = db.prepare('SELECT * FROM communities WHERE id = ? OR slug = ?').get(id, id) as { id: string; creator_id: string } | undefined;

    if (!community) {
      return NextResponse.json({ error: 'Community not found.' }, { status: 404 });
    }

    if (community.creator_id === auth.userId) {
      return NextResponse.json({ error: 'Community creators cannot leave their own community.' }, { status: 403 });
    }

    const result = db.prepare(
      'DELETE FROM community_members WHERE user_id = ? AND community_id = ?'
    ).run(auth.userId, community.id);

    if (result.changes > 0) {
      db.prepare('UPDATE communities SET member_count = MAX(0, member_count - 1) WHERE id = ?').run(community.id);
    }

    return NextResponse.json({ message: 'You have left the community.' });
  } catch (error) {
    console.error('Leave community error:', error);
    return NextResponse.json({ error: 'Failed to leave community.' }, { status: 500 });
  }
}
