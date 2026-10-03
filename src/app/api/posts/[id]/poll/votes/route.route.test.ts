import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { getAuthUser, requireAuth } from "@/lib/auth";
import type { AuthPayload, PollWire } from "@/lib/types";
import {
  createTestCommunity,
  createTestUser,
  joinCommunity,
  jsonRequest,
} from "@/test/route-helpers";
import {
  GET as listCommunityPosts,
  POST as createCommunityPost,
} from "../../../../communities/[id]/posts/route";
import { POST as createMyPlacePost } from "../../../../my-place/posts/route";
import { POST } from "./route";

// requireAuth and getAuthUser read cookies via next/headers, which doesn't
// exist outside a Next request, so tests choose the caller.
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), requireAuth: vi.fn() }));
const mockGetAuthUser = vi.mocked(getAuthUser);
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockGetAuthUser.mockResolvedValue(user);
  mockRequireAuth.mockResolvedValue({ user });
}

const OPTIONS = ["Saturday", "Sunday", "Next weekend"];

async function createPoll(
  communityId: string,
  poll: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
) {
  return createCommunityPost(
    jsonRequest(`http://localhost/api/communities/${communityId}/posts`, {
      post_type: "poll",
      title: "Which day for the picnic?",
      poll: { options: OPTIONS, ...poll },
      ...overrides,
    }),
    { params: Promise.resolve({ id: communityId }) },
  );
}

async function vote(postId: string, optionId: string) {
  const res = await POST(
    jsonRequest(`http://localhost/api/posts/${postId}/poll/votes`, { option_id: optionId }),
    { params: Promise.resolve({ id: postId }) },
  );
  return { status: res.status, body: await res.json() };
}

/** The poll as `viewer` sees it in the community feed. */
async function pollAsSeenBy(viewer: AuthPayload, communityId: string): Promise<PollWire> {
  authAs(viewer);
  const res = await listCommunityPosts(
    new Request(`http://localhost/api/communities/${communityId}/posts`) as never,
    { params: Promise.resolve({ id: communityId }) },
  );
  const { posts } = await res.json();
  return posts[0].poll;
}

/** A community with a member who has posted a poll in it. */
async function pollInCommunity(poll: Record<string, unknown> = {}) {
  const author = await createTestUser();
  const communityId = await createTestCommunity(author.userId);
  await joinCommunity(author.userId, communityId);
  authAs(author);
  const res = await createPoll(communityId, poll);
  expect(res.status).toBe(201);
  const { postId } = await res.json();
  const options = await prisma.pollOption.findMany({
    where: { poll: { postId } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true },
  });
  return { author, communityId, postId, optionIds: options.map((o) => o.id) };
}

async function counts(postId: string) {
  const options = await prisma.pollOption.findMany({
    where: { poll: { postId } },
    orderBy: { sortOrder: "asc" },
    select: { voteCount: true },
  });
  return options.map((o) => o.voteCount);
}

