import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resetPasswordLimiter, getClientIp } from "@/lib/rate-limit";
import { resetPasswordSchema, getZodErrorMessage } from "@/lib/schemas";
import bcrypt from "bcryptjs";

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
      select: { id: true, email: true, resetCode: true, resetCodeExpiresAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid email or reset code." }, { status: 400 });
    }

    if (!user.resetCode || user.resetCode !== code) {
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

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetCode: null, resetCodeExpiresAt: null },
    });

    return NextResponse.json({
      message: "Your password has been reset successfully. You can now sign in.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
