"use client";

import { useState } from "react";
import Link from "next/link";
import { Post } from "@/lib/types";
import { timeAgo } from "@/lib/time-utils";
import { useAuth } from "./AuthProvider";
import { PhotoGallery, VideoPlayer, RichContentRenderer, PostTypeBadge } from "./PostMedia";
import CommentSection from "./CommentSection";

export default function PostCard({
  post,
  showCommunity = true,
}: {
  post: Post;
  showCommunity?: boolean;
}) {
  const { user } = useAuth();
  const [reacted, setReacted] = useState(!!post.user_reaction);
  const [reactionCount, setReactionCount] = useState(post.reaction_count);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comment_count);

  const postType = post.post_type || "text";
  const media = post.media || [];

  async function toggleReaction() {
    if (!user) return;
    const res = await fetch(`/api/posts/${post.id}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "like" }),
    });
    const data = await res.json();
    if (res.ok) {
      setReacted(data.reacted);
      setReactionCount((prev) => (data.reacted ? prev + 1 : prev - 1));
    }
  }

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white transition-shadow hover:shadow-md">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white text-sm font-bold"
            style={{ backgroundColor: post.author_avatar_color || "#6366f1" }}
          >
            {post.author_name?.charAt(0).toUpperCase() || "?"}
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
            <h3 className="text-base font-semibold text-gray-900 leading-snug">{post.title}</h3>
          )}

          {postType === "text" && post.content && (
            <p className="mt-1.5 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
              {post.content}
            </p>
          )}

          {postType === "photo" && (
            <>
              <PhotoGallery media={media} />
              {post.content && (
                <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </p>
              )}
            </>
          )}

          {postType === "video" && (
            <>
              {media.length > 0 && <VideoPlayer media={media[0]} />}
              {post.content && (
                <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {post.content}
                </p>
              )}
            </>
          )}

          {postType === "rich" && <RichContentRenderer content={post.content} />}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-1 border-t border-gray-100 pt-3">
          <button
            onClick={toggleReaction}
            aria-label={reacted ? "Remove reaction" : "Like post"}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              reacted
                ? "bg-red-50 text-red-600"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
                ? "bg-indigo-50 text-indigo-600"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
        </div>
      </div>

      {showComments && (
        <CommentSection
          postId={post.id}
          onCommentAdded={() => setCommentCount((prev) => prev + 1)}
        />
      )}
    </article>
  );
}
