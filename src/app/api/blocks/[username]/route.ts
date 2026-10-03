import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { isBlockedEitherWay, unblockMember } from "@/lib/blocks";
import { presenceHub } from "@/lib/presence";
import { blockLimiter } from "@/lib/rate-limit";

// DELETE: lift a block the caller made. Nothing it removed comes back; a
// friendship starts over with a new request.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const limit = blockLimiter.check(auth.user.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const { username } = await params;
    const target = await prisma.user.findFirst({
      where: { username: { equals: username.toLowerCase(), mode: "insensitive" } },
      select: { id: true, displayName: true },
    });
    if (!target || !(await unblockMember(auth.user.userId, target.id))) {
      return NextResponse.json({ error: "You haven't blocked that member." }, { status: 404 });
    }
    // They may have blocked the caller too; then they stay out of sight.
    if (!(await isBlockedEitherWay(auth.user.userId, target.id))) {
      presenceHub().setBlocked(auth.user.userId, target.id, false);
    }
    return NextResponse.json({ message: `You unblocked ${target.displayName}.` });
  } catch (error) {
    console.error("Unblock member error:", error);
    return NextResponse.json({ error: "Failed to unblock that member." }, { status: 500 });
  }
}
