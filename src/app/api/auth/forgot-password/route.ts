import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateCode } from "@/lib/auth";
import { forgotPasswordLimiter, getClientIp } from "@/lib/rate-limit";
import { forgotPasswordSchema, getZodErrorMessage } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = forgotPasswordLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reset requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { email } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: { id: true, email: true },
    });

    if (!user) {
      // Return a generic success message to avoid revealing whether the email exists
      return NextResponse.json({
        message: "If an account with that email exists, a reset code has been generated.",
      });
    }

    // Generate a 6-digit reset code with 30-minute expiration
    const resetCode = generateCode();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetCode, resetCodeExpiresAt: expiresAt },
    });

    // In production, send this code via email/SMS here.
    // For development, log it to the server console only.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Reset code for ${email}: ${resetCode}`);
    }

    return NextResponse.json({
      message: "If an account with that email exists, a reset code has been generated.",
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
