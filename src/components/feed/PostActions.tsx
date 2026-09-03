"use client";

import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { Post } from "@/lib/types";

interface ReactionResponse {
  reacted: boolean;
  type: string | null;
  reaction_count: number;
  dislike_count: number;
}

// The like/dislike/comment/delete row under a post. Split out of PostCard
// because it owns its own reaction state and API call, on top of the
// author's per-post allow_reactions/allow_dislikes/allow_comments choices.
export default function PostActions({
  post,
  loggedIn,
  showComments,
  onToggleComments,
  commentCount,
  canDelete,
  isAdminDelete,
  deleting,
  onDelete,
}: {
  post: Post;
  loggedIn: boolean;
  showComments: boolean;
  onToggleComments: () => void;
  commentCount: number;
  canDelete: boolean;
  isAdminDelete: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  const [reactionCount, setReactionCount] = useState(post.reaction_count);
  const [dislikeCount, setDislikeCount] = useState(post.dislike_count);
  const [userReaction, setUserReaction] = useState<string | null>(post.user_reaction ?? null);

  // Reads reaction_count and dislike_count back from the response rather than
  // guessing with +1/-1 — a switch moves a count between the two counters,
  // which a purely local increment/decrement can't express correctly.
  async function react(type: "like" | "dislike") {
    if (!loggedIn) return;
    try {
      const data = await apiFetch<ReactionResponse>(`/api/posts/${post.id}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      setUserReaction(data.type);
      setReactionCount(data.reaction_count);
      setDislikeCount(data.dislike_count);
    } catch (err) {
      alert(userMessage(err, "Failed to react to post."));
    }
  }

  const liked = userReaction === "like";
  const disliked = userReaction === "dislike";

  return (
    <div className="mt-4 flex items-center gap-1 border-t border-line-soft pt-3">
      {post.allow_reactions && (
        <button
          onClick={() => react("like")}
          aria-label={liked ? "Remove like" : "Like post"}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
            liked
              ? "bg-red-50 text-red-600"
              : "text-ink-muted hover:bg-surface-emphasis hover:text-ink-secondary"
          }`}
        >
          <svg
            className="h-4 w-4"
            fill={liked ? "currentColor" : "none"}
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
      )}

      {post.allow_reactions && post.allow_dislikes && (
        <button
          onClick={() => react("dislike")}
          aria-label={disliked ? "Remove dislike" : "Dislike post"}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
            disliked
              ? "bg-slate-200 text-slate-700"
              : "text-ink-muted hover:bg-surface-emphasis hover:text-ink-secondary"
          }`}
        >
          <svg
            className="h-4 w-4 -scale-y-100"
            fill={disliked ? "currentColor" : "none"}
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 0 1 2.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 0 0 .322-1.672V3a.75.75 0 0 1 .75-.75 2.25 2.25 0 0 1 2.25 2.25c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 0 1-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 0 0-1.423-.23H5.904M6.633 10.5H4.575c-.483 0-.874.391-.874.874v9.253c0 .482.391.873.874.873h1.958a.75.75 0 0 0 .75-.75V11.25a.75.75 0 0 0-.75-.75Z"
            />
          </svg>
          {dislikeCount > 0 && <span>{dislikeCount}</span>}
        </button>
      )}

      {post.allow_comments ? (
        <button
          onClick={onToggleComments}
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
      ) : (
        <span className="px-3 py-1.5 text-sm text-ink-faint">Comments off</span>
      )}

      {canDelete && (
        <button
          onClick={onDelete}
          disabled={deleting}
          aria-label="Delete post"
          title={isAdminDelete ? "Delete post (admin)" : "Delete post"}
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
  );
}
