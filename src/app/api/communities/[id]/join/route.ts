import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in to join communities." }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json({ error: "Please verify your account first." }, { status: 403 });
    }

    const community = await prisma.community.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });

    if (!community) {
      return NextResponse.json({ error: "Community not found." }, { status: 404 });
    }

    // Check if already a member
    const existing = await prisma.communityMember.findUnique({
      where: { userId_communityId: { userId: auth.userId, communityId: community.id } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "You are already a member of this community." },
        { status: 409 },
      );
    }

    await prisma.communityMember.create({
      data: { userId: auth.userId, communityId: community.id, role: "member" },
    });

    await prisma.community.update({
      where: { id: community.id },
      data: { memberCount: { increment: 1 } },
    });

    return NextResponse.json({ message: "Welcome to the community!" }, { status: 201 });
  } catch (error) {
    console.error("Join community error:", error);
    return NextResponse.json({ error: "Failed to join community." }, { status: 500 });
  }
}
