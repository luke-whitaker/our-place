"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { Post } from "@/lib/types";
import { timeAgo } from "@/lib/time-utils";
import { useAuth } from "./AuthProvider";
import { PhotoGallery, VideoPlayer, RichContentRenderer, PostTypeBadge } from "./PostMedia";
import CommentSection from "./CommentSection";

export default function PostCard({
  post,
  showCommunity = true,
  onDeleted,
}: {
  post: Post;
  showCommunity?: boolean;
  onDeleted?: (postId: string) => void;
}) {
  const { user } = useAuth();
  const [reacted, setReacted] = useState(!!post.user_reaction);
  const [reactionCount, setReactionCount] = useState(post.reaction_count);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const postType = post.post_type || "text";
  const media = post.media || [];
  // The author can delete their own post; an admin can take down any post.
  const canDelete = !!user && (user.id === post.author_id || user.role === "admin");

  async function toggleReaction() {
    if (!user) return;
    try {
      const data = await apiFetch<{ reacted: boolean }>(`/api/posts/${post.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "like" }),
      });
      setReacted(data.reacted);
      setReactionCount((prev) => (data.reacted ? prev + 1 : prev - 1));
    } catch (err) {
      alert(userMessage(err, "Failed to react to post."));
    }
  }

  async function handleDelete() {
    if (!user || deleting) return;
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/posts/${post.id}`, { method: "DELETE" });
      setDeleted(true);
      onDeleted?.(post.id);
    } catch (err) {
      alert(userMessage(err, "Failed to delete post. Please try again."));
      setDeleting(false);
    }
  }

  if (deleted) return null;

  return (
    <article className="op-card overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-md">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Link
            href={`/profile/${post.author_username}`}
            aria-label={`Visit ${post.author_name}'s place`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-inverse text-sm font-bold"
            style={{ backgroundColor: post.author_avatar_color || "#6366f1" }}
          >
            {post.author_name?.charAt(0).toUpperCase() || "?"}
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/profile/${post.author_username}`}
                className="group flex items-center gap-2"
              >
                <span className="text-sm font-semibold text-ink group-hover:text-accent-600">
                  {post.author_name}
                </span>
                <span className="text-xs text-ink-faint">@{post.author_username}</span>
              </Link>
              <span className="text-xs text-ink-disabled">&middot;</span>
              <span className="text-xs text-ink-faint">{timeAgo(post.created_at)}</span>
              <PostTypeBadge postType={postType} />
            </div>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {showCommunity && post.community_name && post.community_slug && (
                <Link
                  href={`/communities/${post.community_slug}`}
                  className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-700"
                >
                  <span>{post.community_icon}</span>
                  <span>{post.community_name}</span>
                </Link>
              )}
              {!post.community_id && (
                <span className="inline-flex items-center gap-1 text-xs text-violet-600">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                    />
                  </svg>
                  My Place
                </span>
              )}
              {post.community_id && post.posted_to_profile === 1 && (
                <span className="inline-flex items-center gap-1 text-xs text-violet-500">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
                    />
                  </svg>
                  My Place
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="mt-3">
          {post.title && (
            <h3 className="text-base font-semibold text-ink leading-snug">{post.title}</h3>
          )}

          {postType === "text" && post.content && (
            <p className="mt-1.5 text-sm text-ink-tertiary leading-relaxed whitespace-pre-wrap">
              {post.content}
            </p>
          )}

          {postType === "photo" && (
            <>
              <PhotoGallery media={media} />
              {post.content && (
                <p className="mt-2 text-sm text-ink-tertiary leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </p>
              )}
            </>
          )}

          {postType === "video" && (
            <>
              {media.length > 0 && <VideoPlayer media={media[0]} />}
              {post.content && (
                <p className="mt-2 text-sm text-ink-tertiary leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </p>
              )}
            </>
          )}

          {postType === "rich" && <RichContentRenderer content={post.content} />}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-1 border-t border-line-soft pt-3">
          <button
            onClick={toggleReaction}
            aria-label={reacted ? "Remove reaction" : "Like post"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              reacted
                ? "bg-red-50 text-red-600"
                : "text-ink-muted hover:bg-surface-emphasis hover:text-ink-secondary"
            }`}
          >
            <svg
              className="h-4 w-4"
              fill={reacted ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
              />
            </svg>
            {reactionCount > 0 && <span>{reactionCount}</span>}
          </button>

          <button
            onClick={() => setShowComments(!showComments)}
            aria-label={showComments ? "Hide comments" : "Show comments"}
            aria-expanded={showComments}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              showComments
                ? "bg-accent-50 text-accent-600"
                : "text-ink-muted hover:bg-surface-emphasis hover:text-ink-secondary"
            }`}
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z"
              />
            </svg>
            {commentCount > 0 && <span>{commentCount}</span>}
          </button>

          {canDelete && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Delete post"
              title={user && user.id !== post.author_id ? "Delete post (admin)" : "Delete post"}
              className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {showComments && (
        <CommentSection
          postId={post.id}
          onCommentAdded={() => setCommentCount((prev) => prev + 1)}
          onCommentDeleted={() => setCommentCount((prev) => Math.max(0, prev - 1))}
        />
      )}
    </article>
  );
}
