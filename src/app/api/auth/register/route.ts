import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { signToken, generateVerificationCode } from '@/lib/auth';
import { AVATAR_COLORS } from '@/lib/types';
import { registerLimiter, getClientIp } from '@/lib/rate-limit';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = registerLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const { username, display_name, email, phone, password } = await request.json();

    // Validation
    if (!username || !display_name || !email || !phone || !password) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }

    if (username.length < 3 || username.length > 24) {
      return NextResponse.json({ error: 'Username must be 3-24 characters.' }, { status: 400 });
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      return NextResponse.json({ error: 'Username can only contain letters, numbers, and underscores.' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
    }

    const phoneClean = phone.replace(/\D/g, '');
    if (phoneClean.length < 10) {
      return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 });
    }

    const db = getDb();

    // Check for existing accounts (one-human-one-account enforcement)
    const existingEmail = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingEmail) {
      return NextResponse.json({ error: 'An account with this email already exists. Our one-human, one-account policy means each person can only have one account.' }, { status: 409 });
    }

    const existingPhone = db.prepare('SELECT id FROM users WHERE phone = ?').get(phoneClean);
    if (existingPhone) {
      return NextResponse.json({ error: 'An account with this phone number already exists. Our one-human, one-account policy means each person can only have one account.' }, { status: 409 });
    }

    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);
    if (existingUsername) {
      return NextResponse.json({ error: 'This username is already taken.' }, { status: 409 });
    }

    // Create user
    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 12);
    const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const verification_code = generateVerificationCode();
    const verification_expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes

    db.prepare(`
      INSERT INTO users (id, username, display_name, email, phone, password_hash, avatar_color, verification_code, verification_expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, username.toLowerCase(), display_name, email.toLowerCase(), phoneClean, password_hash, avatar_color, verification_code, verification_expires_at);

    // Generate token
    const token = signToken({ userId: id, username: username.toLowerCase(), is_verified: 0 });

    // In production, send the verification code via SMS/email here.
    // For development, log it to the server console only.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Verification code for ${email}: ${verification_code}`);
    }

    const response = NextResponse.json({
      message: 'Account created! Please check your email/phone for a verification code.',
      user: { id, username: username.toLowerCase(), display_name, email: email.toLowerCase(), avatar_color, is_verified: 0 },
    }, { status: 201 });

    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 hours
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
