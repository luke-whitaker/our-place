import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// DELETE: remove a comment. The comment author can delete their own; an admin can
// delete any (the moderation takedown path). The post's comment_count is
// decremented in the same transaction and floored at 0 (mirrors the reaction
// route's GREATEST guard against drift).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const { id, commentId } = await params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, postId: true },
    });
    // Guard the post/comment pairing so a valid comment id can't be deleted via
    // the wrong post's URL.
    if (!comment || comment.postId !== id) {
      return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    }

    const isOwner = comment.authorId === auth.user.userId;
    const isAdmin = auth.user.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "You can only delete your own comments." },
        { status: 403 },
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.comment.delete({ where: { id: commentId } });
      await tx.$executeRaw`UPDATE posts SET comment_count = GREATEST(0, comment_count - 1) WHERE id = ${id}`;
    });

    return NextResponse.json({ message: "Comment deleted." });
  } catch (error) {
    console.error("Delete comment error:", error);
    return NextResponse.json({ error: "Failed to delete comment." }, { status: 500 });
  }
}
