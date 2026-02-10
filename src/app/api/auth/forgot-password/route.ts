import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateVerificationCode } from '@/lib/auth';
import { User } from '@/lib/types';
import { forgotPasswordLimiter, getClientIp } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = forgotPasswordLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many reset requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare(
      'SELECT id, email FROM users WHERE email = ?'
    ).get(email.toLowerCase().trim()) as Pick<User, 'id' | 'email'> | undefined;

    if (!user) {
      // Return a generic success message to avoid revealing whether the email exists
      return NextResponse.json({
        message: 'If an account with that email exists, a reset code has been generated.',
      });
    }

    // Generate a 6-digit reset code with 30-minute expiration
    const resetCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    db.prepare(
      'UPDATE users SET reset_code = ?, reset_code_expires_at = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(resetCode, expiresAt, user.id);

    // In production, send this code via email/SMS here.
    // For development, log it to the server console only.
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DEV] Reset code for ${email}: ${resetCode}`);
    }

    return NextResponse.json({
      message: 'If an account with that email exists, a reset code has been generated.',
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
