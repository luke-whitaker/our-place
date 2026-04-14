import prisma from "./db";

interface PostWithId {
  id: string;
  [key: string]: unknown;
}

/**
 * Batch-loads media for an array of posts and attaches it to each post.
 * Uses a single query for efficiency.
 */
export async function enrichPostsWithMedia<T extends PostWithId>(posts: T[]): Promise<T[]> {
  if (posts.length === 0) return posts;

  const postIds = posts.map((p) => p.id);

  const media = await prisma.postMedia.findMany({
    where: { postId: { in: postIds } },
    orderBy: { sortOrder: "asc" },
  });

  const mediaByPost: Record<string, typeof media> = {};
  for (const m of media) {
    if (!mediaByPost[m.postId]) mediaByPost[m.postId] = [];
    mediaByPost[m.postId].push(m);
  }

  return posts.map((p) => ({
    ...p,
    media: mediaByPost[p.id] || [],
  }));
}