describe("creating a poll", () => {
  beforeEach(() => {
    mockGetAuthUser.mockReset();
    mockRequireAuth.mockReset();
  });

  it("creates the post, the poll, and its options in order", async () => {
    const { postId } = await pollInCommunity({ multiple_choice: true, closes_in: "3d" });
    const poll = await prisma.poll.findUniqueOrThrow({
      where: { postId },
      select: {
        multipleChoice: true,
        resultsVisible: true,
        closesAt: true,
        options: { orderBy: { sortOrder: "asc" }, select: { label: true } },
      },
    });
    expect(poll.options.map((o) => o.label)).toEqual(OPTIONS);
    expect(poll.multipleChoice).toBe(true);
    expect(poll.resultsVisible).toBe("after_vote");
    const days = (poll.closesAt!.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(2.9);
    expect(days).toBeLessThan(3.1);
  });

  it("works on My Place too", async () => {
    const me = await createTestUser();
    authAs(me);
    const res = await createMyPlacePost(
      jsonRequest("http://localhost/api/my-place/posts", {
        post_type: "poll",
        title: "Coffee or tea?",
        poll: { options: ["Coffee", "Tea"] },
      }),
    );
    expect(res.status).toBe(201);
    expect(await prisma.pollOption.count()).toBe(2);
  });

  it("refuses a poll without a question, too few or too many options, or repeats", async () => {
    const author = await createTestUser();
    const communityId = await createTestCommunity(author.userId);
    await joinCommunity(author.userId, communityId);
    authAs(author);
    expect((await createPoll(communityId, {}, { title: "" })).status).toBe(400);
    expect((await createPoll(communityId, { options: ["Only one"] })).status).toBe(400);
    const seven = ["a", "b", "c", "d", "e", "f", "g"];
    expect((await createPoll(communityId, { options: seven })).status).toBe(400);
    expect((await createPoll(communityId, { options: ["Park", "park"] })).status).toBe(400);
    expect((await createPoll(communityId, { options: ["Park", " "] })).status).toBe(400);
    expect(await prisma.poll.count()).toBe(0);
    expect(await prisma.post.count()).toBe(0);
  });

  it("refuses a poll post without options, and options on any other post", async () => {
    const author = await createTestUser();
    const communityId = await createTestCommunity(author.userId);
    await joinCommunity(author.userId, communityId);
    authAs(author);
    const noPoll = await createPoll(communityId, {}, { poll: undefined });
    expect(noPoll.status).toBe(400);
    const textWithPoll = await createPoll(communityId, {}, { post_type: "text", content: "Hi" });
    expect(textWithPoll.status).toBe(400);
  });

  it("refuses results at close for a poll that never closes", async () => {
    const author = await createTestUser();
    const communityId = await createTestCommunity(author.userId);
    await joinCommunity(author.userId, communityId);
    authAs(author);
    const res = await createPoll(communityId, { results_visible: "after_close" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/posts/[id]/poll/votes", () => {
  beforeEach(() => {
    mockGetAuthUser.mockReset();
    mockRequireAuth.mockReset();
  });

  it("counts a vote and shows results once you've voted", async () => {
    const { author, postId, optionIds } = await pollInCommunity();
    authAs(author);
    const { status, body } = await vote(postId, optionIds[1]);
    expect(status).toBe(200);
    expect(body.poll.has_voted).toBe(true);
    expect(body.poll.show_results).toBe(true);
    expect(body.poll.options.map((o: { vote_count: number }) => o.vote_count)).toEqual([0, 1, 0]);
    expect(body.poll.options[1].voted).toBe(true);
    expect(await counts(postId)).toEqual([0, 1, 0]);
  });

  it("switches a single choice vote, and takes it back on a second tap", async () => {
    const { author, postId, optionIds } = await pollInCommunity();
    authAs(author);
    await vote(postId, optionIds[0]);
    await vote(postId, optionIds[2]);
    expect(await counts(postId)).toEqual([0, 0, 1]);
    expect(await prisma.pollVote.count()).toBe(1);

    const { body } = await vote(postId, optionIds[2]);
    expect(await counts(postId)).toEqual([0, 0, 0]);
    expect(await prisma.pollVote.count()).toBe(0);
    expect(body.poll.has_voted).toBe(false);
  });

  it("lets a multiple choice vote pick several, and take one back", async () => {
    const { author, postId, optionIds } = await pollInCommunity({ multiple_choice: true });
    authAs(author);
    await vote(postId, optionIds[0]);
    await vote(postId, optionIds[1]);
    await vote(postId, optionIds[2]);
    expect(await counts(postId)).toEqual([1, 1, 1]);
    await vote(postId, optionIds[1]);
    expect(await counts(postId)).toEqual([1, 0, 1]);
  });

  it("never leaves two votes in a single choice poll, even when taps race", async () => {
    const { author, postId, optionIds } = await pollInCommunity();
    authAs(author);
    await Promise.all(optionIds.map((id) => vote(postId, id)));
    expect(await prisma.pollVote.count()).toBe(1);
    const total = (await counts(postId)).reduce((a, b) => a + b, 0);
    expect(total).toBe(1);
  });

  it("keeps counts from going below zero", async () => {
    const { author, postId, optionIds } = await pollInCommunity();
    authAs(author);
    await vote(postId, optionIds[0]);
    // A count out of step with the votes (say, edited by hand) can't go negative.
    await prisma.pollOption.updateMany({ where: { id: optionIds[0] }, data: { voteCount: 0 } });
    await vote(postId, optionIds[0]);
    expect(await counts(postId)).toEqual([0, 0, 0]);
  });

  it("hides other members' counts until you vote, but not the total", async () => {
    const { author, communityId, postId, optionIds } = await pollInCommunity();
    authAs(author);
    await vote(postId, optionIds[0]);

    const neighbour = await createTestUser();
    await joinCommunity(neighbour.userId, communityId);
    const before = await pollAsSeenBy(neighbour, communityId);
    expect(before.show_results).toBe(false);
    expect(before.total_votes).toBe(1);
    expect(before.options.every((o) => o.vote_count === null)).toBe(true);

    authAs(neighbour);
    await vote(postId, optionIds[1]);
    const after = await pollAsSeenBy(neighbour, communityId);
    expect(after.options.map((o) => o.vote_count)).toEqual([1, 1, 0]);
  });

  it("shows results to everyone when the author chose always", async () => {
    const { communityId } = await pollInCommunity({ results_visible: "always" });
    const neighbour = await createTestUser();
    await joinCommunity(neighbour.userId, communityId);
    const poll = await pollAsSeenBy(neighbour, communityId);
    expect(poll.show_results).toBe(true);
    expect(poll.options.map((o) => o.vote_count)).toEqual([0, 0, 0]);
  });

  it("holds results until close when the author chose that, then shows them", async () => {
    const { author, communityId, postId, optionIds } = await pollInCommunity({
      results_visible: "after_close",
      closes_in: "1d",
    });
    authAs(author);
    await vote(postId, optionIds[0]);
    expect((await pollAsSeenBy(author, communityId)).show_results).toBe(false);

    await prisma.poll.update({ where: { postId }, data: { closesAt: new Date(Date.now() - 1) } });
    const closed = await pollAsSeenBy(author, communityId);
    expect(closed.closed).toBe(true);
    expect(closed.options.map((o) => o.vote_count)).toEqual([1, 0, 0]);
  });

  it("refuses votes on a closed poll", async () => {
    const { author, postId, optionIds } = await pollInCommunity({ closes_in: "1d" });
    await prisma.poll.update({ where: { postId }, data: { closesAt: new Date(Date.now() - 1) } });
    authAs(author);
    const { status, body } = await vote(postId, optionIds[0]);
    expect(status).toBe(409);
    expect(body.error).toBe("This poll has closed.");
    expect(await prisma.pollVote.count()).toBe(0);
  });

  it("refuses a member of another community", async () => {
    const { postId, optionIds } = await pollInCommunity();
    const outsider = await createTestUser();
    authAs(outsider);
    const { status } = await vote(postId, optionIds[0]);
    expect(status).toBe(403);
    expect(await prisma.pollVote.count()).toBe(0);
  });

  it("refuses an option from a different poll", async () => {
    const first = await pollInCommunity();
    const second = await pollInCommunity();
    authAs(first.author);
    const { status } = await vote(first.postId, second.optionIds[0]);
    expect(status).toBe(400);
  });

  it("answers 404 for a post that isn't a poll", async () => {
    const author = await createTestUser();
    authAs(author);
    const post = await prisma.post.create({
      data: { authorId: author.userId, postType: "text", title: "Hi", content: "Hello" },
      select: { id: true },
    });
    const { status } = await vote(post.id, "00000000-0000-4000-8000-000000000000");
    expect(status).toBe(404);
  });
});
