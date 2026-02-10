import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateVerificationCode } from '@/lib/auth';
import { User } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as User | undefined;

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

    // In production, send this code via email/SMS
    // For demo, return it in the response
    return NextResponse.json({
      message: 'If an account with that email exists, a reset code has been generated.',
      reset_code: resetCode, // Remove in production
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
