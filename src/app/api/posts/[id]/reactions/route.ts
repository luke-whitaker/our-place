import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { reactionLimiter } from "@/lib/rate-limit";
import { createReactionSchema } from "@/lib/schemas";
import { v4 as uuidv4 } from "uuid";

// One reaction per member per post. A dislike replaces a like and vice versa:
// switching types moves the row between reaction_count (every non-dislike
// type) and dislike_count rather than double-counting. Both counters are
// floored at zero with the same GREATEST(0, ...) raw update used elsewhere,
// since a toggle-off or a switch can race with itself across requests.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const limit = reactionLimiter.check(auth.user.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reactions. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = createReactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid reaction type." }, { status: 400 });
    }
    const reactionType = parsed.data.type;

    const post = await prisma.post.findUnique({
      where: { id },
      select: { id: true, allowReactions: true, allowDislikes: true },
    });
    if (!post) {
      return NextResponse.json({ error: "Post not found." }, { status: 404 });
    }
    if (!post.allowReactions) {
      return NextResponse.json(
        { error: "The author turned off reactions for this post." },
        { status: 403 },
      );
    }
    if (reactionType === "dislike" && !post.allowDislikes) {
      return NextResponse.json(
        { error: "The author hasn't enabled dislikes on this post." },
        { status: 403 },
      );
    }

    const existing = await prisma.reaction.findUnique({
      where: { postId_userId: { postId: id, userId: auth.user.userId } },
    });

    const reacted = !existing || existing.type !== reactionType;
    const respType = reacted ? reactionType : null;

    await prisma.$transaction(async (tx) => {
      if (existing && existing.type === reactionType) {
        // Toggle off: remove the reaction and give back its counted slot.
        await tx.reaction.delete({ where: { id: existing.id } });
        if (reactionType === "dislike") {
          await tx.$executeRaw`UPDATE posts SET dislike_count = GREATEST(0, dislike_count - 1) WHERE id = ${id}`;
        } else {
          await tx.$executeRaw`UPDATE posts SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = ${id}`;
        }
        return;
      }

      if (existing) {
        // Switch type: move the row, and if it crossed the like/dislike
        // boundary, move its count between the two counters too.
        await tx.reaction.update({ where: { id: existing.id }, data: { type: reactionType } });
        if (existing.type === "dislike" && reactionType !== "dislike") {
          await tx.$executeRaw`UPDATE posts SET dislike_count = GREATEST(0, dislike_count - 1) WHERE id = ${id}`;
          await tx.post.update({ where: { id }, data: { reactionCount: { increment: 1 } } });
        } else if (existing.type !== "dislike" && reactionType === "dislike") {
          await tx.$executeRaw`UPDATE posts SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = ${id}`;
          await tx.post.update({ where: { id }, data: { dislikeCount: { increment: 1 } } });
        }
        return;
      }

      // New reaction.
      await tx.reaction.create({
        data: { id: uuidv4(), postId: id, userId: auth.user.userId, type: reactionType },
      });
      if (reactionType === "dislike") {
        await tx.post.update({ where: { id }, data: { dislikeCount: { increment: 1 } } });
      } else {
        await tx.post.update({ where: { id }, data: { reactionCount: { increment: 1 } } });
      }
    });

    // Read counts back after the transaction so the client sets exact
    // numbers instead of guessing with +1/-1.
    const updated = await prisma.post.findUniqueOrThrow({
      where: { id },
      select: { reactionCount: true, dislikeCount: true },
    });

    return NextResponse.json({
      message: reacted ? "Reaction updated." : "Reaction removed.",
      reacted,
      type: respType,
      reaction_count: updated.reactionCount,
      dislike_count: updated.dislikeCount,
    });
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json({ error: "Failed to react." }, { status: 500 });
  }
}
