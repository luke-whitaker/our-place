"use client";

import type { PollWire } from "@/lib/types";
import { useState } from "react";
import { apiFetch, userMessage } from "@/lib/api-client";
import { pollFooter, pollHint, pollPercent } from "@/lib/poll-display";

/**
 * A poll in a post. Options are buttons until results show, then bars with
 * their share; the member's own choice is marked either way and tapping it
 * again takes the vote back. A closed poll is read-only.
 */
export default function PollCard({ postId, initial }: { postId: string; initial: PollWire }) {
  const [poll, setPoll] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Read once when the card mounts: "closes in 2 days" needn't tick live.
  const [mountedAt] = useState(() => Date.now());

  async function vote(optionId: string) {
    if (saving || poll.closed) return;
    setSaving(true);
    setError("");
    try {
      const data = await apiFetch<{ poll: PollWire }>(`/api/posts/${postId}/poll/votes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: optionId }),
      });
      setPoll(data.poll);
    } catch (err) {
      setError(userMessage(err, "Couldn't save your vote. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  const hint = pollHint(poll);
  return (
    <div className="mt-3 space-y-2">
      {poll.multiple_choice && !poll.closed && (
        <p className="text-xs text-ink-faint">Pick as many as you like.</p>
      )}
      {poll.options.map((option) => {
        const percent =
          option.vote_count === null ? null : pollPercent(option.vote_count, poll.total_votes);
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => vote(option.id)}
            disabled={saving || poll.closed}
            aria-pressed={option.voted}
            className={`relative w-full overflow-hidden rounded-xl border px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-default ${
              option.voted
                ? "border-accent-400 text-ink"
                : "border-line text-ink-secondary enabled:hover:border-accent-300"
            }`}
          >
            {percent !== null && (
              <span
                aria-hidden
                className={`absolute inset-y-0 left-0 ${option.voted ? "bg-accent-100" : "bg-surface-emphasis"}`}
                style={{ width: `${percent}%` }}
              />
            )}
            <span className="relative flex items-center justify-between gap-3">
              <span className="font-medium">
                {option.voted && <span aria-hidden>✓ </span>}
                {option.label}
              </span>
              {percent !== null && (
                <span className="shrink-0 text-xs text-ink-tertiary">
                  {percent}% · {option.vote_count}
                </span>
              )}
            </span>
          </button>
        );
      })}
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-faint">
        {pollFooter(poll, mountedAt)}
        {hint && ` · ${hint}`}
      </p>
    </div>
  );
}
