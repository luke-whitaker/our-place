import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { signToken, generateVerificationCode } from "@/lib/auth";
import { AVATAR_COLORS } from "@/lib/types";
import { registerLimiter, getClientIp } from "@/lib/rate-limit";
import { registerSchema, getZodErrorMessage } from "@/lib/schemas";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = getClientIp(request);
    const limit = registerLimiter.check(ip);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { username, display_name, email, phone, password } = parsed.data;

    const phoneClean = phone.replace(/\D/g, "");
    if (phoneClean.length < 10) {
      return NextResponse.json({ error: "Please enter a valid phone number." }, { status: 400 });
    }

    // Check for existing accounts (one-human-one-account enforcement)
    const existingEmail = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existingEmail) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists. Our one-human, one-account policy means each person can only have one account.",
        },
        { status: 409 },
      );
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone: phoneClean } });
    if (existingPhone) {
      return NextResponse.json(
        {
          error:
            "An account with this phone number already exists. Our one-human, one-account policy means each person can only have one account.",
        },
        { status: 409 },
      );
    }

    const existingUsername = await prisma.user.findFirst({
      where: { username: { equals: username, mode: "insensitive" } },
    });
    if (existingUsername) {
      return NextResponse.json({ error: "This username is already taken." }, { status: 409 });
    }

    // Create user
    const password_hash = await bcrypt.hash(password, 12);
    const avatar_color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const verification_code = generateVerificationCode();
    const verification_expires_at = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        displayName: display_name,
        email: email.toLowerCase(),
        phone: phoneClean,
        passwordHash: password_hash,
        avatarColor: avatar_color,
        verificationCode: verification_code,
        verificationExpiresAt: verification_expires_at,
      },
    });

    // Generate token
    const token = signToken({
      userId: user.id,
      username: user.username,
      is_verified: user.isVerified ? 1 : 0,
    });

    // In production, send the verification code via SMS/email here.
    // For development, log it to the server console only.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV] Verification code for ${email}: ${verification_code}`);
    }

    const response = NextResponse.json(
      {
        message: "Account created! Please check your email/phone for a verification code.",
        user: {
          id: user.id,
          username: user.username,
          display_name: user.displayName,
          email: user.email,
          avatar_color: user.avatarColor,
          is_verified: user.isVerified ? 1 : 0,
        },
      },
      { status: 201 },
    );

    response.cookies.set("auth_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60, // 24 hours
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
