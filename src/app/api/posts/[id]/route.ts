import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// DELETE: remove a post. The author can delete their own; an admin can delete any
// (the moderation takedown path). Comments, reactions, and media are removed by
// the schema's onDelete: Cascade, so no manual child cleanup is needed here.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }

    const isOwner = post.authorId === auth.user.userId;
    const isAdmin = auth.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: "You can only delete your own posts." }, { status: 403 });
    }

    await prisma.post.delete({ where: { id } });

    return NextResponse.json({ message: "Post deleted." });
  } catch (error) {
    console.error("Delete post error:", error);
    return NextResponse.json({ error: "Failed to delete post." }, { status: 500 });
  }
}
