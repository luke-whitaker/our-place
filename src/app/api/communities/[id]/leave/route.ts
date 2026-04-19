import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const community = await prisma.community.findFirst({
      where: { OR: [{ id }, { slug: id }] },
    });

    if (!community) {
      return NextResponse.json({ error: "Community not found." }, { status: 404 });
    }

    if (community.creatorId === auth.user.userId) {
      return NextResponse.json(
        { error: "Community creators cannot leave their own community." },
        { status: 403 },
      );
    }

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.communityMember.deleteMany({
        where: { userId: auth.user.userId, communityId: community.id },
      });
      if (deleted.count > 0) {
        await tx.$executeRaw`UPDATE communities SET member_count = GREATEST(0, member_count - 1) WHERE id = ${community.id}`;
      }
    });

    return NextResponse.json({ message: "You have left the community." });
  } catch (error) {
    console.error("Leave community error:", error);
    return NextResponse.json({ error: "Failed to leave community." }, { status: 500 });
  }
}
