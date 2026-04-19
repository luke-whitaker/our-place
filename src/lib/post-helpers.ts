import prisma from "./db";

interface PostWithId {
  id: string;
  [key: string]: unknown;
}

interface MediaItem {
  media_type?: string;
  media_source?: string;
  url: string;
  filename?: string | null;
  file_size?: number | null;
}

export function validatePostContent(
  postType: string,
  title: string,
  content: string,
  media: MediaItem[],
): { valid: true } | { valid: false; error: string } {
  if (postType === "text") {
    if (!title) return { valid: false, error: "Title is required for text posts." };
    if (!content) return { valid: false, error: "Content is required for text posts." };
  }

  if (postType === "photo") {
    if (!media.length)
      return { valid: false, error: "At least one image is required for photo posts." };
    if (media.length > 10) return { valid: false, error: "Maximum 10 images per post." };
  }

  if (postType === "video") {
    if (!media.length) return { valid: false, error: "A video is required for video posts." };
    if (media.length > 1) return { valid: false, error: "Only one video per post." };
  }

  if (postType === "rich") {
    if (!title) return { valid: false, error: "Title is required for rich posts." };
    if (!content) return { valid: false, error: "Content is required for rich posts." };
    try {
      const blocks = JSON.parse(content);
      if (!Array.isArray(blocks) || blocks.length === 0) {
        return { valid: false, error: "Rich content must have at least one block." };
      }
    } catch {
      return { valid: false, error: "Invalid rich content format." };
    }
  }

  return { valid: true };
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
