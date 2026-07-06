import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// PATCH: Accept a pending friend request. Only the person it was sent to can accept.
export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;

    const friendship = await prisma.friendship.findUnique({
      where: { id },
      include: { user: { select: { displayName: true } } },
    });
    if (
      !friendship ||
      (friendship.userId !== auth.user.userId && friendship.friendId !== auth.user.userId)
    ) {
      // Same response whether the row is missing or someone else's — don't
      // confirm other people's friendships exist.
      return NextResponse.json({ error: "Friend request not found." }, { status: 404 });
    }
    if (friendship.status === "accepted") {
      return NextResponse.json({ error: "You're already friends." }, { status: 409 });
    }
    if (friendship.friendId !== auth.user.userId) {
      return NextResponse.json(
        { error: "Only the person who received the request can accept it." },
        { status: 403 },
      );
    }

    await prisma.friendship.update({ where: { id }, data: { status: "accepted" } });

    return NextResponse.json({
      message: `You're now friends with ${friendship.user.displayName}!`,
      status: "friends",
    });
  } catch (error) {
    console.error("Accept friend request error:", error);
    return NextResponse.json({ error: "Failed to accept friend request." }, { status: 500 });
  }
}

// DELETE: Remove a friendship row you're part of. Depending on its state this
// is cancel (your pending request), decline (their pending request), or
// unfriend (an accepted friendship). The row is deleted either way, so a fresh
// request can always be sent later.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { id } = await params;

    const friendship = await prisma.friendship.findUnique({ where: { id } });
    if (
      !friendship ||
      (friendship.userId !== auth.user.userId && friendship.friendId !== auth.user.userId)
    ) {
      return NextResponse.json({ error: "Friend request not found." }, { status: 404 });
    }

    await prisma.friendship.delete({ where: { id } });

    const message =
      friendship.status === "accepted"
        ? "Friend removed."
        : friendship.userId === auth.user.userId
          ? "Friend request canceled."
          : "Friend request declined.";

    return NextResponse.json({ message, status: "none" });
  } catch (error) {
    console.error("Delete friendship error:", error);
    return NextResponse.json({ error: "Failed to update friendship." }, { status: 500 });
  }
}
