'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Post, Comment } from '@/lib/types';
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
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`);
      const data = await res.json();
      setComments(data.comments || []);
    } catch {
      // ignore
    }
    setLoadingComments(false);
  }

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || submittingComment) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (res.ok) {
        setCommentText('');
        setCommentCount(prev => prev + 1);
        // Reload comments
        const res2 = await fetch(`/api/posts/${post.id}/comments`);
        const data = await res2.json();
        setComments(data.comments || []);
      }
    } catch {
      // ignore
    }
    setSubmittingComment(false);
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
              <span className="text-xs text-gray-300">·</span>
              <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
            </div>
            {showCommunity && post.community_name && (
              <Link
                href={`/communities/${post.community_slug}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 mt-0.5"
              >
                <span>{post.community_icon}</span>
                <span>{post.community_name}</span>
              </Link>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="mt-3">
          <h3 className="text-base font-semibold text-gray-900 leading-snug">{post.title}</h3>
          <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{post.content}</p>
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
