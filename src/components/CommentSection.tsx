"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, userMessage } from "@/lib/api-client";
import { Comment } from "@/lib/types";
import { timeAgo } from "@/lib/time-utils";
import { useAuth } from "./AuthProvider";

export default function CommentSection({
  postId,
  onCommentAdded,
  onCommentDeleted,
}: {
  postId: string;
  onCommentAdded: () => void;
  onCommentDeleted?: () => void;
}) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch<{ comments: Comment[] }>(`/api/posts/${postId}/comments`);
        if (!cancelled) setComments(data.comments || []);
      } catch (err) {
        if (!cancelled) setError(userMessage(err, "Could not load comments. Please try again."));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!commentText.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      setCommentText("");
      onCommentAdded();
      const data = await apiFetch<{ comments: Comment[] }>(`/api/posts/${postId}/comments`);
      setComments(data.comments || []);
    } catch (err) {
      setError(userMessage(err, "Could not post comment. Please try again."));
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteComment(commentId: string) {
    if (!window.confirm("Delete this comment?")) return;
    setError(null);
    try {
      await apiFetch(`/api/posts/${postId}/comments/${commentId}`, { method: "DELETE" });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      onCommentDeleted?.();
    } catch (err) {
      setError(userMessage(err, "Could not delete comment. Please try again."));
    }
  }

  return (
    <div className="border-t border-line-soft bg-surface-muted px-5 py-4">
      {error && (
        <div
          role="alert"
          className="mb-3 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600"
        >
          {error}
        </div>
      )}
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {comments.length > 0 ? (
            <div className="space-y-3 mb-4">
              {comments.map((comment) => (
                <div key={comment.id} className="flex gap-2.5">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-inverse text-xs font-bold"
                    style={{ backgroundColor: comment.author_avatar_color || "#6366f1" }}
                  >
                    {comment.author_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2 border border-line-soft">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/profile/${comment.author_username}`}
                        className="text-xs font-semibold text-ink hover:text-accent-600"
                      >
                        {comment.author_name}
                      </Link>
                      <span className="text-xs text-ink-faint">{timeAgo(comment.created_at)}</span>
                      {user && (user.id === comment.author_id || user.role === "admin") && (
                        <button
                          onClick={() => deleteComment(comment.id)}
                          aria-label="Delete comment"
                          className="ml-auto text-ink-faint transition-colors hover:text-red-600"
                        >
                          <svg
                            className="h-3.5 w-3.5"
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
                    <p className="mt-0.5 text-sm text-ink-tertiary">{comment.content}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mb-4 text-center text-sm text-ink-faint">
              No comments yet. Start the conversation!
            </p>
          )}

          {user && (
            <form onSubmit={submitComment} className="flex gap-2">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Write a comment..."
                className="flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-sm text-ink placeholder-ink-faint focus:border-accent-400 focus:outline-none focus:ring-1 focus:ring-accent-400"
              />
              <button
                type="submit"
                disabled={!commentText.trim() || submitting}
                className="rounded-xl bg-accent-500 px-4 py-2 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-600 disabled:opacity-50"
              >
                {submitting ? "..." : "Post"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
