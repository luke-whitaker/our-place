import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getAuthUser, requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import {
  createTestUser,
  createTestCommunity,
  joinCommunity,
  jsonRequest,
} from "@/test/route-helpers";
import { GET, POST } from "./route";

// Both getAuthUser (GET, works logged-out) and requireAuth (POST) read
// cookies via next/headers, which doesn't work outside a real Next request.
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn(), requireAuth: vi.fn() }));

const mockGetAuthUser = vi.mocked(getAuthUser);
const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockGetAuthUser.mockResolvedValue(user);
  mockRequireAuth.mockResolvedValue({ user });
}

async function createPost(communityId: string, body: Record<string, unknown>) {
  return POST(jsonRequest(`http://localhost/api/communities/${communityId}/posts`, body), {
    params: Promise.resolve({ id: communityId }),
  });
}

async function listPosts(communityId: string) {
  const request = new NextRequest(new URL(`http://localhost/api/communities/${communityId}/posts`));
  const res = await GET(request, { params: Promise.resolve({ id: communityId }) });
  return res.json();
}

describe("POST /api/communities/[id]/posts", () => {
  beforeEach(() => {
    mockGetAuthUser.mockReset();
    mockRequireAuth.mockReset();
  });

  it("persists the interaction control flags and returns them from the GET mapping", async () => {
    const user = await createTestUser();
    authAs(user);
    const communityId = await createTestCommunity(user.userId);
    await joinCommunity(user.userId, communityId);

    const createRes = await createPost(communityId, {
      post_type: "text",
      title: "Hello",
      content: "World",
      allow_reactions: false,
      allow_comments: false,
      allow_dislikes: true,
    });
    expect(createRes.status).toBe(201);

    const { posts } = await listPosts(communityId);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      allow_reactions: false,
      allow_comments: false,
      allow_dislikes: true,
      reaction_count: 0,
      dislike_count: 0,
    });
  });

  it("defaults interaction controls to reactions and comments on, dislikes off", async () => {
    const user = await createTestUser();
    authAs(user);
    const communityId = await createTestCommunity(user.userId);
    await joinCommunity(user.userId, communityId);

    await createPost(communityId, { post_type: "text", title: "Hello", content: "World" });

    const { posts } = await listPosts(communityId);
    expect(posts[0]).toMatchObject({
      allow_reactions: true,
      allow_comments: true,
      allow_dislikes: false,
    });
  });
});
