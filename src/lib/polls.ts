// Polls: a post type for deciding something together ("which Saturday?").
// Not engagement: no ranking, no notifications, counts only, and by default
// nobody sees the results until they've answered, so they don't vote with
// the crowd. Who voted for what is never sent.

import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/lib/db";
import type { PollInput } from "@/lib/schemas";
import type { PollResultsVisible, PollWire } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSES_IN_MS: Record<NonNullable<PollInput["closes_in"]>, number> = {
  "1d": DAY_MS,
  "3d": 3 * DAY_MS,
  "1w": 7 * DAY_MS,
};

/** The nested write that creates a poll with its post, in the same statement,
 * so a poll post never exists without its options. */
export function pollCreateData(input: PollInput, now: Date) {
  return {
    create: {
      multipleChoice: input.multiple_choice,
      resultsVisible: input.results_visible,
      closesAt: input.closes_in ? new Date(now.getTime() + CLOSES_IN_MS[input.closes_in]) : null,
      options: {
        create: input.options.map((label, sortOrder) => ({ label, sortOrder })),
      },
    },
  };
}

/** What every poll read selects, so the wire mapper always has its fields. */
export const POLL_SELECT = {
  id: true,
  postId: true,
  multipleChoice: true,
  resultsVisible: true,
  closesAt: true,
  options: {
    select: { id: true, label: true, voteCount: true },
    orderBy: { sortOrder: "asc" },
  },
} satisfies Prisma.PollSelect;

type PollRow = Prisma.PollGetPayload<{ select: typeof POLL_SELECT }>;

function isResultsVisible(value: string): value is PollResultsVisible {
  return value === "after_vote" || value === "always" || value === "after_close";
}

/**
 * The poll as one viewer may see it. Per-option counts are held back until
 * the poll's rule allows them (after this viewer votes, always, or once it
 * closes); the total is always sent, since it can't sway a choice.
 */
export function toPollWire(poll: PollRow, myOptionIds: ReadonlySet<string>, now: Date): PollWire {
  const resultsVisible = isResultsVisible(poll.resultsVisible) ? poll.resultsVisible : "after_vote";
  const closed = poll.closesAt !== null && poll.closesAt.getTime() <= now.getTime();
  const hasVoted = poll.options.some((o) => myOptionIds.has(o.id));
  const showResults =
    resultsVisible === "always" || closed || (resultsVisible === "after_vote" && hasVoted);
  return {
    id: poll.id,
    multiple_choice: poll.multipleChoice,
    results_visible: resultsVisible,
    closes_at: poll.closesAt?.toISOString() ?? null,
    closed,
    has_voted: hasVoted,
    show_results: showResults,
    total_votes: poll.options.reduce((sum, o) => sum + o.voteCount, 0),
    options: poll.options.map((o) => ({
      id: o.id,
      label: o.label,
      vote_count: showResults ? o.voteCount : null,
      voted: myOptionIds.has(o.id),
    })),
  };
}

/** Every poll among these posts as this viewer sees it, keyed by post id. */
export async function pollsForPosts(
  postIds: string[],
  viewerId: string,
  now: Date,
): Promise<Map<string, PollWire>> {
  if (postIds.length === 0) return new Map();
  const polls = await prisma.poll.findMany({
    where: { postId: { in: postIds } },
    select: { ...POLL_SELECT, votes: { where: { userId: viewerId }, select: { optionId: true } } },
  });
  return new Map(
    polls.map((p) => [p.postId, toPollWire(p, new Set(p.votes.map((v) => v.optionId)), now)]),
  );
}

export class PollVoteRefusal extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * One tap on an option. Tapping your own vote takes it back; in a single
 * choice poll, tapping another option moves your vote there. Runs under a
 * lock on the voter's own row, so two taps racing can't leave two votes in a
 * single choice poll, and every count changes by exactly the rows removed or
 * added, so none can go below zero.
 */
export async function castVote(pollId: string, optionId: string, userId: string, now: Date) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const poll = await tx.poll.findUnique({
      where: { id: pollId },
      select: { multipleChoice: true, closesAt: true, options: { select: { id: true } } },
    });
    if (!poll) throw new PollVoteRefusal("Poll not found.", 404);
    if (poll.closesAt && poll.closesAt.getTime() <= now.getTime()) {
      throw new PollVoteRefusal("This poll has closed.", 409);
    }
    if (!poll.options.some((o) => o.id === optionId)) {
      throw new PollVoteRefusal("That isn't one of this poll's options.", 400);
    }

    const mine = await tx.pollVote.findMany({
      where: { pollId, userId },
      select: { id: true, optionId: true },
    });
    const same = mine.find((v) => v.optionId === optionId);
    const toRemove = same ? [same] : poll.multipleChoice ? [] : mine;
    if (toRemove.length > 0) {
      await tx.pollVote.deleteMany({ where: { id: { in: toRemove.map((v) => v.id) } } });
      await tx.pollOption.updateMany({
        where: { id: { in: toRemove.map((v) => v.optionId) }, voteCount: { gt: 0 } },
        data: { voteCount: { decrement: 1 } },
      });
    }
    if (same) return;
    await tx.pollVote.create({ data: { pollId, optionId, userId } });
    await tx.pollOption.update({
      where: { id: optionId },
      data: { voteCount: { increment: 1 } },
    });
  });
}
