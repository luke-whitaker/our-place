import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { AVATAR_COLORS } from "@/lib/types";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

const createUserSchema = z.object({
  display_name: z.string().min(1, "Name is required").max(100),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(24)
    .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only"),
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  phone: z.string().min(1, "Phone is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

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
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid input.";
      return NextResponse.json({ error: firstError }, { status: 400 });
    }

    const { display_name, username, email, phone, password } = parsed.data;
    const phoneClean = phone.replace(/\D/g, "");
    const usernameLower = username.toLowerCase();
    const emailLower = email.toLowerCase();

    const existingEmail = await prisma.user.findUnique({ where: { email: emailLower } });
    if (existingEmail) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const existingPhone = await prisma.user.findUnique({ where: { phone: phoneClean } });
    if (existingPhone) {
      return NextResponse.json(
        { error: "An account with this phone number already exists." },
        { status: 409 },
      );
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
