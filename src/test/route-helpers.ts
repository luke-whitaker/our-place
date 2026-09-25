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

/** Creates an item row directly (bypassing the NPC gift/tear/mailbox
 * flows), for route tests that need pockets or a mailbox pre-populated.
 * `slot: null` (the default) puts it outside any location, matching the
 * schema's "reserved storage" case. `location` defaults to "pocket", like
 * the schema column. */
export async function createTestItem(overrides: {
  ownerId: string;
  kind: string;
  location?: string;
  slot?: number | null;
  body?: string | null;
  fromId?: string | null;
  placedAt?: Date | null;
}): Promise<string> {
  const item = await prisma.item.create({
    data: {
      id: uuidv4(),
      ownerId: overrides.ownerId,
      kind: overrides.kind,
      location: overrides.location ?? "pocket",
      slot: overrides.slot ?? null,
      body: overrides.body ?? null,
      fromId: overrides.fromId ?? null,
      placedAt: overrides.placedAt ?? null,
    },
    select: { id: true },
  });
  return item.id;
}

/** Leaves a letter directly in `ownerId`'s mailbox at `slot`, bypassing
 * POST /api/users/[username]/mailbox, for route tests that need a mailbox
 * pre-populated. */
export async function createTestLetter(overrides: {
  ownerId: string;
  slot: number;
  fromId?: string | null;
  body?: string | null;
}): Promise<string> {
  return createTestItem({
    ownerId: overrides.ownerId,
    kind: "note",
    location: "mailbox",
    slot: overrides.slot,
    body: overrides.body ?? "A letter.",
    fromId: overrides.fromId ?? null,
    placedAt: new Date(),
  });
}

/** Gives `ownerId` the Notebook directly, the way a real gift from Gnomie
 * would land it, without going through the talk route. */
export async function giveTestNotebook(ownerId: string, slot = 0): Promise<string> {
  return createTestItem({ ownerId, kind: "notebook", slot });
}

/** Creates a notebook draft directly, for route tests that need drafts
 * pre-populated without going through POST /api/notebook/pages. */
export async function createTestNotebookPage(overrides: {
  ownerId: string;
  page: number;
  body?: string;
}): Promise<string> {
  const page = await prisma.notebookPage.create({
    data: {
      id: uuidv4(),
      ownerId: overrides.ownerId,
      page: overrides.page,
      body: overrides.body ?? "A draft.",
    },
    select: { id: true },
  });
  return page.id;
}
