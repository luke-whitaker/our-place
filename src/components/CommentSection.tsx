"use client";

import { useState, useEffect } from "react";
import { Comment } from "@/lib/types";
import { timeAgo } from "@/lib/time-utils";
import { useAuth } from "./AuthProvider";

export default function CommentSection({
  postId,
  onCommentAdded,
}: {
  postId: string;
  onCommentAdded: () => void;
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
        const res = await fetch(`/api/posts/${postId}/comments`);
        if (!res.ok) throw new Error("Failed to load comments");
        const data = await res.json();
        if (!cancelled) setComments(data.comments || []);
      } catch (err) {
        console.error("Failed to load comments:", err);
        if (!cancelled) setError("Could not load comments. Please try again.");
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
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: commentText.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to post comment.");
        return;
      }
      setCommentText("");
      onCommentAdded();
      const res2 = await fetch(`/api/posts/${postId}/comments`);
      const data = await res2.json();
      setComments(data.comments || []);
    } catch (err) {
      console.error("Failed to post comment:", err);
      setError("Could not post comment. Please try again.");
    } finally {
      setSubmitting(false);
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
                      <span className="text-xs font-semibold text-ink">{comment.author_name}</span>
                      <span className="text-xs text-ink-faint">{timeAgo(comment.created_at)}</span>
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
