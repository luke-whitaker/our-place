import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  signToken,
  signTrustedDevice,
  isTrustedDevice,
  AUTH_COOKIE_OPTIONS,
  TRUSTED_DEVICE_COOKIE,
  TRUSTED_DEVICE_COOKIE_OPTIONS,
} from "@/lib/auth";
import { accountLoginLimiter, loginLimiter, getClientIp } from "@/lib/rate-limit";
import { loginSchema, getZodErrorMessage } from "@/lib/schemas";
import bcrypt from "bcryptjs";

function tooManyAttempts(retryAfterMs: number): NextResponse {
  return NextResponse.json(
    { error: "Too many login attempts. Please try again later." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) } },
  );
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = loginLimiter.check(ip);
    if (!limit.allowed) {
      return tooManyAttempts(limit.retryAfterMs);
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
        avatar: true,
        isVerified: true,
        role: true,
        passwordHash: true,
        passwordChangedAt: true,
      },
    });

    // Keyed on the account when it exists, so its username and email share one
    // budget, and on the typed name otherwise, so a missing account reaches the
    // same 429 as a real one and the two can't be told apart. A browser that
    // signed in to this account before skips the limit, so failures from
    // strangers never lock the member out on their own device.
    const accountKey = user?.id ?? loginLower;
    const trusted =
      user !== null &&
      isTrustedDevice(
        request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value,
        user.id,
        user.passwordChangedAt,
      );
    const accountLimit = trusted ? null : accountLoginLimiter.peek(accountKey);
    if (accountLimit && !accountLimit.allowed) {
      return tooManyAttempts(accountLimit.retryAfterMs);
    }

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      if (!trusted) accountLoginLimiter.recordFailure(accountKey);
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
        avatar: user.avatar,
        is_verified: user.isVerified ? 1 : 0,
        role: user.role,
      },
    });

    response.cookies.set("auth_token", token, AUTH_COOKIE_OPTIONS);
    response.cookies.set(
      TRUSTED_DEVICE_COOKIE,
      signTrustedDevice(user.id),
      TRUSTED_DEVICE_COOKIE_OPTIONS,
    );

    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
