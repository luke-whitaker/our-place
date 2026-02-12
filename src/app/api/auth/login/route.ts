import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { User } from '@/lib/types';
import { loginLimiter, getClientIp } from '@/lib/rate-limit';
import { loginSchema, getZodErrorMessage } from '@/lib/schemas';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = loginLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { login, password } = parsed.data;

    const db = getDb();

    // Find user by email or username — select only needed columns
    const user = db.prepare(
      'SELECT id, username, display_name, email, bio, avatar_color, is_verified, password_hash FROM users WHERE email = ? OR username = ?'
    ).get(login.toLowerCase(), login.toLowerCase()) as Pick<User, 'id' | 'username' | 'display_name' | 'email' | 'bio' | 'avatar_color' | 'is_verified' | 'password_hash'> | undefined;

    if (!user) {
      return NextResponse.json({ error: 'Invalid email/username or password.' }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash!);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid email/username or password.' }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      is_verified: user.is_verified,
    });

    const response = NextResponse.json({
      message: 'Welcome back!',
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        email: user.email,
        bio: user.bio,
        avatar_color: user.avatar_color,
        is_verified: user.is_verified,
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
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
