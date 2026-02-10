'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Post, PostMedia, Comment, RichContentBlock } from '@/lib/types';
import { parseVideoUrl } from '@/lib/media-utils';
import { useAuth } from './AuthProvider';

function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString + 'Z').getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateString).toLocaleDateString();
}

// ── Photo Gallery ──
function PhotoGallery({ media }: { media: PostMedia[] }) {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const images = media.filter(m => m.media_type === 'image');
  if (images.length === 0) return null;

  const count = images.length;

  return (
    <>
      <div className="mt-3 overflow-hidden rounded-xl">
        {count === 1 && (
          <button type="button" onClick={() => setLightboxIdx(0)} className="block w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[0].url}
              alt=""
              className="w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]"
              style={{ maxHeight: '400px' }}
            />
          </button>
        )}

        {count === 2 && (
          <div className="grid grid-cols-2 gap-0.5">
            {images.map((img, i) => (
              <button key={img.id} type="button" onClick={() => setLightboxIdx(i)} className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="aspect-square w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]" />
              </button>
            ))}
          </div>
        )}

        {count === 3 && (
          <div className="grid grid-cols-2 gap-0.5" style={{ height: '300px' }}>
            <button type="button" onClick={() => setLightboxIdx(0)} className="row-span-2 block h-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[0].url} alt="" className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]" />
            </button>
            <button type="button" onClick={() => setLightboxIdx(1)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[1].url} alt="" className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]" />
            </button>
            <button type="button" onClick={() => setLightboxIdx(2)} className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={images[2].url} alt="" className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]" />
            </button>
          </div>
        )}

        {count >= 4 && (
          <div className="grid grid-cols-2 gap-0.5" style={{ height: '300px' }}>
            {images.slice(0, 4).map((img, i) => (
              <button key={img.id} type="button" onClick={() => setLightboxIdx(i)} className="relative block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-full w-full object-cover cursor-pointer transition-transform hover:scale-[1.02]" />
                {i === 3 && count > 4 && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <span className="text-2xl font-bold text-white">+{count - 4}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[lightboxIdx].url}
              alt=""
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            />

            {/* Close */}
            <button
              type="button"
              onClick={() => setLightboxIdx(null)}
              className="absolute -right-2 -top-2 rounded-full bg-white p-1.5 shadow-lg hover:bg-gray-100"
            >
              <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Prev / Next */}
            {images.length > 1 && (
              <>
                {lightboxIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(lightboxIdx - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white"
                  >
                    <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                )}
                {lightboxIdx < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(lightboxIdx + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-2 shadow hover:bg-white"
                  >
                    <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                )}
              </>
            )}

            {/* Counter */}
            {images.length > 1 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                {lightboxIdx + 1} / {images.length}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Video Player ──
function VideoPlayer({ media }: { media: PostMedia }) {
  if (media.media_source === 'youtube' || media.media_source === 'vimeo') {
    const parsed = parseVideoUrl(media.url);
    if (!parsed) return null;
    return (
      <div className="mt-3 aspect-video overflow-hidden rounded-xl">
        <iframe
          src={parsed.embedUrl}
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  // Uploaded video
  return (
    <div className="mt-3 overflow-hidden rounded-xl">
      <video src={media.url} controls className="w-full" style={{ maxHeight: '400px' }} />
    </div>
  );
}

// ── Rich Content Renderer ──
function RichContentRenderer({ content }: { content: string }) {
  let blocks: RichContentBlock[];
  try {
    blocks = JSON.parse(content);
    if (!Array.isArray(blocks)) return <p className="text-sm text-gray-600">{content}</p>;
  } catch {
    // Fallback: render as plain text (for backwards compat)
    return <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{content}</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {blocks.map((block, idx) => {
        if (block.type === 'text' && block.content) {
          return (
            <p key={idx} className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {block.content}
            </p>
          );
        }
        if (block.type === 'image' && block.url) {
          return (
            <div key={idx} className="overflow-hidden rounded-xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={block.url}
                alt={block.alt || ''}
                className="w-full object-cover"
                style={{ maxHeight: '400px' }}
              />
              {block.alt && (
                <p className="mt-1 text-xs text-gray-400 italic">{block.alt}</p>
              )}
            </div>
          );
        }
        if (block.type === 'video' && block.url) {
          if (block.media_source === 'youtube' || block.media_source === 'vimeo') {
            const parsed = parseVideoUrl(block.url);
            if (parsed) {
              return (
                <div key={idx} className="aspect-video overflow-hidden rounded-xl">
                  <iframe
                    src={parsed.embedUrl}
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              );
            }
          }
          return (
            <div key={idx} className="overflow-hidden rounded-xl">
              <video src={block.url} controls className="w-full" style={{ maxHeight: '400px' }} />
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

// ── Post Type Badge ──
function PostTypeBadge({ postType }: { postType: string }) {
  if (postType === 'text' || !postType) return null;

  const config: Record<string, { label: string; color: string }> = {
    photo: { label: 'Photo', color: 'bg-emerald-50 text-emerald-600' },
    video: { label: 'Video', color: 'bg-purple-50 text-purple-600' },
    rich: { label: 'Rich', color: 'bg-amber-50 text-amber-600' },
  };

  const c = config[postType];
  if (!c) return null;

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.color}`}>
      {c.label}
    </span>
  );
}

// ── Main PostCard ──
export default function PostCard({ post, showCommunity = true }: { post: Post; showCommunity?: boolean }) {
  const { user } = useAuth();
  const [reacted, setReacted] = useState(!!post.user_reaction);
  const [reactionCount, setReactionCount] = useState(post.reaction_count);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [loadingComments, setLoadingComments] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  const postType = post.post_type || 'text';
  const media = post.media || [];

  async function toggleReaction() {
    if (!user) return;
    const res = await fetch(`/api/posts/${post.id}/reactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'like' }),
    });
    const data = await res.json();
    if (res.ok) {
      setReacted(data.reacted);
      setReactionCount(prev => data.reacted ? prev + 1 : prev - 1);
    }
  }

  async function loadComments() {
    if (showComments) {
      setShowComments(false);
      return;
    }
    setShowComments(true);
    setLoadingComments(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`);
      if (!res.ok) throw new Error('Failed to load comments');
      const data = await res.json();
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
      setCommentError('Could not load comments. Please try again.');
    }
    setLoadingComments(false);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCommentError(data.error || 'Failed to post comment.');
        return;
      }
      setCommentText('');
      setCommentCount(prev => prev + 1);
      const res2 = await fetch(`/api/posts/${post.id}/comments`);
      const data = await res2.json();
      setComments(data.comments || []);
    } catch (err) {
      console.error('Failed to post comment:', err);
      setCommentError('Could not post comment. Please try again.');
    } finally {
      setSubmittingComment(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold"
            style={{ backgroundColor: post.author_avatar_color || '#6366f1' }}
          >
            {post.author_name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{post.author_name}</span>
              <span className="text-xs text-gray-400">@{post.author_username}</span>
              <span className="text-xs text-gray-300">&middot;</span>
              <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
              <PostTypeBadge postType={postType} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {showCommunity && post.community_name && post.community_slug && (
                <Link
                  href={`/communities/${post.community_slug}`}
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                >
                  <span>{post.community_icon}</span>
                  <span>{post.community_name}</span>
                </Link>
              )}
              {!post.community_id && (
                <span className="inline-flex items-center gap-1 text-xs text-violet-600">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                  My Place
                </span>
              )}
              {post.community_id && post.posted_to_profile === 1 && (
                <span className="inline-flex items-center gap-1 text-xs text-violet-500">
                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                  </svg>
                  My Place
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content — varies by post type */}
        <div className="mt-3">
          {/* Title (shown for all types if present) */}
          {post.title && (
            <h3 className="text-base font-semibold text-gray-900 leading-snug">{post.title}</h3>
          )}

          {/* Text Post */}
          {postType === 'text' && post.content && (
            <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>
          )}

          {/* Photo Post */}
          {postType === 'photo' && (
            <>
              <PhotoGallery media={media} />
              {post.content && (
                <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>
              )}
            </>
          )}

          {/* Video Post */}
          {postType === 'video' && (
            <>
              {media.length > 0 && <VideoPlayer media={media[0]} />}
              {post.content && (
                <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>
              )}
            </>
          )}

          {/* Rich Post */}
          {postType === 'rich' && (
            <RichContentRenderer content={post.content} />
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-1 border-t border-gray-100 pt-3">
          <button
            onClick={toggleReaction}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              reacted
                ? 'bg-red-50 text-red-600'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <svg className="h-4 w-4" fill={reacted ? 'currentColor' : 'none'} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
            {reactionCount > 0 && <span>{reactionCount}</span>}
          </button>

          <button
            onClick={loadComments}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              showComments
                ? 'bg-indigo-50 text-indigo-600'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z" />
            </svg>
            {commentCount > 0 && <span>{commentCount}</span>}
          </button>
        </div>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
          {commentError && (
            <div className="mb-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
              {commentError}
            </div>
          )}
          {loadingComments ? (
            <div className="flex justify-center py-4">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {comments.length > 0 ? (
                <div className="space-y-3 mb-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex gap-2.5">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                        style={{ backgroundColor: comment.author_avatar_color || '#6366f1' }}
                      >
                        {comment.author_name?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0 flex-1 rounded-xl bg-white px-3 py-2 border border-gray-100">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900">{comment.author_name}</span>
                          <span className="text-xs text-gray-400">{timeAgo(comment.created_at)}</span>
                        </div>
                        <p className="mt-0.5 text-sm text-gray-600">{comment.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mb-4 text-center text-sm text-gray-400">No comments yet. Start the conversation!</p>
              )}

              {user && (
                <form onSubmit={submitComment} className="flex gap-2">
                  <input
                    type="text"
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Write a comment..."
                    className="flex-1 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim() || submittingComment}
                    className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-600 disabled:opacity-50"
                  >
                    {submittingComment ? '...' : 'Post'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </article>
  );
}
