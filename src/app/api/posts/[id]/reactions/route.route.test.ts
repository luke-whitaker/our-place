import { describe, it, expect, vi, beforeEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, createTestPost, jsonRequest } from "@/test/route-helpers";
import { POST } from "./route";

// requireAuth reads cookies via next/headers, which doesn't work outside a
// real Next request — every route test mocks it to return a chosen user
// instead, matching the { user } | { error } shape requireAuth returns.
vi.mock("@/lib/auth", () => ({ requireAuth: vi.fn() }));

const mockRequireAuth = vi.mocked(requireAuth);

function authAs(user: AuthPayload) {
  mockRequireAuth.mockResolvedValue({ user });
}

async function react(postId: string, type: string) {
  return POST(jsonRequest(`http://localhost/api/posts/${postId}/reactions`, { type }), {
    params: Promise.resolve({ id: postId }),
  });
}

describe("POST /api/posts/[id]/reactions", () => {
  beforeEach(() => {
    mockRequireAuth.mockReset();
  });

  it("toggles a like on and off", async () => {
    const user = await createTestUser();
    authAs(user);
    const postId = await createTestPost({ authorId: user.userId });

    const onRes = await react(postId, "like");
    expect(onRes.status).toBe(200);
    const onBody = await onRes.json();
    expect(onBody).toMatchObject({
      reacted: true,
      type: "like",
      reaction_count: 1,
      dislike_count: 0,
    });

    const offRes = await react(postId, "like");
    const offBody = await offRes.json();
    expect(offBody).toMatchObject({
      reacted: false,
      type: null,
      reaction_count: 0,
      dislike_count: 0,
    });
  });

  it("blocks a dislike with 403 when the post hasn't enabled dislikes", async () => {
    const user = await createTestUser();
    authAs(user);
    const postId = await createTestPost({ authorId: user.userId, allowDislikes: false });

    const res = await react(postId, "dislike");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("The author hasn't enabled dislikes on this post.");
  });

  it("switches from like to dislike and adjusts both counters", async () => {
    const user = await createTestUser();
    authAs(user);
    const postId = await createTestPost({ authorId: user.userId, allowDislikes: true });

    await react(postId, "like");
    const switchRes = await react(postId, "dislike");
    const switchBody = await switchRes.json();
    expect(switchBody).toMatchObject({
      reacted: true,
      type: "dislike",
      reaction_count: 0,
      dislike_count: 1,
    });
  });

  it("returns 403 when the post has turned off reactions", async () => {
    const user = await createTestUser();
    authAs(user);
    const postId = await createTestPost({ authorId: user.userId, allowReactions: false });

    const res = await react(postId, "like");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("The author turned off reactions for this post.");
  });

  it("returns 404 for a post that doesn't exist", async () => {
    const user = await createTestUser();
    authAs(user);

    const res = await react(uuidv4(), "like");
    expect(res.status).toBe(404);
  });

  it("never lets a counter go negative even if it was already at zero", async () => {
    const user = await createTestUser();
    authAs(user);
    const postId = await createTestPost({ authorId: user.userId });

    await react(postId, "like");
    // Simulate counter drift (a manual edit, a bug in an earlier version)
    // that leaves an existing reaction row but a zeroed counter.
    await prisma.post.update({ where: { id: postId }, data: { reactionCount: 0 } });

    const res = await react(postId, "like");
    const body = await res.json();
    expect(body.reaction_count).toBe(0);
  });
});
