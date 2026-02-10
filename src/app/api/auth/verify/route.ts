import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAuthUser, signToken } from '@/lib/auth';
import { User } from '@/lib/types';
import { verifyLimiter } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: 'Please log in first.' }, { status: 401 });
    }

    // Rate limiting per user ID to prevent brute-force on verification codes
    const limit = verifyLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'Verification code is required.' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare(
      'SELECT id, username, display_name, is_verified, verification_code, verification_expires_at FROM users WHERE id = ?'
    ).get(auth.userId) as Pick<User, 'id' | 'username' | 'display_name' | 'is_verified' | 'verification_code' | 'verification_expires_at'> | undefined;

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    if (user.is_verified) {
      return NextResponse.json({ message: 'Account is already verified.' });
    }

    if (user.verification_expires_at && new Date(user.verification_expires_at) < new Date()) {
      // Invalidate expired code
      db.prepare('UPDATE users SET verification_code = NULL, verification_expires_at = NULL WHERE id = ?').run(user.id);
      return NextResponse.json({ error: 'Verification code has expired. Please request a new one.' }, { status: 400 });
    }

    if (user.verification_code !== code) {
      // Track failed attempts — after 5 failed rate-limited attempts, invalidate the code
      // The rate limiter already blocks after 5 attempts per 15-min window,
      // but we also invalidate the code on the 5th failure to force a new one
      if (limit.remaining === 0) {
        db.prepare('UPDATE users SET verification_code = NULL, verification_expires_at = NULL WHERE id = ?').run(user.id);
        return NextResponse.json({ error: 'Too many failed attempts. Your code has been invalidated. Please request a new one.' }, { status: 400 });
      }
      return NextResponse.json({ error: `Invalid verification code. ${limit.remaining} attempt(s) remaining.` }, { status: 400 });
    }

    // Verify the user
    db.prepare('UPDATE users SET is_verified = 1, verification_code = NULL, verification_expires_at = NULL, updated_at = datetime(\'now\') WHERE id = ?').run(user.id);

    // Auto-join Welcome Center community
    const welcomeCommunity = db.prepare('SELECT id FROM communities WHERE slug = ?').get('welcome-center') as { id: string } | undefined;
    if (welcomeCommunity) {
      const { v4: uuidv4 } = await import('uuid');
      db.prepare('INSERT OR IGNORE INTO community_members (id, user_id, community_id, role) VALUES (?, ?, ?, ?)').run(uuidv4(), user.id, welcomeCommunity.id, 'member');
      db.prepare('UPDATE communities SET member_count = member_count + 1 WHERE id = ?').run(welcomeCommunity.id);
    }

    // Issue new token with verified status
    const token = signToken({ userId: user.id, username: user.username, is_verified: 1 });

    const response = NextResponse.json({
      message: 'Your identity has been verified! Welcome to Our Place.',
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        is_verified: 1,
      },
    });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Verification error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
