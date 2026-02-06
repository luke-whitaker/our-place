import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { User } from '@/lib/types';

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ user: null });
    }

    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, display_name, email, phone, bio, avatar_color, is_verified, created_at FROM users WHERE id = ?'
    ).get(auth.userId) as Omit<User, 'password_hash'> | undefined;

    if (!user) {
      return NextResponse.json({ user: null });
    }

    // Get community count
    const communityCount = db.prepare(
      'SELECT COUNT(*) as count FROM community_members WHERE user_id = ?'
    ).get(auth.userId) as { count: number };

    return NextResponse.json({ user: { ...user, community_count: communityCount.count } });
  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({ user: null });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ message: 'Logged out.' });
  response.cookies.set('auth_token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
  return response;
}
