import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { parsePagination, paginateResults } from "@/lib/pagination";
import { toPeopleEntry } from "@/lib/people";

const directorySelect = {
  id: true,
  username: true,
  displayName: true,
  avatarColor: true,
  createdAt: true,
  inviter: { select: { username: true, displayName: true } },
} as const;

// GET: the member directory for /people — every account on the platform,
// searchable by name, with the viewer's friendship status to each. Never
// returns password hashes, emails, or phone numbers.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const searchParams = new URL(request.url).searchParams;
    const { limit, offset, page } = parsePagination(searchParams);
    const search = searchParams.get("search")?.trim() ?? "";

    const users = await prisma.user.findMany({
      where: search
        ? {
            OR: [
              { displayName: { contains: search, mode: "insensitive" } },
              { username: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: directorySelect,
      orderBy: { displayName: "asc" },
      take: limit + 1,
      skip: offset,
    });

    const { data, hasMore } = paginateResults(users, limit, page);

    // One friendship query for the whole page, not one per row.
    const otherIds = data.map((u) => u.id).filter((id) => id !== me);
    const friendships =
      otherIds.length > 0
        ? await prisma.friendship.findMany({
            where: {
              OR: [
                { userId: me, friendId: { in: otherIds } },
                { friendId: me, userId: { in: otherIds } },
              ],
            },
            select: { id: true, userId: true, friendId: true, status: true },
          })
        : [];
    const friendshipByOtherId = new Map(
      friendships.map((row) => [row.userId === me ? row.friendId : row.userId, row]),
    );

    const wireUsers = data.map((u) => toPeopleEntry(u, me, friendshipByOtherId.get(u.id) ?? null));

    return NextResponse.json({ users: wireUsers, hasMore, page });
  } catch (error) {
    console.error("Directory error:", error);
    return NextResponse.json({ error: "Failed to load the directory." }, { status: 500 });
  }
}
