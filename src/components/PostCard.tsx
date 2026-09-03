"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { Post } from "@/lib/types";
import { timeAgo } from "@/lib/time-utils";
import { useAuth } from "./AuthProvider";
import { PhotoGallery, VideoPlayer, RichContentRenderer, PostTypeBadge } from "./PostMedia";
import CommentSection from "./CommentSection";
import PostActions from "./feed/PostActions";

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
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const postType = post.post_type || "text";
  const media = post.media || [];
  // The author can delete their own post; an admin can take down any post.
  const canDelete = !!user && (user.id === post.author_id || user.role === "admin");
  const isAdminDelete = !!user && user.id !== post.author_id;

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

        <PostActions
          post={post}
          loggedIn={!!user}
          showComments={showComments}
          onToggleComments={() => setShowComments(!showComments)}
          commentCount={commentCount}
          canDelete={canDelete}
          isAdminDelete={isAdminDelete}
          deleting={deleting}
          onDelete={handleDelete}
        />
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
