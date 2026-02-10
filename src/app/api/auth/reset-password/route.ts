import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { User } from '@/lib/types';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, code, new_password } = await request.json();

    if (!email || !code || !new_password) {
      return NextResponse.json({ error: 'Email, reset code, and new password are all required.' }, { status: 400 });
    }

    if (new_password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as User | undefined;

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
