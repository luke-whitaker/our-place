import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import prisma from "@/lib/db";
import type { AuthPayload } from "@/lib/types";

/** Creates a throwaway user row and returns the AuthPayload shape requireAuth/getAuthUser return. */
export async function createTestUser(
  overrides: Partial<{ username: string; displayName: string; email: string; role: string }> = {},
): Promise<AuthPayload> {
  const suffix = uuidv4().slice(0, 8);
  const user = await prisma.user.create({
    data: {
      username: overrides.username ?? `user_${suffix}`,
      displayName: overrides.displayName ?? `Test User ${suffix}`,
      email: overrides.email ?? `user_${suffix}@example.test`,
      passwordHash: "route-test-not-a-real-hash",
      role: overrides.role ?? "user",
    },
    select: { id: true, username: true, isVerified: true, role: true },
  });
  return {
    userId: user.id,
    username: user.username,
    is_verified: user.isVerified ? 1 : 0,
    role: user.role,
  };
}

export async function createTestCommunity(creatorId: string): Promise<string> {
  const suffix = uuidv4().slice(0, 8);
  const community = await prisma.community.create({
    data: {
      name: `Test Community ${suffix}`,
      slug: `test-community-${suffix}`,
      description: "A community created for route tests.",
      category: "General",
      creatorId,
    },
    select: { id: true },
  });
  return community.id;
}

export async function joinCommunity(userId: string, communityId: string): Promise<void> {
  await prisma.communityMember.create({ data: { userId, communityId } });
}

/** Creates a post with explicit interaction-control defaults, for route tests to exercise. */
export async function createTestPost(overrides: {
  authorId: string;
  communityId?: string | null;
  allowReactions?: boolean;
  allowComments?: boolean;
  allowDislikes?: boolean;
}): Promise<string> {
  const post = await prisma.post.create({
    data: {
      authorId: overrides.authorId,
      communityId: overrides.communityId ?? null,
      postType: "text",
      title: "Test post",
      content: "Test content",
      allowReactions: overrides.allowReactions ?? true,
      allowComments: overrides.allowComments ?? true,
      allowDislikes: overrides.allowDislikes ?? false,
    },
    select: { id: true },
  });
  return post.id;
}

/** Builds a NextRequest with a JSON body, the shape every route handler under test expects. */
export function jsonRequest(url: string, body: unknown, method = "POST"): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
