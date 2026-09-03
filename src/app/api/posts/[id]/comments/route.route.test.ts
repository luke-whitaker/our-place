import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import type { AuthPayload } from "@/lib/types";
import { createTestUser, createTestPost, jsonRequest } from "@/test/route-helpers";
import { POST } from "./route";

// getAuthUser reads cookies via next/headers, which doesn't work outside a
// real Next request — mock it to return a chosen user, matching the
// AuthPayload | null shape getAuthUser returns.
vi.mock("@/lib/auth", () => ({ getAuthUser: vi.fn() }));

const mockGetAuthUser = vi.mocked(getAuthUser);

function authAs(user: AuthPayload) {
  mockGetAuthUser.mockResolvedValue(user);
}

async function comment(postId: string, content: string) {
  return POST(jsonRequest(`http://localhost/api/posts/${postId}/comments`, { content }), {
    params: Promise.resolve({ id: postId }),
  });
}

describe("POST /api/posts/[id]/comments", () => {
  beforeEach(() => {
    mockGetAuthUser.mockReset();
  });

  it("returns 403 when the post has comments turned off", async () => {
    const user = await createTestUser();
    authAs(user);
    const postId = await createTestPost({ authorId: user.userId, allowComments: false });

    const res = await comment(postId, "Great post!");
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("The author turned off comments for this post.");
  });

  it("adds a comment and increments the post's comment count", async () => {
    const user = await createTestUser();
    authAs(user);
    const postId = await createTestPost({ authorId: user.userId });

    const res = await comment(postId, "Great post!");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe("Comment added!");
    expect(body.commentId).toBeTruthy();

    const updated = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      select: { commentCount: true },
    });
    expect(updated.commentCount).toBe(1);
  });

  it("returns 404 for a post that doesn't exist", async () => {
    const user = await createTestUser();
    authAs(user);

    const res = await comment("00000000-0000-0000-0000-000000000000", "Hello?");
    expect(res.status).toBe(404);
  });
});
