import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { pollVoteLimiter } from "@/lib/rate-limit";
import { getZodErrorMessage, pollVoteSchema } from "@/lib/schemas";
import { castVote, pollsForPosts, PollVoteRefusal } from "@/lib/polls";

// POST: vote on a poll post's option. Tapping your own vote takes it back; in
// a single choice poll, tapping another moves it. Community polls are for that
// community's members, like commenting. Returns the poll as you now see it.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const me = auth.user.userId;
    const { id } = await params;

    const limit = pollVoteLimiter.check(me);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many votes. Please try again later." },
        { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } },
      );
    }

    const parsed = pollVoteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: getZodErrorMessage(parsed) }, { status: 400 });
    }

    const post = await prisma.post.findUnique({
      where: { id },
      select: { communityId: true, poll: { select: { id: true } } },
    });
    if (!post?.poll) return NextResponse.json({ error: "Poll not found." }, { status: 404 });
    if (post.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: { userId_communityId: { userId: me, communityId: post.communityId } },
        select: { id: true },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "You must be a community member to vote." },
          { status: 403 },
        );
      }
    }

    const now = new Date();
    await castVote(post.poll.id, parsed.data.option_id, me, now);
    const poll = (await pollsForPosts([id], me, now)).get(id) ?? null;
    return NextResponse.json({ message: "Vote saved.", poll });
  } catch (error) {
    if (error instanceof PollVoteRefusal) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Poll vote error:", error);
    return NextResponse.json({ error: "Failed to save your vote." }, { status: 500 });
  }
}
