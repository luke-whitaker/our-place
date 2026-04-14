import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser, signToken } from "@/lib/auth";
import { verifyLimiter } from "@/lib/rate-limit";
import { verifySchema, getZodErrorMessage } from "@/lib/schemas";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in first." }, { status: 401 });
    }

    // Rate limiting per user ID to prevent brute-force on verification codes
    const limit = verifyLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many verification attempts. Please wait before trying again." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { code } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        isVerified: true,
        verificationCode: true,
        verificationExpiresAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (user.isVerified) {
      return NextResponse.json({ message: "Account is already verified." });
    }

    if (user.verificationExpiresAt && user.verificationExpiresAt < new Date()) {
      // Invalidate expired code
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationCode: null, verificationExpiresAt: null },
      });
      return NextResponse.json(
        { error: "Verification code has expired. Please request a new one." },
        { status: 400 },
      );
    }

    if (user.verificationCode !== code) {
      // Track failed attempts — after 5 failed rate-limited attempts, invalidate the code
      if (limit.remaining === 0) {
        await prisma.user.update({
          where: { id: user.id },
          data: { verificationCode: null, verificationExpiresAt: null },
        });
        return NextResponse.json(
          {
            error:
              "Too many failed attempts. Your code has been invalidated. Please request a new one.",
          },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { error: `Invalid verification code. ${limit.remaining} attempt(s) remaining.` },
        { status: 400 },
      );
    }

    // Verify the user
    await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationCode: null, verificationExpiresAt: null },
    });

    // Auto-join Welcome Center community
    const welcomeCommunity = await prisma.community.findUnique({
      where: { slug: "welcome-center" },
    });
    if (welcomeCommunity) {
      await prisma.communityMember.upsert({
        where: {
          userId_communityId: { userId: user.id, communityId: welcomeCommunity.id },
        },
        update: {},
        create: { userId: user.id, communityId: welcomeCommunity.id, role: "member" },
      });
      await prisma.community.update({
        where: { id: welcomeCommunity.id },
        data: { memberCount: { increment: 1 } },
      });
    }

    // Issue new token with verified status
    const token = signToken({ userId: user.id, username: user.username, is_verified: 1 });

    const response = NextResponse.json({
      message: "Your identity has been verified! Welcome to Our Place.",
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        is_verified: 1,
      },
    });

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Verification error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
