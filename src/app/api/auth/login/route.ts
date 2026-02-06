import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { signToken } from '@/lib/auth';
import { User } from '@/lib/types';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { login, password } = await request.json();

    if (!login || !password) {
      return NextResponse.json({ error: 'Please enter your email/username and password.' }, { status: 400 });
    }

    const db = getDb();

    // Find user by email or username
    const user = db.prepare(
      'SELECT * FROM users WHERE email = ? OR username = ?'
    ).get(login.toLowerCase(), login.toLowerCase()) as User | undefined;

    if (!user) {
      return NextResponse.json({ error: 'No account found with these credentials.' }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash!);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid password.' }, { status: 401 });
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
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
