import Database from 'better-sqlite3';
import { Post, PostMedia } from './types';

/**
 * Batch-loads media for an array of posts and attaches it to each post.
 * Uses a single query for efficiency.
 */
export function enrichPostsWithMedia(db: Database.Database, posts: Post[]): Post[] {
  if (posts.length === 0) return posts;

  const postIds = posts.map(p => p.id);
  const placeholders = postIds.map(() => '?').join(',');

  const media = db.prepare(
    `SELECT * FROM post_media WHERE post_id IN (${placeholders}) ORDER BY sort_order ASC`
  ).all(...postIds) as PostMedia[];

  const mediaByPost: Record<string, PostMedia[]> = {};
  for (const m of media) {
    if (!mediaByPost[m.post_id]) mediaByPost[m.post_id] = [];
    mediaByPost[m.post_id].push(m);
  }

  return posts.map(p => ({
    ...p,
    media: mediaByPost[p.id] || [],
  }));
}
