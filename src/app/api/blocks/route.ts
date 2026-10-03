import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { blockMember, MAX_BLOCKS } from "@/lib/blocks";
import { separateInCalls } from "@/lib/calls";
import { presenceHub } from "@/lib/presence";
import { blockLimiter } from "@/lib/rate-limit";
import { blockMemberSchema, getZodErrorMessage } from "@/lib/schemas";
import type { BlockedMember } from "@/lib/types";

// GET: the members the caller has blocked, newest first. Only the blocker's
// own list; nobody can see who blocked them.
export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const rows = await prisma.block.findMany({
      where: { blockerId: auth.user.userId },
      select: {
        createdAt: true,
        blocked: { select: { username: true, displayName: true, avatarColor: true } },
      },
      orderBy: { createdAt: "desc" },
      take: MAX_BLOCKS,
    });

    const blocked: BlockedMember[] = rows.map((r) => ({
      username: r.blocked.username,
      display_name: r.blocked.displayName,
      avatar_color: r.blocked.avatarColor,
      blocked_at: r.createdAt.toISOString(),
    }));
    return NextResponse.json({ blocked });
  } catch (error) {
    console.error("List blocks error:", error);
    return NextResponse.json({ error: "Failed to load blocked members." }, { status: 500 });
  }
}

// POST: block a member by username. Unfriends both and removes what still
// ties them together (see blockMember). The blocked member isn't told.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;

    const limit = blockLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = blockMemberSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const target = await prisma.user.findFirst({
      where: {
        username: { equals: parsed.data.username.toLowerCase(), mode: "insensitive" },
        deletedAt: null,
      },
      select: { id: true, displayName: true },
    });
    if (!target) {
      return NextResponse.json({ error: "That person doesn't exist." }, { status: 404 });
    }
    if (target.id === me) {
      return NextResponse.json({ error: "You can't block yourself." }, { status: 400 });
    }

    const outcome = await blockMember(me, target.id);
    if (outcome === "already_blocked") {
      return NextResponse.json(
        { error: `You've already blocked ${target.displayName}.` },
        { status: 409 },
      );
    }
    if (outcome === "limit_reached") {
      return NextResponse.json(
        { error: `You can block up to ${MAX_BLOCKS} members.` },
        { status: 409 },
      );
    }
    presenceHub().setBlocked(me, target.id, true);
    await separateInCalls(me, target.id, new Date());
    return NextResponse.json({ message: `You blocked ${target.displayName}.` }, { status: 201 });
  } catch (error) {
    console.error("Block member error:", error);
    return NextResponse.json({ error: "Failed to block that member." }, { status: 500 });
  }
}
