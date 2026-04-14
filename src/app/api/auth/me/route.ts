import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function GET() {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ user: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: {
        id: true,
        username: true,
        displayName: true,
        email: true,
        phone: true,
        bio: true,
        avatarColor: true,
        isVerified: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ user: null });
    }

    // Get community count
    const communityCount = await prisma.communityMember.count({
      where: { userId: auth.userId },
    });

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        display_name: user.displayName,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        avatar_color: user.avatarColor,
        is_verified: user.isVerified ? 1 : 0,
        created_at: user.createdAt.toISOString(),
        community_count: communityCount,
      },
    });
  } catch (error) {
    console.error("Auth check error:", error);
    return NextResponse.json({ user: null });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ message: "Logged out." });
  response.cookies.set("auth_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });
  return response;
}
