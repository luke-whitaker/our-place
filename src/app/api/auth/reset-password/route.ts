import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { constantTimeEqual, hashResetCode, RESET_CODE_MAX_ATTEMPTS } from "@/lib/auth";
import { resetPasswordLimiter, getClientIp } from "@/lib/rate-limit";
import { resetPasswordSchema, getZodErrorMessage } from "@/lib/schemas";
import bcrypt from "bcryptjs";

/**
 * Counts a wrong code against the account, not the IP, and wipes the code on
 * the last allowed guess. The wipe matches the hash it counted against, so a
 * fresh code requested in between survives.
 */
async function recordWrongGuess(userId: string, guessedAgainst: string): Promise<void> {
  const { resetCodeAttempts } = await prisma.user.update({
    where: { id: userId },
    data: { resetCodeAttempts: { increment: 1 } },
    select: { resetCodeAttempts: true },
  });
  if (resetCodeAttempts < RESET_CODE_MAX_ATTEMPTS) return;
  await prisma.user.updateMany({
    where: { id: userId, resetCodeHash: guessedAgainst },
    data: { resetCodeHash: null, resetCodeExpiresAt: null },
  });
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = resetPasswordLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reset attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { email, code, new_password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, resetCodeHash: true, resetCodeExpiresAt: true },
    });

    if (!user?.resetCodeHash) {
      return NextResponse.json({ error: "Invalid email or reset code." }, { status: 400 });
    }

    const codeHash = hashResetCode(code);
    if (!constantTimeEqual(user.resetCodeHash, codeHash)) {
      await recordWrongGuess(user.id, user.resetCodeHash);
      return NextResponse.json({ error: "Invalid email or reset code." }, { status: 400 });
    }

    if (user.resetCodeExpiresAt && user.resetCodeExpiresAt < new Date()) {
      return NextResponse.json(
        { error: "Reset code has expired. Please request a new one." },
        { status: 400 },
      );
    }

    // Hash the new password and clear the reset code
    const passwordHash = await bcrypt.hash(new_password, 12);

    // The where clause re-checks the code at write time: wrong guesses racing
    // this request may have used up the last attempt and wiped it.
    const { count } = await prisma.user.updateMany({
      where: {
        id: user.id,
        resetCodeHash: codeHash,
        resetCodeAttempts: { lt: RESET_CODE_MAX_ATTEMPTS },
      },
      // passwordChangedAt revokes every existing session — whoever had access
      // to the account (the reason for the reset) is signed out everywhere.
      data: {
        passwordHash,
        resetCodeHash: null,
        resetCodeAttempts: 0,
        resetCodeExpiresAt: null,
        passwordChangedAt: new Date(),
      },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Invalid email or reset code." }, { status: 400 });
    }

    return NextResponse.json({
      message: "Your password has been reset successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
