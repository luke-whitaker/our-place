import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("POST /api/communities/[id]/posts media links", () => {
  const uploadBase = "https://media.example.test";

  beforeEach(() => {
    mockGetAuthUser.mockReset();
    mockRequireAuth.mockReset();
    vi.stubEnv("R2_PUBLIC_BASE_URL", uploadBase);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  async function memberOfNewCommunity() {
    const user = await createTestUser();
    authAs(user);
    const communityId = await createTestCommunity(user.userId);
    await joinCommunity(user.userId, communityId);
    return communityId;
  }

  it("accepts an uploaded photo and a YouTube video", async () => {
    const communityId = await memberOfNewCommunity();
    const photo = await createPost(communityId, {
      post_type: "photo",
      media: [{ url: `${uploadBase}/images/a.jpg`, media_source: "upload" }],
    });
    expect(photo.status).toBe(201);
    const video = await createPost(communityId, {
      post_type: "video",
      media: [{ url: "https://youtu.be/dQw4w9WgXcQ", media_source: "youtube" }],
    });
    expect(video.status).toBe(201);
  });

  it("refuses media hosted anywhere else", async () => {
    const communityId = await memberOfNewCommunity();
    const res = await createPost(communityId, {
      post_type: "photo",
      media: [{ url: "https://tracker.example.com/pixel.gif" }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Media must be uploaded here or linked from YouTube or Vimeo.",
    );
  });

  it("refuses more than 10 media items", async () => {
    const communityId = await memberOfNewCommunity();
    const media = Array.from({ length: 11 }, (_, i) => ({ url: `${uploadBase}/images/${i}.jpg` }));
    const res = await createPost(communityId, { post_type: "photo", media });
    expect(res.status).toBe(400);
  });

  it("refuses a rich post whose image block points elsewhere", async () => {
    const communityId = await memberOfNewCommunity();
    const res = await createPost(communityId, {
      post_type: "rich",
      title: "Rich",
      content: JSON.stringify([{ type: "image", url: "https://tracker.example.com/a.png" }]),
    });
    expect(res.status).toBe(400);
  });
});
