import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { signToken } from "@/lib/auth";
import { loginLimiter, getClientIp } from "@/lib/rate-limit";
import { loginSchema, getZodErrorMessage } from "@/lib/schemas";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = loginLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { login, password } = parsed.data;

    // Find user by email or username
    const loginLower = login.toLowerCase();
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: loginLower }, { username: loginLower }],
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        bio: true,
        avatarColor: true,
        isVerified: true,
        role: true,
        passwordHash: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Invalid email/username or password." }, { status: 401 });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: "Invalid email/username or password." }, { status: 401 });
    }

    const token = signToken({
      userId: user.id,
      username: user.username,
      is_verified: user.isVerified ? 1 : 0,
      role: user.role,
    });

    const response = NextResponse.json({
      message: "Welcome back!",
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        bio: user.bio,
        avatar_color: user.avatarColor,
        is_verified: user.isVerified ? 1 : 0,
        role: user.role,
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
    console.error("Login error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
