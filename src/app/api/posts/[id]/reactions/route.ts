import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { reactionLimiter } from "@/lib/rate-limit";
import { createReactionSchema } from "@/lib/schemas";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await getAuthUser();
    if (!auth) {
      return NextResponse.json({ error: "Please log in to react." }, { status: 401 });
    }

    const limit = reactionLimiter.check(auth.userId);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many reactions. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const body = await request.json();
    const parsed = createReactionSchema.safeParse(body);
    const reactionType = parsed.success ? parsed.data.type : "like";

    // Check if reaction already exists
    const existing = await prisma.reaction.findUnique({
      where: { postId_userId: { postId: id, userId: auth.userId } },
    });

    if (existing) {
      // Remove reaction (toggle off)
      await prisma.reaction.delete({ where: { id: existing.id } });
      await prisma.$executeRaw`UPDATE posts SET reaction_count = GREATEST(0, reaction_count - 1) WHERE id = ${id}`;
      return NextResponse.json({ message: "Reaction removed.", reacted: false });
    } else {
      // Add reaction
      await prisma.reaction.create({
        data: { id: uuidv4(), postId: id, userId: auth.userId, type: reactionType },
      });
      await prisma.post.update({
        where: { id },
        data: { reactionCount: { increment: 1 } },
      });
      return NextResponse.json({ message: "Reaction added!", reacted: true, type: reactionType });
    }
  } catch (error) {
    console.error("Reaction error:", error);
    return NextResponse.json({ error: "Failed to react." }, { status: 500 });
  }
}
