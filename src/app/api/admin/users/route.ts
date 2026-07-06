import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { adminCreateUserSchema, getZodErrorMessage, normalizePhone } from "@/lib/schemas";
import { AVATAR_COLORS } from "@/lib/types";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        role: true,
        isVerified: true,
        createdAt: true,
        inviter: { select: { username: true, displayName: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Admin list users error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (auth.error) return auth.error;

    const body = await request.json();
    const parsed = adminCreateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const { display_name, username, email, phone, password, invited_by_id } = parsed.data;

    const inviter = await prisma.user.findUnique({
      where: { id: invited_by_id },
      select: { id: true },
    });
    if (!inviter) {
      return NextResponse.json(
        { error: "The inviting member doesn't exist. Pick them from the list." },
        { status: 400 },
      );
    }
    const phoneClean = phone === undefined ? null : normalizePhone(phone);
    const usernameLower = username.toLowerCase();
    const emailLower = email.toLowerCase();

    const existingEmail = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingEmail) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 },
      );
    }

    if (phoneClean) {
      const existingPhone = await prisma.user.findUnique({ where: { phone: phoneClean } });
      if (existingPhone) {
        return NextResponse.json(
          { error: "An account with this phone number already exists." },
          { status: 409 },
        );
      }
    }

    const existingUsername = await prisma.user.findFirst({
      where: { username: { equals: usernameLower, mode: "insensitive" } },
    });
    if (existingUsername) {
      return NextResponse.json({ error: "This username is already taken." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];

    const user = await prisma.user.create({
      data: {
        username: usernameLower,
        displayName: display_name,
        email: emailLower,
        phone: phoneClean,
        passwordHash,
        avatarColor,
        invitedById: invited_by_id,
        isVerified: true,
      },
    });

    return NextResponse.json(
      {
        message: `Account created for ${display_name}!`,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.displayName,
          email: user.email,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Admin create user error:", error);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
