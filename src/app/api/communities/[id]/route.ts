import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { Community, CommunityMember } from '@/lib/types';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    const db = getDb();

    // Find community by slug or id
    const community = db.prepare(
      'SELECT * FROM communities WHERE slug = ? OR id = ?'
    ).get(id, id) as Community | undefined;

    if (!community) {
      return NextResponse.json({ error: 'Community not found.' }, { status: 404 });
    }

    // Check membership
    let membership = null;
    if (auth) {
      membership = db.prepare(
        'SELECT * FROM community_members WHERE user_id = ? AND community_id = ?'
      ).get(auth.userId, community.id) as CommunityMember | undefined;
    }

    // Get members list (first 20)
    const members = db.prepare(`
      SELECT cm.*, u.display_name, u.username, u.avatar_color
      FROM community_members cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.community_id = ?
      ORDER BY cm.joined_at ASC
      LIMIT 20
    `).all(community.id);

    return NextResponse.json({
      community,
      membership: membership || null,
      members,
    });
  } catch (error) {
    console.error('Community detail error:', error);
    return NextResponse.json({ error: 'Failed to load community.' }, { status: 500 });
  }
}
