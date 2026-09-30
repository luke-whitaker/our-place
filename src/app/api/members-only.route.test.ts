import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  createTestUser,
  createTestCommunity,
  joinCommunity,
  createTestPost,
} from "@/test/route-helpers";
import { GET as listCommunities } from "./communities/route";
import { GET as getCommunity } from "./communities/[id]/route";
import { GET as listCommunityPosts } from "./communities/[id]/posts/route";
import { GET as listComments } from "./posts/[id]/comments/route";

// Every piece of content on Our Place needs an account to see. These are the
// reads that once answered logged-out visitors; each must now refuse them
// before touching the database, and still serve a member.
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function loggedOut() {
  // A fresh Response per call: a body can only be read once.
  mockRequireAuth.mockImplementation(async () => ({
    error: NextResponse.json({ error: "Not authenticated." }, { status: 401 }),
  }));
}

function get(path: string) {
  return new NextRequest(new URL(`http://localhost${path}`));
}

async function seed() {
  const member = await createTestUser();
  const communityId = await createTestCommunity(member.userId);
  await joinCommunity(member.userId, communityId);
  const postId = await createTestPost({ authorId: member.userId, communityId });
  return { member, communityId, postId };
}

describe("content reads are members only", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("refuses a logged-out visitor on every content read", async () => {
    const { communityId, postId } = await seed();
    loggedOut();
    const params = (id: string) => ({ params: Promise.resolve({ id }) });

    const responses = await Promise.all([
      listCommunities(get("/api/communities")),
      getCommunity(get(`/api/communities/${communityId}`), params(communityId)),
      listCommunityPosts(get(`/api/communities/${communityId}/posts`), params(communityId)),
      listComments(get(`/api/posts/${postId}/comments`), params(postId)),
    ]);

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(JSON.stringify(await res.json())).not.toContain(communityId);
    }
  });

  it("still serves a signed-in member", async () => {
    const { member, communityId, postId } = await seed();
    mockRequireAuth.mockResolvedValue({ user: member });
    const params = (id: string) => ({ params: Promise.resolve({ id }) });

    const list = await (await listCommunities(get("/api/communities"))).json();
    expect(list.communities.map((c: { id: string }) => c.id)).toContain(communityId);
    expect(list.communities[0].is_member).toBe(1);

    const detail = await (
      await getCommunity(get(`/api/communities/${communityId}`), params(communityId))
    ).json();
    expect(detail.membership.user_id).toBe(member.userId);

    const posts = await (
      await listCommunityPosts(get(`/api/communities/${communityId}/posts`), params(communityId))
    ).json();
    expect(posts.posts.map((p: { id: string }) => p.id)).toEqual([postId]);

    const comments = await listComments(get(`/api/posts/${postId}/comments`), params(postId));
    expect(comments.status).toBe(200);
  });
});
