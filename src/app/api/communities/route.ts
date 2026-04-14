import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import type { CommunityWhereInput } from "@/generated/prisma/models/Community";
import { getAuthUser } from "@/lib/auth";
import { createCommunityLimiter } from "@/lib/rate-limit";
import { createCommunitySchema, getZodErrorMessage } from "@/lib/schemas";
import { parsePagination, paginateResults } from "@/lib/pagination";

// GET: List/search all communities
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const category = searchParams.get("category") || "";
    const joined = searchParams.get("joined") || "";
    const { limit, offset, page } = parsePagination(searchParams);

    // Build where clause
    const where: CommunityWhereInput = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (category) {
      where.category = category;
    }

    if (auth && joined === "true") {
      where.members = { some: { userId: auth.userId } };
    }

    const communities = await prisma.community.findMany({
      where,
      include: {
        members: auth
          ? { where: { userId: auth.userId }, select: { userId: true, role: true } }
          : false,
      },
      orderBy: [{ memberCount: "desc" }, { createdAt: "desc" }],
      take: limit + 1,
      skip: offset,
    });

    // Map to match existing API shape
    const mapped = communities.map((c) => {
      const membership = Array.isArray(c.members) && c.members.length > 0 ? c.members[0] : null;
      return {
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        category: c.category,
        icon: c.icon,
        guidelines: c.guidelines,
        banner_color: c.bannerColor,
        creator_id: c.creatorId,
        is_official: c.isOfficial,
        member_count: c.memberCount,
        created_at: c.createdAt.toISOString(),
        is_member: membership ? 1 : 0,
        role: membership?.role ?? null,
      };
    });

    const { data: paginatedCommunities, hasMore } = paginateResults(mapped, limit, page);

    return NextResponse.json({ communities: paginatedCommunities, hasMore, page });
  } catch (error) {
    console.error("Communities list error:", error);
    return NextResponse.json({ error: "Failed to load communities." }, { status: 500 });
  }
}

// POST: Create a new community
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in to create a community." }, { status: 401 });
    }
    if (!auth.is_verified) {
      return NextResponse.json(
        { error: "Please verify your account before creating a community." },
        { status: 403 },
      );
    }

    const limit = createCommunityLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many communities created. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = createCommunitySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }
    const { name, description, category, icon, guidelines } = parsed.data;

    // Check if community already exists (case-insensitive)
    const existing = await prisma.community.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      return NextResponse.json(
        { error: "A community with this name already exists." },
        { status: 409 },
      );
    }

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const existingSlug = await prisma.community.findUnique({ where: { slug } });
    if (existingSlug) {
      return NextResponse.json(
        { error: "A community with a similar name already exists." },
        { status: 409 },
      );
    }

    const bannerColors = [
      "#6366f1",
      "#8b5cf6",
      "#d946ef",
      "#ec4899",
      "#ef4444",
      "#f97316",
      "#f59e0b",
      "#22c55e",
      "#10b981",
      "#0ea5e9",
      "#3b82f6",
    ];
    const banner_color = bannerColors[Math.floor(Math.random() * bannerColors.length)];

    const community = await prisma.community.create({
      data: {
        name,
        slug,
        description,
        category,
        icon: icon || "\uD83C\uDF10",
        bannerColor: banner_color,
        guidelines: guidelines || "",
        creatorId: auth.userId,
        memberCount: 1,
      },
    });

    // Auto-join creator as admin
    await prisma.communityMember.create({
      data: { userId: auth.userId, communityId: community.id, role: "admin" },
    });

    return NextResponse.json(
      {
        message: "Community created!",
        community: {
          id: community.id,
          name,
          slug,
          description,
          category,
          icon: icon || "\uD83C\uDF10",
          banner_color,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Create community error:", error);
    return NextResponse.json({ error: "Failed to create community." }, { status: 500 });
  }
}
