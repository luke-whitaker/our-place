import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { parsePagination, paginateResults } from "@/lib/pagination";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    const { limit, offset, page } = parsePagination(new URL(request.url).searchParams);

    // Find community by slug or id
    const community = await prisma.community.findFirst({
      where: { OR: [{ slug: id }, { id }] },
    });

    if (!community) {
      return NextResponse.json({ error: "Community not found." }, { status: 404 });
    }

    // Check membership
    let membership = null;
    if (auth) {
      membership = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: auth.userId, communityId: community.id } },
      });
    }

    // Get members list (paginated)
    const members = await prisma.communityMember.findMany({
      where: { communityId: community.id },
      include: {
        user: { select: { displayName: true, username: true, avatarColor: true } },
      },
      orderBy: { joinedAt: "asc" },
      take: limit + 1,
      skip: offset,
    });

    const mappedMembers = members.map((m) => ({
      id: m.id,
      user_id: m.userId,
      community_id: m.communityId,
      role: m.role,
      joined_at: m.joinedAt.toISOString(),
      display_name: m.user.displayName,
      username: m.user.username,
      avatar_color: m.user.avatarColor,
    }));

    const { data: paginatedMembers, hasMore } = paginateResults(mappedMembers, limit, page);

    // Map community to match existing API shape
    const communityResponse = {
      id: community.id,
      name: community.name,
      slug: community.slug,
      description: community.description,
      category: community.category,
      icon: community.icon,
      banner_color: community.bannerColor,
      guidelines: community.guidelines,
      creator_id: community.creatorId,
      is_official: community.isOfficial,
      member_count: community.memberCount,
      created_at: community.createdAt.toISOString(),
    };

    const membershipResponse = membership
      ? {
          id: membership.id,
          user_id: membership.userId,
          community_id: membership.communityId,
          role: membership.role,
          joined_at: membership.joinedAt.toISOString(),
        }
      : null;

    return NextResponse.json({
      community: communityResponse,
      membership: membershipResponse,
      members: paginatedMembers,
      hasMore,
      page,
    });
  } catch (error) {
    console.error("Community detail error:", error);
    return NextResponse.json({ error: "Failed to load community." }, { status: 500 });
  }
}
