import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in." }, { status: 401 });
    }

    const community = await prisma.community.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });

    if (!community) {
      return NextResponse.json({ error: "Community not found." }, { status: 404 });
    }

    if (community.creatorId === auth.userId) {
      return NextResponse.json(
        { error: "Community creators cannot leave their own community." },
        { status: 403 },
      );
    }

    const deleted = await prisma.communityMember.deleteMany({
      where: { userId: auth.userId, communityId: community.id },
    });

    if (deleted.count > 0) {
      // Use raw query for GREATEST to prevent negative counts
      await prisma.$executeRaw`UPDATE communities SET member_count = GREATEST(0, member_count - 1) WHERE id = ${community.id}`;
    }

    return NextResponse.json({ message: "You have left the community." });
  } catch (error) {
    console.error("Leave community error:", error);
    return NextResponse.json({ error: "Failed to leave community." }, { status: 500 });
  }
}
