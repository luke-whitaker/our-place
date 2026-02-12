import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { User } from '@/lib/types';
import { resetPasswordLimiter, getClientIp } from '@/lib/rate-limit';
import { resetPasswordSchema, getZodErrorMessage } from '@/lib/schemas';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = resetPasswordLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many reset attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } }
      );
    }

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { email, code, new_password } = parsed.data;

    const db = getDb();
    const user = db.prepare(
      'SELECT id, email, reset_code, reset_code_expires_at FROM users WHERE email = ?'
    ).get(email.toLowerCase().trim()) as Pick<User, 'id' | 'email' | 'reset_code' | 'reset_code_expires_at'> | undefined;

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or reset code.' }, { status: 400 });
    }

    if (!user.reset_code || user.reset_code !== code) {
      return NextResponse.json({ error: 'Invalid email or reset code.' }, { status: 400 });
    }

    if (user.reset_code_expires_at && new Date(user.reset_code_expires_at) < new Date()) {
      return NextResponse.json({ error: 'Reset code has expired. Please request a new one.' }, { status: 400 });
    }

    // Hash the new password and clear the reset code
    const password_hash = await bcrypt.hash(new_password, 12);

    db.prepare(
      'UPDATE users SET password_hash = ?, reset_code = NULL, reset_code_expires_at = NULL, updated_at = datetime(\'now\') WHERE id = ?'
    ).run(password_hash, user.id);

    return NextResponse.json({
      message: 'Your password has been reset successfully. You can now sign in.',
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
